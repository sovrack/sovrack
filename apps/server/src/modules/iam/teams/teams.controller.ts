import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { Role } from '@prisma/client';
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'List all teams' })
  @ApiResponse({ status: 200, description: 'Team list' })
  async findAll() {
    return this.teamsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team by ID' })
  @ApiResponse({ status: 200, description: 'Team found' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a team' })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  @ApiResponse({ status: 409, description: 'Name already in use' })
  async create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit a team' })
  @ApiResponse({ status: 200, description: 'Team updated' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a team' })
  @ApiResponse({ status: 200, description: 'Team deleted' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async remove(@Param('id') id: string) {
    return this.teamsService.remove(id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a team' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({
    status: 404,
    description: 'Team or user not found',
  })
  @ApiResponse({ status: 409, description: 'Already a member of this team' })
  async addMember(@Param('id') id: string, @Body() dto: AddTeamMemberDto) {
    return this.teamsService.addMember(id, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from a team' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 404, description: 'Team or member not found' })
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.teamsService.removeMember(id, userId);
  }
}
