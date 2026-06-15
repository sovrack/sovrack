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
import { GetUser } from '../../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../../core/jwt/dto/jwt-payload.dto';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import { GitlabAdapter } from './gitlab.adapter';

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

class ListGroupRepositoriesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @IsString()
  archived?: string;

  @IsOptional()
  @IsString()
  includeSubgroups?: string;

  @IsOptional()
  @IsString()
  gitlabUrl?: string;

  @IsOptional()
  @IsString()
  gitlabToken?: string;
}

@ApiTags('GitLab')
@Controller()
export class GitlabController {
  constructor(private readonly gitlabCore: GitlabAdapter) {}

  @Get('gitlab/providers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Lister les providers GitLab disponibles pour la configuration projet',
  })
  @ApiResponse({ status: 200, description: 'Providers GitLab disponibles' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  async listProviders() {
    return await this.gitlabCore.listAvailableProviders();
  }

  @Get('gitlab/providers/:providerId/groups/:groupId/repositories')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List repositories accessible in a GitLab group',
  })
  @ApiResponse({ status: 200, description: 'Repositories du groupe GitLab' })
  async listGroupRepositories(
    @Param('providerId') providerId: string,
    @Param('groupId') groupId: string,
    @Query() query: ListGroupRepositoriesQueryDto,
  ) {
    return await this.gitlabCore.listGroupRepositoriesByProvider({
      providerId: providerId === 'default' ? undefined : providerId,
      gitlabUrl: query.gitlabUrl,
      gitlabToken: query.gitlabToken,
      groupId,
      query: {
        page: query.page,
        perPage: query.perPage,
        search: query.search,
        visibility: query.visibility,
        archived: this.parseOptionalBoolean(query.archived),
        includeSubgroups:
          this.parseOptionalBoolean(query.includeSubgroups) ?? true,
      },
    });
  }

  @Get('gitlab/providers/:providerId/projects/:gitlabProjectId/branches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List branches before project/service creation',
  })
  @ApiResponse({ status: 200, description: 'Branches du repository GitLab' })
  async listProjectBranchesByProvider(
    @Param('providerId') providerId: string,
    @Param('gitlabProjectId') gitlabProjectId: string,
    @Query() query: ListGroupRepositoriesQueryDto,
  ) {
    return await this.gitlabCore.listProjectBranchesByProvider({
      providerId: providerId === 'default' ? undefined : providerId,
      gitlabUrl: query.gitlabUrl,
      gitlabToken: query.gitlabToken,
      projectId: gitlabProjectId,
    });
  }

  @Post('projects/:id/gitlab/connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect a project to GitLab' })
  @ApiResponse({ status: 201, description: 'GitLab configuration saved' })
  @ApiResponse({ status: 400, description: 'GitLab connection failed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async connectProject(
    @Param('id') projectId: string,
    @Body() dto: ConnectGitlabDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabCore.connectProject(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }

  @Get('projects/:id/gitlab/branches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List available GitLab branches' })
  @ApiResponse({ status: 200, description: 'GitLab branches fetched' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({
    status: 404,
    description: 'Project or GitLab config not found',
  })
  async getBranches(
    @Param('id') projectId: string,
    @Query('repoId') repoId: string | undefined,
    @GetUser() user: JwtPayload,
  ) {
    const parsedRepoId = this.parseOptionalRepoId(repoId);
    return await this.gitlabCore.getBranches(
      projectId,
      user.id,
      user.role,
      parsedRepoId,
    );
  }

  @Get('projects/:id/gitlab/pipelines')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List GitLab pipelines' })
  @ApiResponse({ status: 200, description: 'GitLab pipelines fetched' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({
    status: 404,
    description: 'Project or GitLab config not found',
  })
  async getPipelines(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabCore.getPipelines(projectId, user.id, user.role);
  }

  @Get('projects/:id/gitlab/repos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List repositories (REPO/GROUP)' })
  @ApiResponse({ status: 200, description: 'GitLab repositories fetched' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({
    status: 404,
    description: 'Project or GitLab config not found',
  })
  async getRepos(@Param('id') projectId: string, @GetUser() user: JwtPayload) {
    return await this.gitlabCore.getRepos(projectId, user.id, user.role);
  }

  @Post('projects/:id/gitlab/pipelines/trigger')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger a GitLab pipeline manually' })
  @ApiResponse({ status: 201, description: 'GitLab pipeline triggered' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({
    status: 404,
    description: 'Project or GitLab config not found',
  })
  async triggerPipeline(
    @Param('id') projectId: string,
    @Body() dto: TriggerPipelineDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabCore.triggerPipeline(
      projectId,
      dto.branch,
      user.id,
      user.role,
      dto.repoId,
    );
  }

  @Get('projects/:id/gitlab/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "View a project's GitLab configuration" })
  @ApiResponse({ status: 200, description: 'GitLab configuration returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized access' })
  @ApiResponse({
    status: 404,
    description: 'Project or GitLab config not found',
  })
  async getGitlabConfig(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabCore.getGitlabConfig(
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

  private parseOptionalBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined || value.trim().length === 0) {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }

    return undefined;
  }
}
