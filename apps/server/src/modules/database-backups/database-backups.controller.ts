import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { DatabaseBackupService } from './database-backup.service';

@ApiTags('Database Backups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('service-environments/:serviceEnvId/backups')
export class DatabaseBackupsController {
  constructor(private readonly backups: DatabaseBackupService) {}

  @Get()
  @ApiOperation({ summary: "List a database's backups" })
  async list(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
  ) {
    return this.backups.listBackups(serviceEnvId, user.id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Trigger a manual backup' })
  async create(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
  ) {
    return this.backups.createBackup(serviceEnvId, user.id, user.role);
  }

  @Post(':backupId/restore')
  @ApiOperation({ summary: 'Restore a backup into the running database' })
  async restore(
    @Param('backupId') backupId: string,
    @GetUser() user: JwtPayload,
  ) {
    return this.backups.restoreBackup(backupId, user.id, user.role);
  }
}
