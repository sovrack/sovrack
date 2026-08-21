import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ProjectWorkspaceGuard } from '../../iam/authorization/project-workspace.guard';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { EnvironmentsService } from './environments.service';

@ApiTags('Environments')
@ApiBearerAuth()
@Controller([
  'workspaces/:workspaceId/projects/:id/environments',
  'projects/:id/environments',
])
@UseGuards(JwtAuthGuard, ProjectWorkspaceGuard)
export class EnvironmentsController {
  constructor(
    private readonly environmentsService: EnvironmentsService,
    private readonly serviceEnvsService: ServiceEnvironmentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an environment for a project' })
  @ApiResponse({ status: 201, description: 'Environment created successfully' })
  async create(
    @Param('id') projectId: string,
    @Body() dto: CreateEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.create(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }

  @Get()
  @ApiOperation({ summary: "Lister les environnements d'un projet" })
  async findAll(@Param('id') projectId: string, @GetUser() user: JwtPayload) {
    return await this.environmentsService.findAll(
      projectId,
      user.id,
      user.role,
    );
  }

  @Get(':envId')
  @ApiOperation({ summary: 'Project environment details' })
  async findOne(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.findOne(
      projectId,
      envId,
      user.id,
      user.role,
    );
  }

  @Put(':envId')
  @ApiOperation({ summary: 'Update a project environment' })
  async update(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @Body() dto: UpdateEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.update(
      projectId,
      envId,
      dto,
      user.id,
      user.role,
    );
  }

  @Delete(':envId')
  @ApiOperation({ summary: 'Delete a project environment' })
  async remove(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.environmentsService.remove(projectId, envId, user.id, user.role);
    return { message: 'Environnement supprimé avec succès' };
  }

  // NOUVEAU : assigner un serveur
  @Post(':envId/servers/:serverId')
  @ApiOperation({ summary: 'Assign a server to an environment' })
  async assignServer(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @Param('serverId') serverId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.assignServer(
      projectId,
      envId,
      serverId,
      user.id,
      user.role,
    );
  }

  @Delete(':envId/servers/:serverId')
  @ApiOperation({ summary: 'Remove a server from an environment' })
  async removeServer(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @Param('serverId') serverId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.removeServer(
      projectId,
      envId,
      serverId,
      user.id,
      user.role,
    );
  }

  // NOUVEAU : lier un service
  @Post(':envId/services/:serviceId')
  @ApiOperation({ summary: 'Link a service to an environment' })
  async linkService(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.linkService(
      projectId,
      envId,
      serviceId,
      user.id,
      user.role,
    );
  }

  @Get(':envId/services')
  @ApiOperation({ summary: 'List services linked to an environment' })
  async listLinkedServices(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.serviceEnvsService.findByEnvironment(
      projectId,
      envId,
      user.id,
      user.role,
    );
  }
}
