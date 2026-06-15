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
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
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
  @ApiOperation({
    summary: "Add all members of a team to a project",
  })
  @ApiResponse({
    status: 200,
    description: "Team members added to the project",
  })
  @ApiResponse({ status: 404, description: 'Project or team not found' })
  async addTeamToProject(
    @Param('projectId') projectId: string,
    @Param('teamId') teamId: string,
  ) {
    await this.teamsService.addTeamToProject(projectId, teamId);
    return { message: "Les membres de l'équipe ont été ajoutés au projet" };
  }
}
