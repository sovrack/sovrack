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
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { CreateProjectServiceDto } from './dto/create-project-service.dto';
import { UpdateProjectServiceDto } from './dto/update-project-service.dto';
import { AppsService } from './apps.service';
import { GitlabService } from '../../git-providers/gitlab/gitlab.service';

@ApiTags('Project Services')
@ApiBearerAuth()
@Controller('projects/:projectId/services')
@UseGuards(JwtAuthGuard)
export class AppsController {
  constructor(
    private readonly appsService: AppsService,
    private readonly gitlabService: GitlabService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Lister les services d'un projet/application" })
  @ApiResponse({ status: 200, description: 'Services du projet' })
  async findAll(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.appsService.findAll(projectId, user.id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un service deployable dans le projet' })
  @ApiResponse({ status: 201, description: 'Service créé' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectServiceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.appsService.create(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }

  @Put(':serviceId')
  @ApiOperation({ summary: 'Mettre à jour un service deployable' })
  @ApiResponse({ status: 200, description: 'Service mis à jour' })
  async update(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateProjectServiceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.appsService.update(
      projectId,
      serviceId,
      dto,
      user.id,
      user.role,
    );
  }

  @Get(':serviceId/pipelines')
  @ApiOperation({ summary: 'Pipelines GitLab pour un service spécifique' })
  @ApiResponse({ status: 200, description: 'Pipelines du service' })
  async getPipelinesForService(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitlabService.getPipelinesForService(
      projectId,
      serviceId,
      user.id,
      user.role,
    );
  }

  @Delete(':serviceId')
  @ApiOperation({ summary: 'Supprimer un service deployable' })
  @ApiResponse({ status: 200, description: 'Service supprimé' })
  async remove(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.appsService.remove(projectId, serviceId, user.id, user.role);
    return { message: 'Service supprimé avec succès' };
  }
}
