import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PlatformModule } from '../platform/platform.module';
import { DatabaseBackupService } from './database-backup.service';
import { BackupStorageService } from './backup-storage.service';
import { DatabaseBackupsController } from './database-backups.controller';

// DockerApiService comes from the @Global() DockerModule.
@Module({
  imports: [PrismaModule, PlatformModule],
  controllers: [DatabaseBackupsController],
  providers: [DatabaseBackupService, BackupStorageService],
  exports: [DatabaseBackupService],
})
export class DatabaseBackupsModule {}
