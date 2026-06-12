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
import { GetUser } from '../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { DiscoverGroupDto } from './dto/discover-group.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@ApiTags('Services')
@ApiBearerAuth()
@Controller('projects/:projectId/services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: "Lister les services d'un projet" })
  @ApiResponse({ status: 200, description: 'Liste des services' })
  async findAll(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.findAll(projectId, user.id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un service dans un projet' })
  @ApiResponse({ status: 201, description: 'Service créé' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateServiceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.create(projectId, dto, user.id, user.role);
  }

  @Post('discover-group')
  @ApiOperation({ summary: 'Découvrir les repos d\'un groupe/org pour créer des services' })
  async discoverGroup(
    @Param('projectId') projectId: string,
    @Body() dto: DiscoverGroupDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.discoverGroup(projectId, dto, user.id, user.role);
  }

  @Get(':serviceId')
  @ApiOperation({ summary: "Détail d'un service" })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.findOne(projectId, serviceId, user.id, user.role);
  }

  @Put(':serviceId')
  @ApiOperation({ summary: 'Mettre à jour un service' })
  async update(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateServiceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.update(projectId, serviceId, dto, user.id, user.role);
  }

  @Delete(':serviceId')
  @ApiOperation({ summary: 'Supprimer un service' })
  async remove(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.servicesService.remove(projectId, serviceId, user.id, user.role);
    return { message: 'Service supprimé avec succès' };
  }
}
