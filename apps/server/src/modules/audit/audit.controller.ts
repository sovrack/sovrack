import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { PaginationDto } from '../../core/http/pagination.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly auditLogsService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les logs d’audit (admin)' })
  @ApiResponse({ status: 200, description: 'Logs d’audit paginés' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux admins' })
  async findAll(@Query() pagination: PaginationDto) {
    return await this.auditLogsService.findAll(pagination);
  }
}
