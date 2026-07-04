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
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { CreateFromTemplateDto } from './dto/create-from-template.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { DiscoverGroupDto } from './dto/discover-group.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';
import { ServicesCredentialsService } from './services-credentials.service';
import { ServiceTemplatesFactoryService } from './service-templates-factory.service';

@ApiTags('Services')
@ApiBearerAuth()
@Controller('projects/:projectId/services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly credentialsService: ServicesCredentialsService,
    private readonly templatesFactory: ServiceTemplatesFactoryService,
  ) {}

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
  @ApiOperation({ summary: 'Create a service in a project' })
  @ApiResponse({ status: 201, description: 'Service created' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateServiceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.create(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }

  @Post('discover-group')
  @ApiOperation({
    summary: 'Discover the repos of a group/org to create services',
  })
  async discoverGroup(
    @Param('projectId') projectId: string,
    @Body() dto: DiscoverGroupDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.discoverGroup(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }

  @Get('templates')
  @ApiOperation({ summary: 'List one-click service templates' })
  listTemplates() {
    return this.templatesFactory.listTemplates();
  }

  @Post('templates/:templateId')
  @ApiOperation({ summary: 'Create every service of a one-click template' })
  @ApiResponse({ status: 201, description: 'Template services created' })
  async createFromTemplate(
    @Param('projectId') projectId: string,
    @Param('templateId') templateId: string,
    @Body() dto: CreateFromTemplateDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.templatesFactory.createFromTemplate(
      projectId,
      templateId,
      dto.name,
      user.id,
      user.role,
    );
  }

  @Get(':serviceId')
  @ApiOperation({ summary: 'Service details' })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.findOne(
      projectId,
      serviceId,
      user.id,
      user.role,
    );
  }

  @Get(':serviceId/credentials')
  @ApiOperation({
    summary:
      'Get a DATABASE service credentials (dedicated, gated — not the listing route)',
  })
  async getCredentials(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.credentialsService.getCredentials(
      projectId,
      serviceId,
      user.id,
      user.role,
    );
  }

  @Put(':serviceId')
  @ApiOperation({ summary: 'Update a service' })
  async update(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateServiceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.servicesService.update(
      projectId,
      serviceId,
      dto,
      user.id,
      user.role,
    );
  }

  @Delete(':serviceId')
  @ApiOperation({ summary: 'Delete a service' })
  async remove(
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.servicesService.remove(projectId, serviceId, user.id, user.role);
    return { message: 'Service supprimé avec succès' };
  }
}
