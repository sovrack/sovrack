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
import { GetUser } from '../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { EnvironmentsService } from './environments.service';

@ApiTags('Environments')
@ApiBearerAuth()
@Controller('projects/:id/environments')
@UseGuards(JwtAuthGuard)
export class EnvironmentsController {
  constructor(
    private readonly environmentsService: EnvironmentsService,
    private readonly serviceEnvsService: ServiceEnvironmentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer un environnement pour un projet' })
  @ApiResponse({ status: 201, description: 'Environnement créé avec succès' })
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
  @ApiOperation({ summary: "Détail d'un environnement de projet" })
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
  @ApiOperation({ summary: 'Mettre à jour un environnement de projet' })
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
  @ApiOperation({ summary: 'Supprimer un environnement de projet' })
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
  @ApiOperation({ summary: 'Assigner un serveur à un environnement' })
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
  @ApiOperation({ summary: 'Retirer un serveur d\'un environnement' })
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
  @ApiOperation({ summary: 'Lier un service à un environnement' })
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
  @ApiOperation({ summary: 'Lister les services liés à un environnement' })
  async listLinkedServices(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.serviceEnvsService.findByEnvironment(projectId, envId, user.id, user.role);
  }
}
