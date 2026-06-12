import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CreateVolumeDto, UpdateVolumeDto } from './dto/volume.dto';
import { VolumesService } from './volumes.service';

@ApiTags('volumes')
@UseGuards(JwtAuthGuard)
@Controller('volumes')
export class VolumesController {
  constructor(private readonly volumesService: VolumesService) {}

  @Get()
  @ApiOperation({ summary: 'List volumes' })
  findAll(
    @Query('serverId') serverId?: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.volumesService.findAll({ serverId, serviceId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a volume by ID' })
  findOne(@Param('id') id: string) {
    return this.volumesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a persistent volume' })
  create(@Body() dto: CreateVolumeDto) {
    return this.volumesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a volume' })
  update(@Param('id') id: string, @Body() dto: UpdateVolumeDto) {
    return this.volumesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a volume' })
  remove(@Param('id') id: string) {
    return this.volumesService.remove(id);
  }
}
