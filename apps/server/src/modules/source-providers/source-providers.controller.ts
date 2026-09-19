import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { GetWorkspaceId } from '../../shared/decorators/get-workspace-id.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../iam/authorization/workspace.guard';
import { GitProviderConfigService } from './shared/connection/git-provider-config.service';
import { GitProviderOauthService } from './shared/connection/git-provider-oauth.service';

class CreateGitlabProviderDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() providerUrl!: string;
  @IsOptional() @IsString() internalUrl?: string;
  @IsOptional() @IsString() redirectUri?: string;
  @IsOptional() @IsString() applicationId?: string;
  @IsOptional() @IsString() applicationSecret?: string;
  @IsOptional() @IsString() groupNames?: string;
  @IsOptional() @IsString() adminToken?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isDefault?: boolean;
}

class UpdateGitlabProviderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() providerUrl?: string;
  @IsOptional() @IsString() internalUrl?: string;
  @IsOptional() @IsString() redirectUri?: string;
  @IsOptional() @IsString() applicationId?: string;
  @IsOptional() @IsString() applicationSecret?: string;
  @IsOptional() @IsString() groupNames?: string;
  @IsOptional() @IsString() adminToken?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isDefault?: boolean;
}

// GitHub OAuth is intentionally outside the V1. Keep this
// contract PAT-only so unsupported OAuth fields cannot silently be persisted.
class CreateGithubProviderDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() providerUrl!: string;
  @IsOptional() @IsString() internalUrl?: string;
  @IsString() @IsNotEmpty() adminToken!: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isDefault?: boolean;
}

class UpdateGithubProviderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() providerUrl?: string;
  @IsOptional() @IsString() internalUrl?: string;
  @IsOptional() @IsString() @IsNotEmpty() adminToken?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isDefault?: boolean;
}

@ApiTags('Git Providers (Admin)')
@ApiBearerAuth()
@Controller([
  'workspaces/:workspaceId/integrations/git',
  'admin/platform-config',
])
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class SourceProvidersController {
  constructor(
    private readonly gitProviders: GitProviderConfigService,
    private readonly oauth: GitProviderOauthService,
  ) {}

  // ─── GitLab Providers ──────────────────────────────────────────────────

  @Get('gitlab/providers')
  @ApiOperation({ summary: 'List GitLab providers' })
  async listGitlabProviders(@GetWorkspaceId() workspaceId: string) {
    return this.gitProviders.listGitlabProviders(workspaceId);
  }

  @Post('gitlab/providers')
  @ApiOperation({ summary: 'Create a GitLab provider' })
  async createGitlabProvider(
    @Body() dto: CreateGitlabProviderDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.createGitlabProvider(dto, workspaceId);
  }

  @Put('gitlab/providers/:id')
  @ApiOperation({ summary: 'Update a GitLab provider' })
  async updateGitlabProvider(
    @Param('id') id: string,
    @Body() dto: UpdateGitlabProviderDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.updateGitlabProvider(id, dto, workspaceId);
  }

  @Delete('gitlab/providers/:id')
  @ApiOperation({ summary: 'Delete a GitLab provider' })
  async deleteGitlabProvider(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    await this.gitProviders.deleteGitlabProvider(id, workspaceId);
    return { ok: true };
  }

  @Post('gitlab/providers/:id/default')
  @ApiOperation({ summary: 'Set a default GitLab provider' })
  async setDefaultGitlabProvider(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.setDefaultGitlabProvider(id, workspaceId);
  }

  @Post('gitlab/providers/:id/test')
  @ApiOperation({ summary: 'Test the GitLab connection for a provider' })
  async testGitlabProvider(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.testGitlab(workspaceId, id);
  }

  @Post('gitlab/providers/:id/oauth/start')
  @ApiOperation({ summary: 'Start GitLab OAuth for a provider' })
  async startGitlabOAuthForProvider(
    @Param('id') id: string,
    @Req() req: Request,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.oauth.startGitlabOAuthForProvider(
      id,
      workspaceId,
      this.resolvePublicBaseUrl(req),
    );
  }

  @Post('test-gitlab')
  @ApiOperation({
    summary: 'Test the global GitLab connection (default provider)',
  })
  async testGitlab(@GetWorkspaceId() workspaceId: string) {
    return this.gitProviders.testGitlab(workspaceId);
  }

  @Post('gitlab/oauth/start')
  @ApiOperation({ summary: 'Start global GitLab OAuth (default provider)' })
  async startGitlabOAuth(
    @Req() req: Request,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.oauth.startGitlabOAuth(
      workspaceId,
      this.resolvePublicBaseUrl(req),
    );
  }

  // ─── GitHub Providers ──────────────────────────────────────────────────

  @Get('github/providers')
  @ApiOperation({ summary: 'List GitHub providers' })
  async listGithubProviders(@GetWorkspaceId() workspaceId: string) {
    return this.gitProviders.listGithubProviders(workspaceId);
  }

  @Post('github/providers')
  @ApiOperation({ summary: 'Create a GitHub provider' })
  async createGithubProvider(
    @Body() dto: CreateGithubProviderDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.createGithubProvider(dto, workspaceId);
  }

  @Put('github/providers/:id')
  @ApiOperation({ summary: 'Update a GitHub provider' })
  async updateGithubProvider(
    @Param('id') id: string,
    @Body() dto: UpdateGithubProviderDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.updateGithubProvider(id, dto, workspaceId);
  }

  @Delete('github/providers/:id')
  @ApiOperation({ summary: 'Delete a GitHub provider' })
  async deleteGithubProvider(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    await this.gitProviders.deleteGithubProvider(id, workspaceId);
    return { ok: true };
  }

  @Post('github/providers/:id/default')
  @ApiOperation({ summary: 'Set a default GitHub provider' })
  async setDefaultGithubProvider(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.setDefaultGithubProvider(id, workspaceId);
  }

  @Post('github/providers/:id/test')
  @ApiOperation({ summary: 'Test the GitHub connection for a provider' })
  async testGithubProvider(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.testGithubProvider(id, workspaceId);
  }

  @Get('github/providers/:id/repos')
  @ApiOperation({ summary: 'List GitHub repos accessible via this provider' })
  async listGithubRepos(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.gitProviders.listGithubRepos(id, workspaceId);
  }

  private resolvePublicBaseUrl(req: Request): string {
    const forwardedProto = req.header('x-forwarded-proto');
    const forwardedHost = req.header('x-forwarded-host');
    const protocol =
      forwardedProto?.split(',')[0]?.trim() || req.protocol || 'http';
    const host = forwardedHost?.split(',')[0]?.trim() || req.get('host');
    if (!host)
      throw new BadRequestException(
        'Host HTTP manquant pour construire callback',
      );
    return `${protocol}://${host}`;
  }
}
