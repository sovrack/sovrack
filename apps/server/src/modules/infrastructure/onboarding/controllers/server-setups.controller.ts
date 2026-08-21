import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetWorkspaceId } from '../../../../shared/decorators/get-workspace-id.decorator';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../../../iam/authorization/workspace.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { RetryServerSetupDto } from '../../servers/dto';
import {
  ServerSetupLogDto,
  ServerSetupDto,
} from '../../servers/dto/server-response.dto';
import { ServerSetupService } from '../services/infra-setup.service';

@ApiTags('Server Setups')
@ApiBearerAuth()
@Controller(['workspaces/:workspaceId/setups', 'setups'])
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ServerSetupsController {
  constructor(private readonly prep: ServerSetupService) {}

  @Get(':id')
  @ApiOperation({ summary: "View a server provisioning's details" })
  @ApiOkResponse({ type: ServerSetupDto })
  async findOne(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.prep.getSetup(id, workspaceId);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Read the persisted logs of a provisioning job' })
  @ApiOkResponse({ type: ServerSetupLogDto, isArray: true })
  async logs(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
    @Query('afterLine') afterLine?: string,
  ) {
    return await this.prep.getSetupLogs(
      id,
      afterLine ? Number(afterLine) : undefined,
      workspaceId,
    );
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Re-run a provisioning by creating a new linked job',
  })
  @ApiCreatedResponse({ type: ServerSetupDto })
  async retry(
    @Param('id') id: string,
    @Body() dto: RetryServerSetupDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.prep.retrySetup(id, dto, user.id, workspaceId);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a provisioning job if still active',
  })
  @ApiOkResponse({ type: ServerSetupDto })
  async cancel(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.prep.cancelSetup(id, user.id, workspaceId);
  }
}
