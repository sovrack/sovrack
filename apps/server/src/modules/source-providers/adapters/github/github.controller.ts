import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ProjectWorkspaceGuard } from '../../../iam/authorization/project-workspace.guard';
import { GithubAdapter } from './github.adapter';

@ApiTags('GitHub')
@Controller()
export class GithubController {
  constructor(private readonly githubService: GithubAdapter) {}

  /* ── Authenticated project endpoints ────────────────────────────────── */

  @Get([
    'workspaces/:workspaceId/projects/:id/github/repos',
    'projects/:id/github/repos',
  ])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ProjectWorkspaceGuard)
  @ApiOperation({ summary: 'List GitHub repositories for a project' })
  async listRepos(@Param('id') projectId: string, @GetUser() user: JwtPayload) {
    return await this.githubService.listRepos(projectId, user.id, user.role);
  }

  @Get([
    'workspaces/:workspaceId/projects/:id/github/repos/:repoId/branches',
    'projects/:id/github/repos/:repoId/branches',
  ])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ProjectWorkspaceGuard)
  @ApiOperation({ summary: 'List branches for a GitHub repository' })
  async listBranches(
    @Param('id') projectId: string,
    @Param('repoId') repoId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listBranches(
      projectId,
      user.id,
      user.role,
      repoId,
    );
  }

  @Get([
    'workspaces/:workspaceId/projects/:id/github/pipelines',
    'projects/:id/github/pipelines',
  ])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ProjectWorkspaceGuard)
  @ApiOperation({ summary: 'List recent GitHub Actions workflow runs' })
  async listPipelines(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listPipelines(
      projectId,
      user.id,
      user.role,
    );
  }
}
