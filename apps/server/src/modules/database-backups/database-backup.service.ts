import { promises as fs } from 'fs';
import { join } from 'path';
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
  ManagedServiceType,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { DockerApiService } from '../../core/container-runtime/docker-api.service';

type DumpSpec = { cmd: string[]; ext: string };

/**
 * Produces logical backups of managed-database ServiceEnvironments by running
 * the engine's native dump tool inside the running container (via the Docker
 * API) and storing the dump on the backend host. REDIS/RABBITMQ have no
 * portable logical dump and are rejected.
 */
@Injectable()
export class DatabaseBackupService {
  private readonly logger = new Logger(DatabaseBackupService.name);
  private readonly backupDir =
    process.env.DATABASE_BACKUP_DIR ?? join(process.cwd(), 'backups');

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
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
      if (!type || !this.dumpSpec(type)) continue;
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
    const spec = this.dumpSpec(type);
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

      const dir = join(this.backupDir, serviceEnvId);
      await fs.mkdir(dir, { recursive: true });
      const path = join(dir, `${backup.id}.${spec.ext}`);
      await fs.writeFile(path, stdout);

      return await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.SUCCESS,
          storagePath: path,
          sizeBytes: stdout.byteLength,
          finishedAt: new Date(),
        },
      });
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

  private dumpSpec(type: ManagedServiceType): DumpSpec | null {
    switch (type) {
      case ManagedServiceType.POSTGRES:
        return {
          cmd: [
            'sh',
            '-c',
            'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"',
          ],
          ext: 'sql',
        };
      case ManagedServiceType.MYSQL:
        return {
          cmd: [
            'sh',
            '-c',
            'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --databases "${MYSQL_DATABASE:-app}"',
          ],
          ext: 'sql',
        };
      case ManagedServiceType.MONGODB:
        return {
          cmd: [
            'sh',
            '-c',
            'mongodump --archive --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin',
          ],
          ext: 'archive',
        };
      // REDIS / RABBITMQ have no portable logical dump.
      default:
        return null;
    }
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
