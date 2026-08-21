import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetWorkspaceId } from '../../shared/decorators/get-workspace-id.decorator';
import { PaginationDto } from '../../shared/http/pagination.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../iam/authorization/workspace.guard';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller(['workspaces/:workspaceId/audit-logs', 'admin/audit-logs'])
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AuditController {
  constructor(private readonly auditLogsService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs (admin)' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Admins only' })
  async findAll(
    @GetWorkspaceId() workspaceId: string,
    @Query() pagination: PaginationDto,
  ) {
    return await this.auditLogsService.findAll(workspaceId, pagination);
  }
}
