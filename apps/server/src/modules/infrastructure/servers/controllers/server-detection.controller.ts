import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { ServerWorkspaceGuard } from '../../../iam/authorization/server-workspace.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import {
  ServerCapabilityDto,
  ServerInstalledToolDto,
  ServerResponseDto,
} from '../dto/server-response.dto';
import { ServersCoreService } from '../services';
import { RequireServerAction } from '../../../iam/authorization/require-server-action.decorator';
import { WorkspaceActions } from '../../../iam/authorization/workspace-policy.types';

@ApiTags('Servers Detection')
@ApiBearerAuth()
@Controller(['workspaces/:workspaceId/servers', 'servers'])
@UseGuards(ServerWorkspaceGuard)
export class ServerDetectionController {
  constructor(private readonly core: ServersCoreService) {}

  @Post(':id/detect')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary: 'Detect system info and installed tools',
  })
  @ApiCreatedResponse({
    description: 'Detection complete',
    type: ServerResponseDto,
  })
  async detect(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.core.detectServer(id, user.id);
  }

  @Get(':id/capabilities')
  @ApiOperation({ summary: 'List the detected server capabilities' })
  @ApiOkResponse({ type: ServerCapabilityDto, isArray: true })
  async getCapabilities(@Param('id') id: string) {
    return await this.core.listCapabilities(id);
  }

  @Get(':id/installed-tools')
  @ApiOperation({ summary: 'List detected installed tools' })
  @ApiOkResponse({ type: ServerInstalledToolDto, isArray: true })
  async getInstalledTools(@Param('id') id: string) {
    return await this.core.listInstalledTools(id);
  }
}
