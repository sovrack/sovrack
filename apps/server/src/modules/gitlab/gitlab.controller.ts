import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import { GitlabService } from './gitlab.service';

class TriggerPipelineDto {
  @IsString()
  @IsNotEmpty()
  branch!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  repoId?: number;
}

@ApiTags('GitLab')
@Controller()
export class GitlabController {
  constructor(private readonly gitlabService: GitlabService) {}

  @Get('gitlab/providers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Lister les providers GitLab disponibles pour la configuration projet',
  })
  @ApiResponse({ status: 200, description: 'Providers GitLab disponibles' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async listProviders() {
    return await this.gitlabService.listAvailableProviders();
  }

  @Post('projects/:id/gitlab/connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connecter un projet à GitLab' })
  @ApiResponse({ status: 201, description: 'Configuration GitLab enregistrée' })
  @ApiResponse({ status: 400, description: 'Connexion GitLab échouée' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async connectProject(
    @Param('id') projectId: string,
    @Body() dto: ConnectGitlabDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabService.connectProject(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }

  @Get('projects/:id/gitlab/branches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les branches GitLab disponibles' })
  @ApiResponse({ status: 200, description: 'Branches GitLab récupérées' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou config GitLab non trouvé',
  })
  async getBranches(
    @Param('id') projectId: string,
    @Query('repoId') repoId: string | undefined,
    @GetUser() user: JwtPayload,
  ) {
    const parsedRepoId = this.parseOptionalRepoId(repoId);
    return await this.gitlabService.getBranches(
      projectId,
      user.id,
      user.role,
      parsedRepoId,
    );
  }

  @Get('projects/:id/gitlab/pipelines')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les pipelines GitLab' })
  @ApiResponse({ status: 200, description: 'Pipelines GitLab récupérés' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou config GitLab non trouvé',
  })
  async getPipelines(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabService.getPipelines(projectId, user.id, user.role);
  }

  @Get('projects/:id/gitlab/repos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les repositories (REPO/GROUP)' })
  @ApiResponse({ status: 200, description: 'Repositories GitLab récupérés' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou config GitLab non trouvé',
  })
  async getRepos(@Param('id') projectId: string, @GetUser() user: JwtPayload) {
    return await this.gitlabService.getRepos(projectId, user.id, user.role);
  }

  @Post('projects/:id/gitlab/pipelines/trigger')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déclencher un pipeline GitLab manuellement' })
  @ApiResponse({ status: 201, description: 'Pipeline GitLab déclenché' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou config GitLab non trouvé',
  })
  async triggerPipeline(
    @Param('id') projectId: string,
    @Body() dto: TriggerPipelineDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabService.triggerPipeline(
      projectId,
      dto.branch,
      user.id,
      user.role,
      dto.repoId,
    );
  }

  @Post('gitlab/webhook')
  @ApiOperation({ summary: 'Recevoir les événements GitLab (webhook)' })
  @ApiResponse({ status: 201, description: 'Webhook traité avec succès' })
  @ApiResponse({ status: 403, description: 'Token webhook invalide' })
  async handleWebhook(
    @Headers('x-gitlab-token') webhookToken: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    await this.gitlabService.verifyWebhookToken(webhookToken, payload);
    return await this.gitlabService.handleWebhook(payload);
  }

  @Get('projects/:id/gitlab/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Voir la configuration GitLab d’un projet' })
  @ApiResponse({ status: 200, description: 'Configuration GitLab retournée' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou config GitLab non trouvé',
  })
  async getGitlabConfig(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabService.getGitlabConfig(
      projectId,
      user.id,
      user.role,
    );
  }

  private parseOptionalRepoId(repoId: string | undefined): number | undefined {
    if (!repoId || repoId.trim().length === 0) {
      return undefined;
    }

    const parsed = Number(repoId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }
}
