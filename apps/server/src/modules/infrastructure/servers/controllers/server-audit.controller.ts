import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/guards/roles.guard';
import { ServerAuditEventDto } from '../dto/server-response.dto';
import { ServersCoreService } from '../services';

@ApiTags('Servers Audit')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MEMBER)
export class ServerAuditController {
  constructor(private readonly core: ServersCoreService) {}

  @Get(':id/audit-events')
  @ApiOperation({ summary: "Lister l'audit des actions serveur sensibles" })
  @ApiOkResponse({ type: ServerAuditEventDto, isArray: true })
  async getAuditEvents(@Param('id') id: string) {
    return await this.core.listAuditEvents(id);
  }
}
