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
import { CreateServiceEnvironmentDto } from './dto/create-service-environment.dto';
import { UpdateServiceEnvironmentDto } from './dto/update-service-environment.dto';
import { ServiceEnvironmentsService } from './service-environments.service';

@ApiTags('ServiceEnvironments')
@ApiBearerAuth()
@Controller('projects/:projectId/service-environments')
@UseGuards(JwtAuthGuard)
export class ServiceEnvironmentsController {
  constructor(private readonly service: ServiceEnvironmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Lier un service à un environnement' })
  @ApiResponse({ status: 201, description: 'Lien créé' })
  @ApiResponse({ status: 409, description: 'Lien déjà existant' })
  async link(
    @Param('projectId') projectId: string,
    @Body() dto: CreateServiceEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.service.link(projectId, dto, user.id, user.role);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les liens du projet (par service ou environment)' })
  async findAll(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return { message: 'Utilisez GET /services/:id/environments ou GET /environments/:id/services' };
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un lien service-environnement" })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.service.findOne(projectId, id, user.id, user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour les overrides du lien' })
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.service.update(projectId, id, dto, user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un lien service-environnement' })
  async unlink(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.service.unlink(projectId, id, user.id, user.role);
    return { message: 'Lien supprimé avec succès' };
  }
}
