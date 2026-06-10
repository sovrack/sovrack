import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { SshModule } from '../../core/ssh/ssh.module';
import { CryptoModule } from '../../core/crypto/crypto.module';
import { AppJwtModule } from '../../core/jwt/jwt.module';
import { DatabaseProvisioningService } from './database-provisioning.service';
import { DatabaseBackupService } from './database-backup.service';
import { ManagedDatabasesController } from './managed-databases.controller';

/**
 * Managed databases module — provisions, monitors, and backs up
 * databases (PostgreSQL, MySQL, Redis, MongoDB) via Docker on VPS.
 * Inspired by Coolify's database management feature.
 */
@Module({
  imports: [PrismaModule, SshModule, CryptoModule, AppJwtModule],
  controllers: [ManagedDatabasesController],
  providers: [DatabaseProvisioningService, DatabaseBackupService],
  exports: [DatabaseProvisioningService],
})
export class ManagedDatabasesModule {}
