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
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
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

// ─── GitHub DTO aliases (same shape as GitLab DTOs) ────────────────────

type CreateGithubProviderDto = CreateGitlabProviderDto;
type UpdateGithubProviderDto = UpdateGitlabProviderDto;

@ApiTags('Git Providers (Admin)')
@ApiBearerAuth()
@Controller('admin/platform-config')
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class SourceProvidersController {
  constructor(
    private readonly gitProviders: GitProviderConfigService,
    private readonly oauth: GitProviderOauthService,
  ) {}

  // ─── GitLab Providers ──────────────────────────────────────────────────

  @Get('gitlab/providers')
  @ApiOperation({ summary: 'List GitLab providers' })
  async listGitlabProviders() {
    return this.gitProviders.listGitlabProviders();
  }

  @Post('gitlab/providers')
  @ApiOperation({ summary: 'Create a GitLab provider' })
  async createGitlabProvider(@Body() dto: CreateGitlabProviderDto) {
    return this.gitProviders.createGitlabProvider(dto);
  }

  @Put('gitlab/providers/:id')
  @ApiOperation({ summary: 'Update a GitLab provider' })
  async updateGitlabProvider(
    @Param('id') id: string,
    @Body() dto: UpdateGitlabProviderDto,
  ) {
    return this.gitProviders.updateGitlabProvider(id, dto);
  }

  @Delete('gitlab/providers/:id')
  @ApiOperation({ summary: 'Delete a GitLab provider' })
  async deleteGitlabProvider(@Param('id') id: string) {
    await this.gitProviders.deleteGitlabProvider(id);
    return { ok: true };
  }

  @Post('gitlab/providers/:id/default')
  @ApiOperation({ summary: 'Set a default GitLab provider' })
  async setDefaultGitlabProvider(@Param('id') id: string) {
    return this.gitProviders.setDefaultGitlabProvider(id);
  }

  @Post('gitlab/providers/:id/test')
  @ApiOperation({ summary: 'Test the GitLab connection for a provider' })
  async testGitlabProvider(@Param('id') id: string) {
    return this.gitProviders.testGitlab(id);
  }

  @Post('gitlab/providers/:id/oauth/start')
  @ApiOperation({ summary: 'Start GitLab OAuth for a provider' })
  async startGitlabOAuthForProvider(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.oauth.startGitlabOAuthForProvider(
      id,
      this.resolvePublicBaseUrl(req),
    );
  }

  @Post('test-gitlab')
  @ApiOperation({
    summary: 'Test the global GitLab connection (default provider)',
  })
  async testGitlab() {
    return this.gitProviders.testGitlab();
  }

  @Post('gitlab/oauth/start')
  @ApiOperation({ summary: 'Start global GitLab OAuth (default provider)' })
  async startGitlabOAuth(@Req() req: Request) {
    return this.oauth.startGitlabOAuth(this.resolvePublicBaseUrl(req));
  }

  // ─── GitHub Providers ──────────────────────────────────────────────────

  @Get('github/providers')
  @ApiOperation({ summary: 'List GitHub providers' })
  async listGithubProviders() {
    return this.gitProviders.listGithubProviders();
  }

  @Post('github/providers')
  @ApiOperation({ summary: 'Create a GitHub provider' })
  async createGithubProvider(@Body() dto: CreateGithubProviderDto) {
    return this.gitProviders.createGithubProvider(dto);
  }

  @Put('github/providers/:id')
  @ApiOperation({ summary: 'Update a GitHub provider' })
  async updateGithubProvider(
    @Param('id') id: string,
    @Body() dto: UpdateGithubProviderDto,
  ) {
    return this.gitProviders.updateGithubProvider(id, dto);
  }

  @Delete('github/providers/:id')
  @ApiOperation({ summary: 'Delete a GitHub provider' })
  async deleteGithubProvider(@Param('id') id: string) {
    await this.gitProviders.deleteGithubProvider(id);
    return { ok: true };
  }

  @Post('github/providers/:id/default')
  @ApiOperation({ summary: 'Set a default GitHub provider' })
  async setDefaultGithubProvider(@Param('id') id: string) {
    return this.gitProviders.setDefaultGithubProvider(id);
  }

  @Post('github/providers/:id/test')
  @ApiOperation({ summary: 'Test the GitHub connection for a provider' })
  async testGithubProvider(@Param('id') id: string) {
    return this.gitProviders.testGithubProvider(id);
  }

  @Get('github/providers/:id/repos')
  @ApiOperation({ summary: 'List GitHub repos accessible via this provider' })
  async listGithubRepos(@Param('id') id: string) {
    return this.gitProviders.listGithubRepos(id);
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
