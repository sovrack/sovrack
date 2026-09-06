import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { ServerWorkspaceGuard } from '../../../iam/authorization/server-workspace.guard';
import { DockerConnectionsService } from '../../../../adapters/container-runtime/docker-connections.service';
import { RequireServerAction } from '../../../iam/authorization/require-server-action.decorator';
import { WorkspaceActions } from '../../../iam/authorization/workspace-policy.types';

class UpsertDockerConnectionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsString()
  @IsNotEmpty()
  tlsCaCert!: string;

  @IsString()
  @IsNotEmpty()
  tlsClientCert!: string;

  @IsString()
  @IsNotEmpty()
  tlsClientKey!: string;
}

/**
 * Admin API for {@link DockerConnectionsService} — configure the
 * direct TCP+TLS path to a server's Docker daemon (P5 of the
 * refactoring plan).
 */
@ApiTags('Servers — Docker Connection (Admin)')
@ApiBearerAuth()
@Controller([
  'workspaces/:workspaceId/servers/:serverId/docker-connection',
  'servers/:serverId/docker-connection',
])
@UseGuards(ServerWorkspaceGuard)
export class DockerConnectionController {
  constructor(private readonly dockerConnections: DockerConnectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Read the (encrypted) Docker config for a server' })
  async get(@Param('serverId') serverId: string) {
    // We DO NOT return the encrypted certs in the response — they are
    // write-only from the API's perspective. The admin UI only needs
    // the metadata (endpoint, lastCheckedAt, isReachable, apiVersion).
    const conn = await this.dockerConnections.findForServer(serverId);
    return {
      id: conn.id,
      serverId: conn.serverId,
      endpoint: conn.endpoint,
      apiVersion: conn.apiVersion,
      lastCheckedAt: conn.lastCheckedAt,
      isReachable: conn.isReachable,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    };
  }

  @Post()
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary: 'Create or replace the Docker connection of a server',
  })
  async upsert(
    @Param('serverId') serverId: string,
    @Body() dto: UpsertDockerConnectionDto,
  ) {
    const conn = await this.dockerConnections.upsert({ serverId, ...dto });
    return {
      id: conn.id,
      serverId: conn.serverId,
      endpoint: conn.endpoint,
      apiVersion: conn.apiVersion,
      lastCheckedAt: conn.lastCheckedAt,
      isReachable: conn.isReachable,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    };
  }

  @Post('probe')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary: 'Test the Docker connection (TLS handshake + ping)',
  })
  async probe(@Param('serverId') serverId: string) {
    return this.dockerConnections.probeReachability(serverId);
  }

  @Delete()
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary: 'Delete the Docker connection configured for this server',
  })
  async remove(@Param('serverId') serverId: string) {
    return this.dockerConnections.remove(serverId);
  }
}
