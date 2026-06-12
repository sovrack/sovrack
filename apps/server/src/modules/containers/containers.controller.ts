import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { ContainersService } from './containers.service';
import { ContainerListQueryDto, ContainerLogsQueryDto } from './dto/container-query.dto';
import { DockerApiService } from '../../core/container-runtime/docker-api.service';

@ApiTags('containers')
@UseGuards(JwtAuthGuard)
@Controller('containers')
export class ContainersController {
  constructor(
    private readonly containersService: ContainersService,
    private readonly docker: DockerApiService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tracked containers' })
  findAll(@Query() query: ContainerListQueryDto) {
    return this.containersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a container by ID' })
  findOne(@Param('id') id: string) {
    return this.containersService.findOne(id);
  }

  @Get(':id/inspect')
  @ApiOperation({ summary: 'Inspect a running container via Docker API' })
  inspect(@Param('id') id: string) {
    return this.containersService.inspect(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get container resource stats' })
  stats(@Param('id') id: string) {
    return this.containersService.getStats(id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start a container' })
  start(@Param('id') id: string) {
    return this.containersService.start(id);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop a container' })
  stop(@Param('id') id: string) {
    return this.containersService.stop(id);
  }

  @Post(':id/restart')
  @ApiOperation({ summary: 'Restart a container' })
  restart(@Param('id') id: string) {
    return this.containersService.restart(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a container' })
  remove(@Param('id') id: string) {
    return this.containersService.remove(id);
  }

  @Post('sync/:serverId')
  @ApiOperation({ summary: 'Sync containers from a Docker host' })
  sync(@Param('serverId') serverId: string) {
    return this.containersService.syncFromDocker(serverId);
  }
}
