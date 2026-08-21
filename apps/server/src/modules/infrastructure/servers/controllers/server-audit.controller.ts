import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ServerWorkspaceGuard } from '../../../iam/authorization/server-workspace.guard';
import { ServerAuditEventDto } from '../dto/server-response.dto';
import { ServersCoreService } from '../services';

@ApiTags('Servers Audit')
@ApiBearerAuth()
@Controller(['workspaces/:workspaceId/servers', 'servers'])
@UseGuards(ServerWorkspaceGuard)
export class ServerAuditController {
  constructor(private readonly core: ServersCoreService) {}

  @Get(':id/audit-events')
  @ApiOperation({ summary: "Lister l'audit des actions serveur sensibles" })
  @ApiOkResponse({ type: ServerAuditEventDto, isArray: true })
  async getAuditEvents(@Param('id') id: string) {
    return await this.core.listAuditEvents(id);
  }
}
