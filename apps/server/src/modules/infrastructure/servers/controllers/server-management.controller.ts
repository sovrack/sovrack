import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ServerInfraRole } from '@prisma/client';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { GetWorkspaceId } from '../../../../shared/decorators/get-workspace-id.decorator';
import { ServerWorkspaceGuard } from '../../../iam/authorization/server-workspace.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../../../shared/http/pagination.dto';
import { CreateServerDto } from '../dto/create-server.dto';
import {
  CreateServerResponseDto,
  DeleteServerResponseDto,
  InstallKeyResponseDto,
  PaginatedServerJobsResponseDto,
  PaginatedServersResponseDto,
  ServerActiveJobDto,
  ServerJobResponseDto,
  ServerResponseDto,
} from '../dto/server-response.dto';
import { UpdateServerDto } from '../dto/update-server.dto';
import { ServersCoreService } from '../services';
import { AgentTunnelService } from '../agent-tunnel.service';
import { RequireServerAction } from '../../../iam/authorization/require-server-action.decorator';
import { WorkspaceActions } from '../../../iam/authorization/workspace-policy.types';

class SetServerRoleDto {
  @IsEnum(ServerInfraRole, { message: 'Rôle invalide' })
  @IsNotEmpty()
  infraRole!: ServerInfraRole;
}

class RegisterRunnerDto {
  @IsString({ message: "L'URL GitLab doit être une chaîne de caractères" })
  @IsNotEmpty({ message: 'gitlabUrl est obligatoire' })
  gitlabUrl!: string;

  @IsString({ message: 'Le token doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'token est obligatoire' })
  token!: string;
}

class InstallKeyDto {
  @ApiProperty({ example: 'temporary-ssh-password' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'password est obligatoire' })
  password!: string;
}

@ApiTags('Servers Management')
@ApiBearerAuth()
@ApiExtraModels(
  ServerResponseDto,
  ServerActiveJobDto,
  CreateServerResponseDto,
  PaginatedServersResponseDto,
  PaginatedServerJobsResponseDto,
  ServerJobResponseDto,
  DeleteServerResponseDto,
  InstallKeyResponseDto,
)
@Controller(['workspaces/:workspaceId/servers', 'servers'])
@UseGuards(ServerWorkspaceGuard)
export class ServerManagementController {
  constructor(
    private readonly core: ServersCoreService,
    private readonly agentTunnel?: AgentTunnelService,
  ) {}

  @Get(':id/telemetry')
  @RequireServerAction(WorkspaceActions.READ_SERVER)
  @ApiOperation({
    summary: 'Obtenir la télémétrie et métriques temps réel du serveur (Agent)',
  })
  getTelemetry(@Param('id') id: string) {
    if (!this.agentTunnel) {
      return {
        connected: false,
        lastPingAt: null,
        hostInfo: null,
        metrics: null,
      };
    }
    return this.agentTunnel.getTelemetry(id);
  }

  @Post()
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Create a server' })
  @ApiCreatedResponse({
    description: 'Server created successfully',
    type: CreateServerResponseDto,
  })
  async create(
    @Body() dto: CreateServerDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.core.create(dto, user.id, workspaceId);
  }

  @Get()
  @ApiOperation({ summary: 'List all servers (sshKey masked)' })
  @ApiOkResponse({
    description: 'Liste des serveurs',
    schema: {
      oneOf: [
        {
          type: 'array',
          items: { $ref: getSchemaPath(ServerResponseDto) },
        },
        { $ref: getSchemaPath(PaginatedServersResponseDto) },
      ],
    },
  })
  async findAll(
    @Query() pagination: PaginationDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.core.findAll(pagination, user.id, workspaceId);
  }

  @Get('reachability')
  @ApiOperation({
    summary:
      'A3: lightweight TCP reachability ping for every server (not the full SSH validation) — meant to be polled frequently by the list page.',
  })
  @ApiOkResponse({
    description: 'Map of serverId → isReachable',
  })
  async pingAll(
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.core.pingAll(user.id, workspaceId);
  }

  @Get('infra-environments')
  @ApiOperation({ summary: 'List servers configured as STAGING or PRODUCTION' })
  @ApiOkResponse({ description: 'Servers with an infra role' })
  async listInfraEnvironments(@GetWorkspaceId() workspaceId: string) {
    return await this.core.listInfraEnvironments(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: "View a server's details" })
  @ApiOkResponse({ description: 'Server found', type: ServerResponseDto })
  async findOne(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.core.findOne(id, user.id, workspaceId);
  }

  @Put(':id')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Edit a server' })
  @ApiOkResponse({ description: 'Server updated', type: ServerResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServerDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.core.update(id, dto, user.id, workspaceId);
  }

  @Patch(':id')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Partially update a server' })
  @ApiOkResponse({ description: 'Server updated', type: ServerResponseDto })
  async patch(
    @Param('id') id: string,
    @Body() dto: UpdateServerDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.core.update(id, dto, user.id, workspaceId);
  }

  @Delete(':id')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary: 'Delete a server if no active environment',
  })
  @ApiOkResponse({
    description: 'Server deleted',
    type: DeleteServerResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Server used by an active environment',
  })
  async remove(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.core.remove(id, user.id, workspaceId);
    return { message: 'Serveur supprimé avec succès' };
  }

  @Post(':id/install-key')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary: 'Install the SSH public key via a temporary password',
  })
  @ApiCreatedResponse({
    description: 'SSH key installed and validated',
    type: InstallKeyResponseDto,
  })
  async installKey(
    @Param('id') id: string,
    @Body() dto: InstallKeyDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.installPublicKey(id, dto.password, user.id);
  }

  @Post(':id/register-runner')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Enregistrer le GitLab Runner sur ce serveur' })
  @ApiCreatedResponse({
    description: 'Runner registered',
    type: ServerResponseDto,
  })
  async registerRunner(
    @Param('id') id: string,
    @Body() dto: RegisterRunnerDto,
  ) {
    return await this.core.registerRunner(id, dto.gitlabUrl, dto.token);
  }

  @Get(':id/jobs')
  @ApiOperation({ summary: "Lister l'historique des jobs serveur" })
  @ApiOkResponse({
    description: 'Liste des jobs serveur',
    schema: {
      oneOf: [
        {
          type: 'array',
          items: { $ref: getSchemaPath(ServerJobResponseDto) },
        },
        { $ref: getSchemaPath(PaginatedServerJobsResponseDto) },
      ],
    },
  })
  async listJobs(@Param('id') id: string, @Query() pagination: PaginationDto) {
    return await this.core.listJobs(id, pagination);
  }

  @Patch(':id/role')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Set the infrastructure role of this server' })
  @ApiOkResponse({ description: 'Role updated' })
  async setServerRole(
    @Param('id') id: string,
    @Body() dto: SetServerRoleDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.setServerInfraRole(id, dto.infraRole, user.id);
  }

  @Get(':id/environments')
  @ApiOperation({
    summary: 'List environments assigned to this server (all projects)',
  })
  @ApiOkResponse({ description: 'Environnements utilisant ce serveur' })
  async listServerEnvironments(@Param('id') id: string) {
    return await this.core.listEnvironmentsForServer(id);
  }

  @Post(':id/ping')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Quickly test the server SSH connectivity' })
  @ApiOkResponse({ description: 'Connection test result' })
  async pingServer(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.core.pingServer(id, user.id);
  }

  @Post(':id/jobs/:jobId/cancel')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Force-finish a stuck or ghost job' })
  @ApiOkResponse({
    description: 'Job marked as failed',
    type: ServerJobResponseDto,
  })
  async cancelJob(@Param('id') id: string, @Param('jobId') jobId: string) {
    return await this.core.cancelJob(id, jobId);
  }

  @Post(':id/jobs/:jobId/retry')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({ summary: 'Re-run a failed SSH validation job' })
  @ApiOkResponse({
    description: 'SSH validation re-triggered',
    type: ServerResponseDto,
  })
  async retryJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.retryJob(id, jobId, user.id);
  }
}
