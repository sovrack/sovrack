import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { ServerAuditEventDto } from '../dto/server-response.dto';
import { ServersCoreService } from '../services';

@ApiTags('Servers Audit')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerAuditController {
  constructor(private readonly core: ServersCoreService) {}

  @Get(':id/audit-events')
  @ApiOperation({ summary: "Lister l'audit des actions serveur sensibles" })
  @ApiOkResponse({ type: ServerAuditEventDto, isArray: true })
  async getAuditEvents(@Param('id') id: string) {
    return await this.core.listAuditEvents(id);
  }
}
