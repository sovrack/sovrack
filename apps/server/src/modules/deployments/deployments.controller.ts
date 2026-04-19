import { Controller, Get, Param, Post, Body, UseGuards, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsService } from './deployments.service';

@ApiTags('Deployments')
@ApiBearerAuth()
@Controller('deployments')
@UseGuards(JwtAuthGuard)
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Lancer un déploiement' })
  @ApiResponse({ status: 201, description: 'Déploiement créé' })
  @ApiResponse({
    status: 400,
    description: 'Préconditions de déploiement invalides',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé au projet' })
  async create(@Body() dto: CreateDeploymentDto, @GetUser() user: JwtPayload) {
    return await this.deploymentsService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les déploiements (filtrés par rôle)' })
  @ApiResponse({ status: 200, description: 'Liste des déploiements' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async findAll(@GetUser() user: JwtPayload, @Query() pagination: PaginationDto) {
    return await this.deploymentsService.findAll(user.id, user.role, pagination);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: "Lister l'historique d'un projet" })
  @ApiResponse({
    status: 200,
    description: 'Historique des déploiements du projet',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé au projet' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async findByProject(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.deploymentsService.findByProject(
      projectId,
      user.id,
      user.role,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un déploiement" })
  @ApiResponse({ status: 200, description: 'Détail du déploiement' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Déploiement non trouvé' })
  async findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.deploymentsService.findOne(id, user.id, user.role);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler un déploiement' })
  @ApiResponse({ status: 201, description: 'Déploiement annulé' })
  @ApiResponse({
    status: 400,
    description: 'État du déploiement non annulable',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Déploiement non trouvé' })
  async cancel(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.deploymentsService.cancel(id, user.id, user.role);
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: 'Rollback sur la dernière image stable' })
  @ApiResponse({ status: 201, description: 'Rollback lancé' })
  @ApiResponse({ status: 400, description: 'Rollback impossible' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Déploiement non trouvé' })
  async rollback(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.deploymentsService.rollback(id, user.id, user.role);
  }
}
