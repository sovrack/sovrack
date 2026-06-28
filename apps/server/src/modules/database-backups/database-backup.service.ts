import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BackupStatus,
  BackupTrigger,
  ContainerStatus,
  DatabaseBackup,
  Role,
} from '@prisma/client';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { PrismaService } from '../../shared/database/prisma.service';
import { DockerApiService } from '../../adapters/container-runtime/docker-api.service';
import { PlatformService } from '../platform/platform.service';
import { BackupStorageService } from './backup-storage.service';
import { dumpSpec, restoreSpec } from './backup-commands.util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Retention defaults (overridable via PlatformConfig). Keep the N most recent
// backups always; beyond that, prune anything older than maxAge days.
const DEFAULT_RETENTION_KEEP_LAST = 7;
const DEFAULT_RETENTION_MAX_AGE_DAYS = 30;

/**
 * Produces logical backups of managed-database ServiceEnvironments by running
 * the engine's native dump tool inside the running container (via the Docker
 * API) and storing the dump on the backend host. REDIS/RABBITMQ have no
 * portable logical dump and are rejected.
 */
@Injectable()
export class DatabaseBackupService {
  private readonly logger = new Logger(DatabaseBackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly storage: BackupStorageService,
    private readonly platform: PlatformService,
  ) {}

  /** Daily scheduled backup of every active managed database. */
  @Cron('0 2 * * *')
  async runScheduledBackups(): Promise<void> {
    const envs = await this.prisma.serviceEnvironment.findMany({
      where: {
        archivedAt: null,
        service: { databaseType: { not: null } },
      },
      select: { id: true, service: { select: { databaseType: true } } },
    });

    for (const env of envs) {
      const type = env.service.databaseType;
      if (!type || !dumpSpec(type)) continue;
      try {
        await this.runBackup(env.id, BackupTrigger.SCHEDULED);
      } catch (error) {
        this.logger.warn(
          `Scheduled backup failed for serviceEnv ${env.id}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }
  }

  async createBackup(
    serviceEnvId: string,
    userId: string,
    userRole: Role,
  ): Promise<DatabaseBackup> {
    await this.assertCanAccess(serviceEnvId, userId, userRole);
    return this.runBackup(serviceEnvId, BackupTrigger.MANUAL);
  }

  async listBackups(
    serviceEnvId: string,
    userId: string,
    userRole: Role,
  ): Promise<DatabaseBackup[]> {
    await this.assertCanAccess(serviceEnvId, userId, userRole);
    return this.prisma.databaseBackup.findMany({
      where: { serviceEnvironmentId: serviceEnvId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Restore a previous SUCCESS backup back into the running database container.
   * Downloads the stored dump, verifies its SHA-256, gunzips it, then streams it
   * to the engine's native restore tool (psql / mysql / mongorestore) via the
   * container's STDIN. Returns any non-fatal tool warnings (stderr).
   */
  async restoreBackup(
    backupId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ ok: true; warnings: string | null }> {
    const backup = await this.prisma.databaseBackup.findUnique({
      where: { id: backupId },
      select: {
        id: true,
        serviceEnvironmentId: true,
        status: true,
        storageProvider: true,
        storagePath: true,
        checksum: true,
        serviceEnvironment: {
          select: { service: { select: { databaseType: true } } },
        },
      },
    });
    if (!backup) throw new NotFoundException('Sauvegarde introuvable');

    await this.assertCanAccess(backup.serviceEnvironmentId, userId, userRole);

    if (backup.status !== BackupStatus.SUCCESS) {
      throw new BadRequestException(
        'Seule une sauvegarde réussie peut être restaurée',
      );
    }
    if (!backup.storagePath) {
      throw new BadRequestException('Cette sauvegarde n’a pas de dump stocké');
    }

    const type = backup.serviceEnvironment.service.databaseType;
    const spec = type ? restoreSpec(type) : null;
    if (!type || !spec) {
      throw new BadRequestException(
        `Restauration non supportée pour ${type ?? 'ce service'}`,
      );
    }

    // Fetch + integrity-check before touching the live DB.
    const gzipped = await this.storage.download(
      backup.storageProvider,
      backup.storagePath,
    );
    if (backup.checksum) {
      const actual = createHash('sha256').update(gzipped).digest('hex');
      if (actual !== backup.checksum) {
        throw new BadRequestException(
          'Checksum invalide — la sauvegarde est corrompue, restauration annulée',
        );
      }
    }
    const dump = await gunzipAsync(gzipped);

    const container = await this.resolveRunningContainer(
      backup.serviceEnvironmentId,
    );
    const { stderr, exitCode } = await this.docker.execWithInput(
      container.serverId,
      container.name,
      spec.cmd,
      dump,
    );
    if (exitCode !== 0) {
      throw new BadRequestException(
        `Échec de la restauration: ${stderr.trim() || `code ${exitCode}`}`,
      );
    }
    return { ok: true, warnings: stderr.trim() || null };
  }

  // ─── Core ──────────────────────────────────────────────────────────────────

  private async runBackup(
    serviceEnvId: string,
    trigger: BackupTrigger,
  ): Promise<DatabaseBackup> {
    const env = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: { id: true, service: { select: { databaseType: true } } },
    });
    if (!env) throw new NotFoundException('Service-environnement introuvable');

    const type = env.service.databaseType;
    if (!type) {
      throw new BadRequestException(
        'Ce service n’est pas une base de données managée',
      );
    }
    const spec = dumpSpec(type);
    if (!spec) {
      throw new BadRequestException(
        `Sauvegarde logique non supportée pour ${type}`,
      );
    }

    const container = await this.resolveRunningContainer(serviceEnvId);

    const backup = await this.prisma.databaseBackup.create({
      data: {
        serviceEnvironmentId: serviceEnvId,
        trigger,
        status: BackupStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    try {
      const { stdout, stderr, exitCode } = await this.docker.execCapture(
        container.serverId,
        container.name,
        spec.cmd,
      );
      if (exitCode !== 0) {
        throw new Error(stderr.trim() || `Dump exited with code ${exitCode}`);
      }

      // Compress (gzip) + checksum the dump: smaller storage/transfer, and a
      // SHA-256 to detect silent corruption. Storage is pluggable (LOCAL fs or
      // external S3), resolved at runtime from PlatformConfig.
      const gzipped = await gzipAsync(stdout);
      const checksum = createHash('sha256').update(gzipped).digest('hex');
      const stored = await this.storage.upload(
        `${serviceEnvId}/${backup.id}.${spec.ext}.gz`,
        gzipped,
      );

      const result = await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.SUCCESS,
          storageProvider: stored.provider,
          storagePath: stored.location,
          sizeBytes: stored.sizeBytes,
          checksum,
          finishedAt: new Date(),
        },
      });

      // Prune old backups (storage object + DB row) per the retention policy.
      await this.enforceRetention(serviceEnvId);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Échec de la sauvegarde';
      return this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.FAILED,
          error: message,
          finishedAt: new Date(),
        },
      });
    }
  }

  /**
   * Retention policy (DevOps hygiene): always keep the N most recent successful
   * backups; among the rest, delete those older than maxAge days — removing
   * BOTH the stored object (local or S3) and the DB row. Bounds storage growth
   * without ever dropping recent backups. Config via PlatformConfig
   * (BACKUP_RETENTION_KEEP_LAST / BACKUP_RETENTION_MAX_AGE_DAYS).
   */
  private async enforceRetention(serviceEnvId: string): Promise<void> {
    try {
      const keepLast = await this.intConfig(
        'BACKUP_RETENTION_KEEP_LAST',
        DEFAULT_RETENTION_KEEP_LAST,
      );
      const maxAgeDays = await this.intConfig(
        'BACKUP_RETENTION_MAX_AGE_DAYS',
        DEFAULT_RETENTION_MAX_AGE_DAYS,
      );
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

      const successes = await this.prisma.databaseBackup.findMany({
        where: {
          serviceEnvironmentId: serviceEnvId,
          status: BackupStatus.SUCCESS,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          storageProvider: true,
          storagePath: true,
        },
      });

      const stale = successes.filter(
        (b, index) => index >= keepLast && b.createdAt < cutoff,
      );
      for (const b of stale) {
        if (b.storagePath) {
          await this.storage.remove(b.storageProvider, b.storagePath);
        }
        await this.prisma.databaseBackup.delete({ where: { id: b.id } });
      }
      if (stale.length > 0) {
        this.logger.log(
          `Retention: pruned ${stale.length} old backup(s) for serviceEnv ${serviceEnvId}`,
        );
      }
    } catch (error) {
      // Retention is best-effort — never fail the backup over a prune error.
      this.logger.warn(
        `Retention prune failed for serviceEnv ${serviceEnvId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async intConfig(key: string, fallback: number): Promise<number> {
    const raw = await this.platform.get(key);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  private async resolveRunningContainer(
    serviceEnvId: string,
  ): Promise<{ serverId: string; name: string }> {
    const container = await this.prisma.container.findFirst({
      where: { serviceEnvId, status: ContainerStatus.RUNNING },
      orderBy: { updatedAt: 'desc' },
      select: { serverId: true, name: true },
    });
    if (!container) {
      throw new BadRequestException(
        'Aucun conteneur de base de données en cours d’exécution',
      );
    }
    return container;
  }

  private async assertCanAccess(
    serviceEnvId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    const env = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: { service: { select: { projectId: true } } },
    });
    if (!env) throw new NotFoundException('Service-environnement introuvable');
    if (userRole === Role.ADMIN) return;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: env.service.projectId, userId } },
      select: { role: true },
    });
    if (!member) throw new ForbiddenException('Accès non autorisé à ce projet');
  }
}
