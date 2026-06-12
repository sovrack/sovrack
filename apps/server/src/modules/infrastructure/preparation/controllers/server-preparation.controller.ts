import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
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
import { Roles } from '../../../../core/decorators/roles.decorator';
import { GetUser } from '../../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../core/guards/roles.guard';
import type { JwtPayload } from '../../../../core/jwt/dto/jwt-payload.dto';
import { StartServerPreparationDto } from '../../servers/dto';
import {
  ServerPreparationDto,
  ServerPreparationReadinessDto,
} from '../../servers/dto/server-response.dto';
import { ServerPreparationService } from '../services/infra-preparation.service';

@ApiTags('Servers Preparation')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerPreparationController {
  private readonly logger = new Logger(ServerPreparationController.name);

  constructor(private readonly prep: ServerPreparationService) {}

  @Post(':id/preparations')
  @ApiOperation({ summary: 'Démarrer une préparation serveur' })
  @ApiCreatedResponse({ type: ServerPreparationDto })
  async startPreparation(
    @Param('id') id: string,
    @Body() dto: StartServerPreparationDto,
    @GetUser() user: JwtPayload,
  ) {
    try {
      return await this.prep.startPreparation(id, dto, user.id);
    } catch (error) {
      // Re-throw NestJS HTTP exceptions (BadRequest, NotFound, etc.) directly
      if (
        error instanceof Error &&
        'getStatus' in error &&
        typeof (error as { getStatus: () => number }).getStatus === 'function'
      ) {
        throw error;
      }
      // Log internal errors server-side, return clean message to client
      this.logger.error(
        `Failed to start preparation for server ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Preparation could not be started. Check server readiness or backend logs.',
      );
    }
  }

  @Get(':id/preparations')
  @ApiOperation({ summary: "Lister l'historique de préparation du serveur" })
  @ApiOkResponse({ type: ServerPreparationDto, isArray: true })
  async listPreparations(@Param('id') id: string) {
    return await this.prep.listPreparations(id);
  }

  @Get(':id/preparation-readiness')
  @ApiOperation({
    summary:
      'Vérifier si le serveur est prêt à lancer une préparation (SSH/sudo/état/verrou).',
  })
  @ApiOkResponse({ type: ServerPreparationReadinessDto })
  async getPreparationReadiness(@Param('id') id: string) {
    return await this.prep.getPreparationReadiness(id);
  }
}
