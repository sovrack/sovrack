import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
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
}
