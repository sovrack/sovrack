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
  @ApiOperation({ summary: 'Link a service to an environment' })
  @ApiResponse({ status: 201, description: 'Link created' })
  @ApiResponse({ status: 409, description: 'Link already exists' })
  async link(
    @Param('projectId') projectId: string,
    @Body() dto: CreateServiceEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.service.link(projectId, dto, user.id, user.role);
  }

  @Get()
  @ApiOperation({
    summary: 'List all project links (by service or environment)',
  })
  async findAll(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return {
      message:
        'Utilisez GET /services/:id/environments ou GET /environments/:id/services',
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Service-environment link details' })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.service.findOne(projectId, id, user.id, user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update the link overrides' })
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceEnvironmentDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.service.update(projectId, id, dto, user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a service-environment link' })
  async unlink(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.service.unlink(projectId, id, user.id, user.role);
    return { message: 'Lien supprimé avec succès' };
  }
}
