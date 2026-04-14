import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TeamsService } from './teams.service';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ProjectTeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post(':projectId/teams/:teamId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ajouter tous les membres d'une équipe à un projet" })
  @ApiResponse({ status: 200, description: 'Membres de l\'équipe ajoutés au projet' })
  @ApiResponse({ status: 404, description: 'Projet ou équipe introuvable' })
  async addTeamToProject(
    @Param('projectId') projectId: string,
    @Param('teamId') teamId: string,
  ) {
    await this.teamsService.addTeamToProject(projectId, teamId);
    return { message: "Les membres de l'équipe ont été ajoutés au projet" };
  }
}
