import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  SshExecutorService,
  type SshConnection,
} from '../../core/ssh/ssh-executor.service';
import { PrismaService } from '../../core/database/prisma.service';

export type BackupRequest = {
  containerName: string;
  dbType: string;
  dbName: string;
  serverHost: string;
  serverPort: number;
  serverUsername: string;
  privateKey: string;
};

/**
 * Manages scheduled and on-demand database backups.
 * Creates compressed dumps inside the Docker container and stores
 * them in /backups on the target server.
 */
@Injectable()
export class DatabaseBackupService {
  private readonly logger = new Logger(DatabaseBackupService.name);

  constructor(
    private readonly ssh: SshExecutorService,
    private readonly prisma: PrismaService,
  ) {}

  async createBackup(request: BackupRequest): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `/backups/${request.containerName}_${timestamp}.sql.gz`;
    const command = this.buildBackupCommand(request, backupFile);

    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: request.serverHost,
        port: request.serverPort,
        username: request.serverUsername,
        privateKey: request.privateKey,
        readyTimeoutMs: 10_000,
      });

      await conn.client.execCommand(`mkdir -p /backups && ${command}`);
      this.logger.log(`Backup created: ${backupFile}`);
      return backupFile;
    } finally {
      if (conn) await conn.dispose();
    }
  }

  async listBackups(
    serverHost: string,
    serverPort: number,
    serverUsername: string,
    privateKey: string,
    containerName: string,
  ): Promise<string[]> {
    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: serverHost,
        port: serverPort,
        username: serverUsername,
        privateKey,
        readyTimeoutMs: 10_000,
      });

      const result = await conn.client.execCommand(`ls -1 /backups/${containerName}_*.sql.gz 2>/dev/null || echo ""`);
      return result.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } finally {
      if (conn) await conn.dispose();
    }
  }

  async cleanOldBackups(
    serverHost: string,
    serverPort: number,
    serverUsername: string,
    privateKey: string,
    containerName: string,
    keepCount = 7,
  ): Promise<void> {
    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: serverHost,
        port: serverPort,
        username: serverUsername,
        privateKey,
        readyTimeoutMs: 10_000,
      });

      await conn.client.execCommand(
        `ls -t /backups/${containerName}_*.sql.gz 2>/dev/null | tail -n +${keepCount + 1} | xargs rm -f`,
      );
    } finally {
      if (conn) await conn.dispose();
    }
  }

  private buildBackupCommand(request: BackupRequest, backupFile: string): string {
    switch (request.dbType) {
      case 'postgresql':
        return `docker exec ${request.containerName} pg_dumpall -U postgres | gzip > ${backupFile}`;
      case 'mysql':
        return `docker exec ${request.containerName} mysqldump --all-databases | gzip > ${backupFile}`;
      case 'mongodb':
        return `docker exec ${request.containerName} mongodump --archive | gzip > ${backupFile}`;
      default:
        return `echo "Backup not supported for ${request.dbType}" > ${backupFile}`;
    }
  }
}
