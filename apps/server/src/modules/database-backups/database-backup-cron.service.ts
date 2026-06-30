import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class DatabaseBackupCronService {
  private readonly logger = new Logger(DatabaseBackupCronService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Daily database backup at 2 AM
   */
  @Cron('0 2 * * *') // Every day at 2:00 AM
  async createDailyBackup(): Promise<void> {
    try {
      await this.createBackup('daily');
    } catch (error) {
      this.logger.error('Failed to create daily backup', error);
    }
  }

  /**
   * Weekly database backup on Sunday at 3 AM (full backup)
   */
  @Cron('0 3 * * 0') // Every Sunday at 3:00 AM
  async createWeeklyBackup(): Promise<void> {
    try {
      await this.createBackup('weekly');
    } catch (error) {
      this.logger.error('Failed to create weekly backup', error);
    }
  }

  /**
   * Create a database backup
   */
  private async createBackup(type: 'daily' | 'weekly'): Promise<string> {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    // Parse DATABASE_URL to get connection details
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1); // Remove leading /
    const dbUser = url.username;
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';

    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), '.backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${type}-backup-${dbName}-${timestamp}.sql`;
    const backupPath = path.join(backupDir, filename);

    // Build pg_dump command
    const password = url.password;
    const env = { ...process.env, PGPASSWORD: password };

    const command = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --verbose --clean --if-exists --create > ${backupPath}`;

    this.logger.log(`Creating ${type} database backup: ${filename}`);

    try {
      await execAsync(command, { env, timeout: 300000 }); // 5 minutes timeout
      this.logger.log(`${type} backup completed successfully: ${filename}`);

      // Compress the backup file
      await this.compressBackup(backupPath);

      // Clean old backups
      await this.cleanOldBackups(type);

      return `${backupPath}.gz`;
    } catch (error) {
      this.logger.error(`Failed to create ${type} backup`, error);

      // Remove partial backup file if it exists
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }

      throw error;
    }
  }

  /**
   * Compress backup file using gzip
   */
  private async compressBackup(filePath: string): Promise<void> {
    try {
      await execAsync(`gzip ${filePath}`);
      this.logger.log(`Backup compressed: ${filePath}.gz`);
    } catch (error) {
      this.logger.warn('Failed to compress backup file', error);
    }
  }

  /**
   * Clean old backup files based on retention policy
   */
  private async cleanOldBackups(type: 'daily' | 'weekly'): Promise<void> {
    const backupDir = path.join(process.cwd(), '.backups');
    const retentionDays = type === 'daily' ? 7 : 30; // Keep 7 days of daily, 30 days of weekly

    try {
      const files = fs.readdirSync(backupDir);
      const backupFiles = files
        .filter(
          (file) =>
            file.startsWith(`${type}-backup-`) && file.endsWith('.sql.gz'),
        )
        .map((file) => ({
          name: file,
          path: path.join(backupDir, file),
          createdAt: fs.statSync(path.join(backupDir, file)).birthtime,
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const filesToDelete = backupFiles.filter(
        (file) => file.createdAt < cutoffDate,
      );

      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        this.logger.log(`Deleted old backup: ${file.name}`);
      }

      if (filesToDelete.length > 0) {
        this.logger.log(
          `Cleaned up ${filesToDelete.length} old ${type} backups`,
        );
      }
    } catch (error) {
      this.logger.warn('Failed to clean old backups', error);
    }
  }

  /**
   * Manual backup creation (for admin use)
   */
  async createManualBackup(name?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = name || `manual-${timestamp}`;

    const databaseUrl = this.configService.get<string>('DATABASE_URL');

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);
    const dbUser = url.username;
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';

    const backupDir = path.join(process.cwd(), '.backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filename = `manual-${backupName}-${dbName}-${timestamp}.sql`;
    const backupPath = path.join(backupDir, filename);

    const password = url.password;
    const env = { ...process.env, PGPASSWORD: password };

    const command = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --verbose --clean --if-exists --create > ${backupPath}`;

    this.logger.log(`Creating manual database backup: ${filename}`);

    try {
      await execAsync(command, { env, timeout: 300000 });
      await this.compressBackup(backupPath);
      this.logger.log(`Manual backup completed: ${filename}.gz`);
      return `${backupPath}.gz`;
    } catch (error) {
      this.logger.error('Failed to create manual backup', error);

      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }

      throw error;
    }
  }

  /**
   * List available backups
   */
  listBackups(): Array<{
    name: string;
    size: number;
    createdAt: Date;
    type: string;
  }> {
    const backupDir = path.join(process.cwd(), '.backups');

    if (!fs.existsSync(backupDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(backupDir);
      return files
        .filter((file) => file.endsWith('.sql.gz'))
        .map((file) => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          const type = file.startsWith('daily-')
            ? 'daily'
            : file.startsWith('weekly-')
              ? 'weekly'
              : 'manual';

          return {
            name: file,
            size: stats.size,
            createdAt: stats.birthtime,
            type,
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      this.logger.error('Failed to list backups', error);
      return [];
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(filename: string): Promise<void> {
    const backupDir = path.join(process.cwd(), '.backups');
    const backupPath = path.join(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${filename}`);
    }

    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);
    const dbUser = url.username;
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';
    const password = url.password;

    const env = { ...process.env, PGPASSWORD: password };

    // First, decompress the backup
    const decompressedPath = backupPath.replace('.gz', '');
    try {
      await execAsync(`gunzip -c ${backupPath} > ${decompressedPath}`);
    } catch (error) {
      this.logger.error('Failed to decompress backup file', error);
      throw error;
    }

    try {
      // Restore the database
      const command = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} < ${decompressedPath}`;
      await execAsync(command, { env, timeout: 600000 }); // 10 minutes timeout

      this.logger.log(`Database restored successfully from: ${filename}`);
    } finally {
      // Clean up decompressed file
      if (fs.existsSync(decompressedPath)) {
        fs.unlinkSync(decompressedPath);
      }
    }
  }
}
