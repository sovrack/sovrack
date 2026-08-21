import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ContainersService } from './containers.service';
import { ContainerListQueryDto } from './dto/container-query.dto';
import { GetWorkspaceId } from '../../../shared/decorators/get-workspace-id.decorator';

@ApiTags('containers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(['workspaces/:workspaceId/containers', 'containers'])
export class ContainersController {
  constructor(private readonly containersService: ContainersService) {}

  @Get()
  @ApiOperation({ summary: 'List tracked containers' })
  findAll(
    @Query() query: ContainerListQueryDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.containersService.findAll(
      query,
      user.id,
      user.role,
      workspaceId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a container by ID' })
  async findOne(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanAccessContainer(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.findOne(id);
  }

  @Get(':id/inspect')
  @ApiOperation({ summary: 'Inspect a running container via Docker API' })
  async inspect(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanAccessContainer(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.inspect(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get container resource stats' })
  async stats(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanAccessContainer(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.getStats(id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start a container' })
  async start(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanManageContainer(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.start(id);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop a container' })
  async stop(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanManageContainer(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.stop(id);
  }

  @Post(':id/restart')
  @ApiOperation({ summary: 'Restart a container' })
  async restart(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanManageContainer(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.restart(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a container' })
  async remove(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanManageContainer(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.remove(id);
  }

  @Post('sync/:serverId')
  @ApiOperation({ summary: 'Sync containers from a Docker host' })
  async sync(
    @Param('serverId') serverId: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.containersService.assertCanManageServerById(
      serverId,
      user.id,
      user.role,
      workspaceId,
    );
    return this.containersService.syncFromDocker(serverId);
  }
}
