import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import {
  DatabaseProvisioningService,
  DatabaseProvisionRequest,
} from './database-provisioning.service';
import { DatabaseBackupService } from './database-backup.service';

@Controller('managed-databases')
@UseGuards(JwtAuthGuard)
export class ManagedDatabasesController {
  constructor(
    private readonly provisioningService: DatabaseProvisioningService,
    private readonly backupService: DatabaseBackupService,
  ) {}

  @Post()
  provision(
    @Body()
    body: DatabaseProvisionRequest & {
      serverSshKey: string;
      serverHost: string;
      serverUsername: string;
      serverPort?: number;
    },
  ) {
    const { serverSshKey, serverHost, serverUsername, serverPort, ...request } = body;
    return this.provisioningService.provision(
      request,
      serverSshKey,
      serverHost,
      serverUsername,
      serverPort,
    );
  }

  @Delete(':containerName')
  stop(
    @Param('containerName') containerName: string,
    @Body()
    body: {
      serverSshKey: string;
      serverHost: string;
      serverUsername: string;
      serverPort?: number;
    },
  ) {
    return this.provisioningService.stop(
      containerName,
      body.serverSshKey,
      body.serverHost,
      body.serverUsername,
      body.serverPort,
    );
  }

  @Post(':containerName/backup')
  createBackup(
    @Param('containerName') containerName: string,
    @Body()
    body: {
      dbType: string;
      dbName: string;
      serverHost: string;
      serverPort: number;
      serverUsername: string;
      privateKey: string;
    },
  ) {
    return this.backupService.createBackup({ containerName, ...body });
  }

  @Get(':containerName/backups')
  listBackups(
    @Param('containerName') containerName: string,
    @Body()
    body: {
      serverHost: string;
      serverPort: number;
      serverUsername: string;
      privateKey: string;
    },
  ) {
    return this.backupService.listBackups(
      body.serverHost,
      body.serverPort,
      body.serverUsername,
      body.privateKey,
      containerName,
    );
  }
}
