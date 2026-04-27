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
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { ValidateServerSshDto } from '../dto';
import {
  ServerLogDto,
  ServerResponseDto,
  ServerValidationResultDto,
  ServerVerificationStatusDto,
} from '../dto/server-response.dto';
import { ServerVerificationService, ServersCoreService } from '../services';

@ApiTags('Servers Validation')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerValidationController {
  constructor(
    private readonly core: ServersCoreService,
    private readonly verification: ServerVerificationService,
  ) {}

  @Post(':id/validate-ssh')
  @ApiOperation({
    summary: 'Valider la connexion SSH, auth, sudo et prérequis minimaux',
    description:
      'Les VPS sont des cibles SSH agentless. Cette étape ne cherche jamais à installer Ansible sur le VPS.',
  })
  @ApiCreatedResponse({
    description: 'Validation SSH démarrée',
    type: ServerResponseDto,
  })
  async validateSsh(
    @Param('id') id: string,
    @Body() dto: ValidateServerSshDto,
    @GetUser() user: JwtPayload,
  ) {
    void dto;
    return await this.core.verifyServer(id, user.id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Récupérer le statut de vérification du serveur' })
  @ApiOkResponse({
    description: 'Statut de vérification du serveur',
    type: ServerVerificationStatusDto,
  })
  async getVerificationStatus(@Param('id') id: string) {
    const server = await this.core.findOne(id);
    const recentLogs = await this.verification.getRecentLogs(id, 10);

    return {
      id: server.id,
      name: server.name,
      status: server.status,
      verificationError: server.verificationError,
      lastVerifiedAt: server.lastVerifiedAt,
      isVerified: server.isVerified,
      hasDocker: server.hasDocker,
      hasRunner: server.hasRunner,
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
  @ApiOperation({ summary: 'Récupérer les logs de vérification du serveur' })
  @ApiOkResponse({
    description: 'Logs de vérification du serveur',
    type: ServerLogDto,
    isArray: true,
  })
  async getVerificationLogs(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    await this.core.findOne(id);
    const logs = await this.verification.getRecentLogs(
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
  @ApiOperation({ summary: 'Lister les résultats de validation SSH' })
  @ApiOkResponse({ type: ServerValidationResultDto, isArray: true })
  async getValidationResults(@Param('id') id: string) {
    return await this.core.listValidationResults(id);
  }
}
