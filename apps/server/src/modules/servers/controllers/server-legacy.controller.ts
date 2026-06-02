import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { InstallToolsDto } from '../dto/install-tools.dto';
import { PrepareServerDto } from '../dto/prepare-server.dto';
import {
  ServerResponseDto,
  VerifyServerResponseDto,
} from '../dto/server-response.dto';
import { ServersCoreService } from '../services';

@ApiTags('Servers Legacy (Deprecated)')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerLegacyController {
  constructor(private readonly core: ServersCoreService) {}

  @Post(':id/verify')
  @ApiOperation({
    summary: 'DEPRECATED: utiliser POST /servers/:id/validate-ssh',
    description:
      'Alias legacy temporaire. Les VPS restent agentless, Ansible est exécuté uniquement sur la machine de contrôle.',
  })
  @ApiCreatedResponse({ type: ServerResponseDto })
  @ApiResponse({ status: 410, description: 'Endpoint legacy retiré' })
  async verify(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.guardLegacy('POST /servers/:id/verify', id, user.id, res);
    return await this.core.verifyServer(id, user.id);
  }

  @Post(':id/install')
  @ApiOperation({
    summary: 'DEPRECATED: utiliser POST /servers/:id/preparations',
    description:
      "Alias legacy temporaire. Le champ ansible est ignoré: Ansible n'est jamais installé sur le VPS cible.",
  })
  @ApiCreatedResponse({ type: ServerResponseDto })
  @ApiResponse({ status: 410, description: 'Endpoint legacy retiré' })
  async install(
    @Param('id') id: string,
    @Body() dto: InstallToolsDto,
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.guardLegacy('POST /servers/:id/install', id, user.id, res);
    return await this.core.installTools(id, dto);
  }

  @Post(':id/prepare')
  @ApiOperation({
    summary: 'DEPRECATED: utiliser POST /servers/:id/preparations',
    description:
      'Alias legacy temporaire vers le workflow ServerPreparation moderne.',
  })
  @ApiCreatedResponse({ type: ServerResponseDto })
  @ApiResponse({ status: 410, description: 'Endpoint legacy retiré' })
  async prepare(
    @Param('id') id: string,
    @Body() dto: PrepareServerDto,
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.guardLegacy('POST /servers/:id/prepare', id, user.id, res);
    return await this.core.prepareServer(id, dto, user.id);
  }

  @Post(':id/retry-verification')
  @ApiOperation({
    summary: 'DEPRECATED: utiliser POST /servers/:id/validate-ssh',
  })
  @ApiCreatedResponse({ type: VerifyServerResponseDto })
  @ApiResponse({ status: 410, description: 'Endpoint legacy retiré' })
  async retryVerification(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.guardLegacy(
      'POST /servers/:id/retry-verification',
      id,
      user.id,
      res,
    );
    await this.core.resetVerificationStatus(id);
    const result = await this.core.verifyServer(id, user.id);

    return {
      serverId: id,
      message: 'Verification started, check status endpoint for updates',
      status: result.status,
    };
  }

  @Post(':id/jobs/:jobId/retry')
  @ApiOperation({
    summary: 'DEPRECATED: utiliser /preparations/:id/retry pour la préparation',
    description: 'Alias legacy pour rejouer un ServerJob historique.',
  })
  @ApiCreatedResponse({ type: ServerResponseDto })
  @ApiResponse({ status: 410, description: 'Endpoint legacy retiré' })
  async retryJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.guardLegacy(
      'POST /servers/:id/jobs/:jobId/retry',
      id,
      user.id,
      res,
    );
    return await this.core.retryJob(id, jobId);
  }

  private async guardLegacy(
    endpoint: string,
    serverId: string,
    actorId: string,
    res: Response,
  ): Promise<void> {
    await this.core.guardLegacyEndpoint(endpoint, serverId, actorId, (name, value) => {
      res.setHeader(name, value);
    });
  }
}
