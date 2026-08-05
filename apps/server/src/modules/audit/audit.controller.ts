import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/decorators/roles.decorator';
import { PaginationDto } from '../../shared/http/pagination.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly auditLogsService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs (admin)' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Admins only' })
  async findAll(@Query() pagination: PaginationDto) {
    return await this.auditLogsService.findAll(pagination);
  }
}
