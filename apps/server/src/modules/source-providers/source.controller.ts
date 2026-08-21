import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { GetWorkspaceId } from '../../shared/decorators/get-workspace-id.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../iam/authorization/workspace.guard';
import { ProjectWorkspaceGuard } from '../iam/authorization/project-workspace.guard';
import { RequireProjectAction } from '../iam/authorization/require-project-action.decorator';
import { ProjectActions } from '../iam/authorization/workspace-policy.types';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { SourceProvidersService } from './source-providers.service';
import { ConnectSourceDto } from './dto/connect-source.dto';

@ApiTags('Source (unified)')
@Controller()
export class SourceController {
  constructor(private readonly gitProvidersService: SourceProvidersService) {}

  @Get(['workspaces/:workspaceId/source/providers', 'source/providers'])
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all source providers (GitHub + GitLab) with their type',
  })
  @ApiResponse({ status: 200, description: 'Liste des providers source' })
  async listProviders(@GetWorkspaceId() workspaceId: string) {
    return await this.gitProvidersService.listSourceProviders(workspaceId);
  }

  @Post([
    'workspaces/:workspaceId/projects/:id/source/connect',
    'projects/:id/source/connect',
  ])
  @UseGuards(JwtAuthGuard, ProjectWorkspaceGuard)
  @RequireProjectAction(ProjectActions.UPDATE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Connect a Git source (GitLab or GitHub) to a project',
  })
  @ApiResponse({ status: 201, description: 'Source connected' })
  @ApiResponse({ status: 400, description: 'Connection failed' })
  async connectSource(
    @Param('id') projectId: string,
    @Body() dto: ConnectSourceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitProvidersService.connectSource(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }
}
