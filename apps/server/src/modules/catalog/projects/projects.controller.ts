import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../../core/http/pagination.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ImportGitlabGroupDto } from './dto/import-gitlab-group.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';
import { ProjectImportService } from './services/project-import.service';
import { ProjectMembersService } from './services/project-members.service';

/**
 * Contrôleur de gestion des projets.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly membersService: ProjectMembersService,
    private readonly importService: ProjectImportService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Créer un projet' })
  @ApiResponse({ status: 201, description: 'Projet créé avec succès' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({
    status: 403,
    description: 'Action réservée aux administrateurs',
  })
  async create(@GetUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return await this.projectsService.create(user.id, user.role, dto);
  }

  @Post('import/gitlab-group')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary:
      'Importer des repositories GitLab Group en application multi-services ou projets séparés',
  })
  @ApiResponse({ status: 201, description: 'Import GitLab Group terminé' })
  async importGitlabGroup(
    @GetUser() user: JwtPayload,
    @Body() dto: ImportGitlabGroupDto,
  ) {
    return await this.importService.importGitlabGroup(
      user.id,
      user.role,
      dto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister les projets selon le rôle utilisateur' })
  @ApiResponse({ status: 200, description: 'Liste des projets' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async findAll(
    @GetUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
  ) {
    return await this.projectsService.findAll(user.id, user.role, pagination);
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
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
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
    return await this.membersService.addMember(id, user.id, user.role, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Lister les membres du projet' })
  @ApiResponse({ status: 200, description: 'Liste des membres du projet' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé au projet' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async getMembers(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.membersService.getMembers(id, user.id, user.role);
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
    return await this.membersService.removeMember(
      id,
      user.id,
      user.role,
      targetUserId,
    );
  }
}
