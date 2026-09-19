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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { CreateVolumeDto, UpdateVolumeDto } from './dto/volume.dto';
import { VolumesService } from './volumes.service';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { GetWorkspaceId } from '../../../shared/decorators/get-workspace-id.decorator';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { RequiresProductCapability } from '../../../shared/product-capabilities/requires-product-capability.decorator';
import { ProductCapabilities } from '../../../shared/product-capabilities/product-capability';

@ApiTags('volumes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(['workspaces/:workspaceId/volumes', 'volumes'])
@RequiresProductCapability(ProductCapabilities.PERSISTENT_VOLUMES)
export class VolumesController {
  constructor(private readonly volumesService: VolumesService) {}

  @Get()
  @ApiOperation({ summary: 'List volumes' })
  findAll(
    @GetUser() user: JwtPayload,
    @Query('serverId') serverId?: string,
    @Query('serviceId') serviceId?: string,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.volumesService.findAll(
      { serverId, serviceId },
      user.id,
      workspaceId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a volume by ID' })
  findOne(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.volumesService.findOne(id, user.id, workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a persistent volume' })
  create(
    @Body() dto: CreateVolumeDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.volumesService.create(dto, user.id, workspaceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a volume' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVolumeDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.volumesService.update(id, dto, user.id, workspaceId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a volume' })
  remove(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.volumesService.remove(id, user.id, workspaceId);
  }
}
