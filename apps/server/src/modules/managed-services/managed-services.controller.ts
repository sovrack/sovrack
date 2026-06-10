import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CreateManagedServiceDto } from './dto/managed-service.dto';
import { ManagedServicesService } from './managed-services.service';

@ApiTags('managed-services')
@UseGuards(JwtAuthGuard)
@Controller('managed-services')
export class ManagedServicesController {
  constructor(private readonly managedServicesService: ManagedServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List managed services' })
  findAll(
    @Query('projectId') projectId?: string,
    @Query('environmentId') environmentId?: string,
    @Query('serverId') serverId?: string,
  ) {
    return this.managedServicesService.findAll({ projectId, environmentId, serverId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a managed service' })
  findOne(@Param('id') id: string) {
    return this.managedServicesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Provision a managed service' })
  create(@Body() dto: CreateManagedServiceDto) {
    return this.managedServicesService.create(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a managed service' })
  remove(@Param('id') id: string) {
    return this.managedServicesService.remove(id);
  }
}
