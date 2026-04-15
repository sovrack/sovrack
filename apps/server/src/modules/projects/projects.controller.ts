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
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

/**
 * Contrôleur de gestion des projets.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Créer un projet' })
  @ApiResponse({ status: 201, description: 'Projet créé avec succès' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({
    status: 403,
    description: 'Action réservée aux administrateurs',
  })
  async create(@GetUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return await this.projectsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les projets selon le rôle utilisateur' })
  @ApiResponse({ status: 200, description: 'Liste des projets' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async findAll(@GetUser() user: JwtPayload) {
    return await this.projectsService.findAll(user.id, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer le détail d’un projet' })
  @ApiResponse({ status: 200, description: 'Détail du projet récupéré' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé au projet' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.projectsService.findOne(id, user.id, user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un projet' })
  @ApiResponse({ status: 200, description: 'Projet mis à jour' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async update(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: UpdateProjectDto,
  ) {
    return await this.projectsService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un projet' })
  @ApiResponse({ status: 200, description: 'Projet supprimé' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.projectsService.remove(id, user.id, user.role);
    return { message: 'Projet supprimé avec succès' };
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Ajouter un membre au projet' })
  @ApiResponse({ status: 201, description: 'Membre ajouté au projet' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Projet ou utilisateur non trouvé' })
  @ApiResponse({ status: 409, description: 'Utilisateur déjà membre' })
  async addMember(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: AddMemberDto,
  ) {
    return await this.projectsService.addMember(id, user.id, user.role, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Lister les membres du projet' })
  @ApiResponse({ status: 200, description: 'Liste des membres du projet' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé au projet' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async getMembers(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.projectsService.getMembers(id, user.id, user.role);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Retirer un membre du projet' })
  @ApiResponse({ status: 200, description: 'Membre retiré du projet' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Projet ou membre non trouvé' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.projectsService.removeMember(
      id,
      user.id,
      user.role,
      targetUserId,
    );
  }
}
