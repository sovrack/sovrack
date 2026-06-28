import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../../shared/http/pagination.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ImportGitlabGroupDto } from './dto/import-gitlab-group.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';
import { ProjectImportService } from './services/project-import.service';
import { ProjectMembersService } from './services/project-members.service';

/**
 * Contrôleur de gestion des projets.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly membersService: ProjectMembersService,
    private readonly importService: ProjectImportService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({
    status: 403,
    description: 'Administrators only',
  })
  async create(@GetUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return await this.projectsService.create(user.id, user.role, dto);
  }

  @Post('import/gitlab-group')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary:
      'Import GitLab Group repositories as a multi-service application or separate projects',
  })
  @ApiResponse({ status: 201, description: 'GitLab Group import complete' })
  async importGitlabGroup(
    @GetUser() user: JwtPayload,
    @Body() dto: ImportGitlabGroupDto,
  ) {
    return await this.importService.importGitlabGroup(user.id, user.role, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects according to the user role' })
  @ApiResponse({ status: 200, description: 'Liste des projets' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  async findAll(
    @GetUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
  ) {
    return await this.projectsService.findAll(user.id, user.role, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get the details of a project' })
  @ApiResponse({ status: 200, description: 'Project details fetched' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({
    status: 403,
    description: 'Unauthorized access to the project',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.projectsService.findOne(id, user.id, user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit a project' })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized action' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async update(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: UpdateProjectDto,
  ) {
    return await this.projectsService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Delete a project' })
  @ApiResponse({ status: 200, description: 'Project deleted' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized action' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.projectsService.remove(id, user.id, user.role);
    return { message: 'Projet supprimé avec succès' };
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to the project' })
  @ApiResponse({ status: 201, description: 'Member added to the project' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized action' })
  @ApiResponse({ status: 404, description: 'Project or user not found' })
  @ApiResponse({ status: 409, description: 'User already a member' })
  async addMember(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: AddMemberDto,
  ) {
    return await this.membersService.addMember(id, user.id, user.role, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List project members' })
  @ApiResponse({ status: 200, description: 'Liste des membres du projet' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({
    status: 403,
    description: 'Unauthorized access to the project',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getMembers(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.membersService.getMembers(id, user.id, user.role);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from the project' })
  @ApiResponse({ status: 200, description: 'Member removed from the project' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Unauthorized action' })
  @ApiResponse({ status: 404, description: 'Project or member not found' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.membersService.removeMember(
      id,
      user.id,
      user.role,
      targetUserId,
    );
  }
}
