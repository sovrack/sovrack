import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { RuntimeLogsService } from '../services/runtime-logs.service';

@ApiTags('Observability')
@ApiBearerAuth()
@Controller('runtime-logs')
@UseGuards(JwtAuthGuard)
export class RuntimeLogsController {
  constructor(private readonly runtimeLogs: RuntimeLogsService) {}

  @Get('service/:serviceEnvId')
  @ApiOperation({
    summary: 'Search the running container logs of a service-environment',
  })
  async searchServiceLogs(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
    @Query('tail') tail?: string,
    @Query('search') search?: string,
    @Query('stream') stream?: 'stdout' | 'stderr' | 'all',
  ) {
    return await this.runtimeLogs.searchServiceLogs(
      serviceEnvId,
      user.id,
      user.role,
      {
        tail: tail ? Number(tail) : undefined,
        search,
        stream,
      },
    );
  }

  @Get('service/:serviceEnvId/history')
  @ApiOperation({
    summary:
      'Search the PERSISTED (Loki) logs of a service-environment over a time window',
  })
  async searchPersistedLogs(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.runtimeLogs.searchPersistedLogs(
      serviceEnvId,
      user.id,
      user.role,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        search,
        limit: limit ? Number(limit) : undefined,
      },
    );
  }
}
