import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../../core/jwt/dto/jwt-payload.dto';
import { GithubService } from './github.service';

@ApiTags('GitHub')
@Controller()
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  /* ── Authenticated project endpoints ────────────────────────────────── */

  @Get('projects/:id/github/repos')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List GitHub repositories for a project' })
  async listRepos(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listRepos(projectId, user.id, user.role);
  }

  @Get('projects/:id/github/repos/:repoId/branches')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
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

  @Get('projects/:id/github/pipelines')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List recent GitHub Actions workflow runs' })
  async listPipelines(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listPipelines(projectId, user.id, user.role);
  }
}
