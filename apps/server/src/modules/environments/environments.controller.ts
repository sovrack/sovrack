import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';
import { EnvironmentsService } from './environments.service';

@ApiTags('Environments')
@ApiBearerAuth()
@Controller('projects/:id/environments')
@UseGuards(JwtAuthGuard)
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un environnement pour un projet' })
  @ApiResponse({ status: 201, description: 'Environnement créé avec succès' })
  @ApiResponse({ status: 400, description: 'Serveur non vérifié' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Projet ou serveur non trouvé' })
  async create(
    @Param('id') projectId: string,
    @Body() dto: CreateEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.create(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }

  @Get()
  @ApiOperation({ summary: "Lister les environnements d'un projet" })
  @ApiResponse({ status: 200, description: 'Liste des environnements' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async findAll(@Param('id') projectId: string, @GetUser() user: JwtPayload) {
    return await this.environmentsService.findAll(
      projectId,
      user.id,
      user.role,
    );
  }

  @Get(':envId')
  @ApiOperation({ summary: "Détail d'un environnement de projet" })
  @ApiResponse({ status: 200, description: 'Détail environnement' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou environnement non trouvé',
  })
  async findOne(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.findOne(
      projectId,
      envId,
      user.id,
      user.role,
    );
  }

  @Put(':envId')
  @ApiOperation({ summary: 'Mettre à jour un environnement de projet' })
  @ApiResponse({ status: 200, description: 'Environnement mis à jour' })
  @ApiResponse({ status: 400, description: 'Serveur non vérifié' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({
    status: 404,
    description: 'Projet, environnement ou serveur non trouvé',
  })
  async update(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @Body() dto: UpdateEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.environmentsService.update(
      projectId,
      envId,
      dto,
      user.id,
      user.role,
    );
  }

  @Delete(':envId')
  @ApiOperation({ summary: 'Supprimer un environnement de projet' })
  @ApiResponse({ status: 200, description: 'Environnement supprimé' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou environnement non trouvé',
  })
  async remove(
    @Param('id') projectId: string,
    @Param('envId') envId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.environmentsService.remove(projectId, envId, user.id, user.role);
    return { message: 'Environnement supprimé avec succès' };
  }
}
