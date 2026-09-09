import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { ConvertPersonalWorkspaceDto } from './dto/convert-personal-workspace.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateWorkspaceMemberRoleDto } from './dto/update-workspace-member-role.dto';
import { UpdateWorkspaceMemberStatusDto } from './dto/update-workspace-member-status.dto';
import { TeamsService } from './teams.service';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('workspaces')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'List all teams' })
  @ApiResponse({ status: 200, description: 'Team list' })
  async findAll(@GetUser() user: JwtPayload) {
    return this.teamsService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team by ID' })
  @ApiResponse({ status: 200, description: 'Team found' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.teamsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a team' })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  @ApiResponse({ status: 409, description: 'Name already in use' })
  async create(@Body() dto: CreateTeamDto, @GetUser() user: JwtPayload) {
    return this.teamsService.create(dto, user.id);
  }

  @Post(':id/convert-to-organization')
  @ApiOperation({ summary: 'Convert a personal workspace to an organization' })
  async convertToOrganization(
    @Param('id') id: string,
    @Body() dto: ConvertPersonalWorkspaceDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.teamsService.convertPersonalToOrganization(id, dto.name, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit a team' })
  @ApiResponse({ status: 200, description: 'Team updated' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.teamsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a team' })
  @ApiResponse({ status: 200, description: 'Team deleted' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.teamsService.remove(id, user);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a team' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({
    status: 404,
    description: 'Team or user not found',
  })
  @ApiResponse({ status: 409, description: 'Already a member of this team' })
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.teamsService.addMember(id, dto, user);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from a team' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 404, description: 'Team or member not found' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @GetUser() user: JwtPayload,
  ) {
    return this.teamsService.removeMember(id, userId, user);
  }

  @Patch(':id/members/:userId/role')
  @ApiOperation({ summary: 'Update a workspace member role' })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateWorkspaceMemberRoleDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.teamsService.updateMemberRole(id, userId, dto.role, user);
  }

  @Patch(':id/members/:userId/status')
  @ApiOperation({ summary: 'Suspend or reactivate a workspace member' })
  async updateMemberStatus(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateWorkspaceMemberStatusDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.teamsService.updateMemberStatus(id, userId, dto.status, user);
  }
}
