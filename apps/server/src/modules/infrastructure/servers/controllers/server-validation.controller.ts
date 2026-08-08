import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/guards/roles.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import {
  ServerLogDto,
  ServerResponseDto,
  ServerValidationResultDto,
  ServerVerificationStatusDto,
} from '../dto/server-response.dto';
import { ServersCoreService } from '../services';
import {
  serverHasDocker,
  serverHasRunner,
} from '../../../../adapters/server-capabilities/server-capabilities.util';

@ApiTags('Servers Validation')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MEMBER)
export class ServerValidationController {
  constructor(private readonly core: ServersCoreService) {}

  @Post(':id/validate-ssh')
  @ApiOperation({
    summary:
      'Validate the SSH connection, auth, sudo and minimal prerequisites',
    description:
      'VPS hosts are agentless SSH targets. This step never tries to install Ansible on the VPS.',
  })
  @ApiCreatedResponse({
    description: 'SSH validation started',
    type: ServerResponseDto,
  })
  async validateSsh(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.core.verifyServer(id, user.id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get the server verification status' })
  @ApiOkResponse({
    description: 'Server verification status',
    type: ServerVerificationStatusDto,
  })
  async getVerificationStatus(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
  ) {
    const server = await this.core.findOne(id, user.id);
    const recentLogs = await this.core.getRecentVerificationLogs(id, 10);

    return {
      id: server.id,
      name: server.name,
      status: server.status,
      verificationError: server.verificationError,
      lastVerifiedAt: server.lastVerifiedAt,
      isVerified: server.isVerified,
      hasDocker: serverHasDocker(server),
      hasRunner: serverHasRunner(server),
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        serverId: log.serverId,
        message: log.message,
        level: log.level,
        context: log.context,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get the server verification logs' })
  @ApiOkResponse({
    description: 'Server verification logs',
    type: ServerLogDto,
    isArray: true,
  })
  async getVerificationLogs(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const logs = await this.core.getRecentVerificationLogs(
      id,
      limit ? Number.parseInt(limit, 10) : 50,
    );

    return logs.map((log) => ({
      id: log.id,
      serverId: log.serverId,
      message: log.message,
      level: log.level,
      context: log.context,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  @Get(':id/validation-results')
  @ApiOperation({ summary: 'List SSH validation results' })
  @ApiOkResponse({ type: ServerValidationResultDto, isArray: true })
  async getValidationResults(@Param('id') id: string) {
    return await this.core.listValidationResults(id);
  }
}
