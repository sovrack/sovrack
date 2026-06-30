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
import { Throttle } from '@nestjs/throttler';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../shared/http/pagination.dto';
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
import { DeploymentContainerInspectorService } from './query/deployment-container-inspector.service';
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
    private readonly containerInspector: DeploymentContainerInspectorService,
    private readonly validationService: DeploymentsValidationService,
    private readonly logSearchService: DeploymentsLogSearchService,
  ) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate the prerequisites before deployment' })
  @ApiCreatedResponse({
    description: 'Tooling validation result',
    type: ValidationResultDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  async validate(
    @Body() dto: ValidateDeploymentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.validationService.validate(
      dto.projectId,
      dto.environmentId,
      dto.buildSource ?? 'DOCKERFILE_LOCAL',
      user.id,
      dto.serviceEnvId,
    );
  }

  @Post()
  // Tighter than the global 120/min: a deploy is a heavy, side-effecting op —
  // cap bursts (accidental double-clicks, scripts) without blocking normal use.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Launch a deployment' })
  @ApiCreatedResponse({
    description: 'Deployment created',
    type: DeploymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid deployment preconditions',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({
    status: 403,
    description: 'Unauthorized access to the project',
  })
  async create(@Body() dto: CreateDeploymentDto, @GetUser() user: JwtPayload) {
    return await this.createService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List deployments (filtered by role)' })
  @ApiOkResponse({
    description: 'Deployment list',
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
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  async findAll(
    @GetUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
  ) {
    return await this.queryService.findAll(user.id, user.role, pagination);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: "Lister l'historique d'un projet" })
  @ApiOkResponse({
    description: 'Project deployment history',
    type: DeploymentDetailedResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({
    status: 403,
    description: 'Unauthorized access to the project',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findByProject(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.queryService.findByProject(projectId, user.id, user.role);
  }

  // Declared BEFORE @Get(':id') so the static 'preview-env' segment is not
  // captured by the :id param route.
  @Get('preview-env')
  @ApiOperation({
    summary: 'Preview the variables that will be injected (secrets masked)',
  })
  @ApiOkResponse({
    description:
      'Resolved variables (origin + isSecret) and resolution warnings',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access to project' })
  @ApiResponse({
    status: 404,
    description: 'Service-environment link not found',
  })
  async previewEnv(
    @Query('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.queryService.previewEnv(serviceEnvId, user.id, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Deployment details' })
  @ApiOkResponse({
    description: 'Deployment details',
    type: DeploymentDetailedResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({ status: 404, description: 'Deployment not found' })
  async findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.queryService.findOne(id, user.id, user.role);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a deployment' })
  @ApiCreatedResponse({
    description: 'Deployment canceled',
    type: DeploymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Deployment state cannot be canceled',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({ status: 404, description: 'Deployment not found' })
  async cancel(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.lifecycleService.cancel(id, user.id, user.role);
  }

  @Post(':id/rollback')
  // Rollback re-deploys (heavy + side-effecting) → same tight cap as create.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Roll back to the last stable image' })
  @ApiCreatedResponse({
    description: 'Rollback launched',
    type: DeploymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Rollback impossible' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({ status: 404, description: 'Deployment not found' })
  async rollback(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() body?: { targetDeploymentId?: string },
  ) {
    return await this.rollbackService.rollback(
      id,
      user.id,
      user.role,
      body?.targetDeploymentId,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a deployment' })
  @ApiResponse({ status: 204, description: 'Deployment deleted' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({ status: 404, description: 'Deployment not found' })
  async remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.lifecycleService.remove(id, user.id, user.role);
  }

  @Get(':id/container-logs')
  @ApiOperation({ summary: 'Get the Docker container logs of the deployment' })
  async containerLogs(
    @Param('id') id: string,
    @Query('tail') tail: string | undefined,
    @GetUser() _user: JwtPayload,
  ) {
    const tailNum = tail ? parseInt(tail, 10) : 300;
    return await this.containerInspector.getContainerLogs(id, tailNum);
  }

  @Get(':id/logs/search')
  @ApiOperation({ summary: 'Search the deployment logs (text + level)' })
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
