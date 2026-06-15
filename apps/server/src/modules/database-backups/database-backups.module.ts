import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupsController } from './database-backups.controller';

// DockerApiService comes from the @Global() DockerModule.
@Module({
  imports: [PrismaModule],
  controllers: [DatabaseBackupsController],
  providers: [DatabaseBackupService],
  exports: [DatabaseBackupService],
})
export class DatabaseBackupsModule {}
