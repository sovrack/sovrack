import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { EnvConfigsService } from './env-configs.service';
import { UpsertEnvConfigDto } from './dto/upsert-env-config.dto';

@ApiTags('Env Configs')
@ApiBearerAuth()
@Controller('projects/:id/environments/:envId/configs')
@UseGuards(JwtAuthGuard)
export class EnvConfigsController {
  constructor(private readonly envConfigsService: EnvConfigsService) {}

  @Put()
  @ApiOperation({ summary: 'Créer ou mettre à jour une config par environnement' })
  @ApiResponse({ status: 200, description: 'Config upsertée' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Environnement ou projet introuvable' })
  async upsert(
    @Param('id') projectId: string,
    @Param('envId') environmentId: string,
    @Body() dto: UpsertEnvConfigDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.envConfigsService.upsert(
      projectId,
      environmentId,
      dto.key,
      dto.value,
      dto.isSecret ?? false,
      user.id,
      user.role,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister les configs d\'un environnement (secrets masqués)' })
  @ApiResponse({ status: 200, description: 'Liste des configs' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Environnement ou projet introuvable' })
  async findAll(
    @Param('id') projectId: string,
    @Param('envId') environmentId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.envConfigsService.findAll(
      projectId,
      environmentId,
      user.id,
      user.role,
    );
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Supprimer une config par environnement' })
  @ApiResponse({ status: 200, description: 'Config supprimée' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Environnement ou projet introuvable' })
  async remove(
    @Param('id') projectId: string,
    @Param('envId') environmentId: string,
    @Param('key') key: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.envConfigsService.remove(
      projectId,
      environmentId,
      key,
      user.id,
      user.role,
    );
    return { message: 'Config supprimée avec succès' };
  }
}
