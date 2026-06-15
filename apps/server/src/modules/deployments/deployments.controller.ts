import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
  Query,
  Delete,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { GetUser } from '../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../core/http/pagination.dto';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import {
  ValidateDeploymentDto,
  ValidationResultDto,
} from './dto/validate-deployment.dto';
import {
  DeploymentDetailedResponseDto,
  DeploymentResponseDto,
  PaginatedDeploymentsResponseDto,
} from './dto/deployment-response.dto';
import { DeploymentsValidationService } from './query/deployments-validation.service';
import { DeploymentsCreateService } from './core/deployments-create.service';
import { DeploymentsQueryService } from './query/deployments-query.service';
import { DeploymentsLifecycleService } from './core/deployments-lifecycle.service';
import { DeploymentsRollbackService } from './core/deployments-rollback.service';
import { DockerDeployExecutorService } from './core/docker-deploy-executor.service';
import {
  DeploymentsLogSearchService,
  type LogLevelFilter,
} from './query/deployments-log-search.service';

@ApiTags('Deployments')
@ApiBearerAuth()
@ApiExtraModels(
  DeploymentResponseDto,
  DeploymentDetailedResponseDto,
  PaginatedDeploymentsResponseDto,
)
@Controller('deployments')
@UseGuards(JwtAuthGuard)
export class DeploymentsController {
  constructor(
    private readonly createService: DeploymentsCreateService,
    private readonly queryService: DeploymentsQueryService,
    private readonly lifecycleService: DeploymentsLifecycleService,
    private readonly rollbackService: DeploymentsRollbackService,
    private readonly dockerExecutor: DockerDeployExecutorService,
    private readonly validationService: DeploymentsValidationService,
    private readonly logSearchService: DeploymentsLogSearchService,
  ) {}

  @Post('validate')
  @ApiOperation({ summary: 'Valider les prérequis avant déploiement' })
  @ApiCreatedResponse({
    description: 'Résultat de la validation outillage',
    type: ValidationResultDto,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async validate(
    @Body() dto: ValidateDeploymentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.validationService.validate(
      dto.projectId,
      dto.environmentId,
      (dto.buildSource ?? 'DOCKERFILE_LOCAL'),
      user.id,
      dto.serviceEnvId,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Lancer un déploiement' })
  @ApiCreatedResponse({
    description: 'Déploiement créé',
    type: DeploymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Préconditions de déploiement invalides',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé au projet' })
  async create(@Body() dto: CreateDeploymentDto, @GetUser() user: JwtPayload) {
    return await this.createService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les déploiements (filtrés par rôle)' })
  @ApiOkResponse({
    description: 'Liste des déploiements',
    schema: {
      oneOf: [
        {
          type: 'array',
          items: { $ref: getSchemaPath(DeploymentDetailedResponseDto) },
        },
        { $ref: getSchemaPath(PaginatedDeploymentsResponseDto) },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async findAll(
    @GetUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
  ) {
    return await this.queryService.findAll(
      user.id,
      user.role,
      pagination,
    );
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: "Lister l'historique d'un projet" })
  @ApiOkResponse({
    description: 'Historique des déploiements du projet',
    type: DeploymentDetailedResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé au projet' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async findByProject(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.queryService.findByProject(
      projectId,
      user.id,
      user.role,
    );
  }

  // Declared BEFORE @Get(':id') so the static 'preview-env' segment is not
  // captured by the :id param route.
  @Get('preview-env')
  @ApiOperation({
    summary: 'Prévisualiser les variables qui seront injectées (secrets masqués)',
  })
  @ApiOkResponse({
    description: 'Variables résolues (origine + isSecret) et warnings de résolution',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 404, description: 'Lien service-environnement non trouvé' })
  async previewEnv(@Query('serviceEnvId') serviceEnvId: string) {
    return await this.queryService.previewEnv(serviceEnvId);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un déploiement" })
  @ApiOkResponse({
    description: 'Détail du déploiement',
    type: DeploymentDetailedResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Déploiement non trouvé' })
  async findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.queryService.findOne(id, user.id, user.role);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler un déploiement' })
  @ApiCreatedResponse({
    description: 'Déploiement annulé',
    type: DeploymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'État du déploiement non annulable',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Déploiement non trouvé' })
  async cancel(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.lifecycleService.cancel(id, user.id, user.role);
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: 'Rollback sur la dernière image stable' })
  @ApiCreatedResponse({
    description: 'Rollback lancé',
    type: DeploymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Rollback impossible' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Déploiement non trouvé' })
  async rollback(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.rollbackService.rollback(id, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer un déploiement' })
  @ApiResponse({ status: 204, description: 'Déploiement supprimé' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Déploiement non trouvé' })
  async remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.lifecycleService.remove(id, user.id, user.role);
  }

  @Get(':id/container-logs')
  @ApiOperation({ summary: 'Récupérer les logs du conteneur Docker du déploiement' })
  async containerLogs(
    @Param('id') id: string,
    @Query('tail') tail: string | undefined,
    @GetUser() user: JwtPayload,
  ) {
    const tailNum = tail ? parseInt(tail, 10) : 300;
    return await this.dockerExecutor.getContainerLogs(id, tailNum);
  }

  @Get(':id/logs/search')
  @ApiOperation({ summary: 'Rechercher dans les logs du déploiement (texte + niveau)' })
  @ApiOkResponse({ description: 'Lignes correspondantes (max 200) + total' })
  async searchLogs(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('q') q: string | undefined,
    @Query('level') level: LogLevelFilter | undefined,
  ) {
    return await this.logSearchService.searchLogs(
      id,
      user.id,
      user.role,
      q ?? '',
      level ?? 'ALL',
    );
  }
}
