import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { PrismaService } from '../../shared/database/prisma.service';
import { PreviewEnvironmentService } from './preview-environment.service';

class OpenPreviewDto {
  @IsString() @IsNotEmpty() mergeRequestId!: string;
  @IsString() @IsNotEmpty() branch!: string;
}

@ApiTags('Preview Environments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/previews')
export class PreviewEnvironmentsController {
  constructor(
    private readonly previews: PreviewEnvironmentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active preview environments' })
  async list(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.assertAccess(projectId, user);
    return this.previews.listForProject(projectId);
  }

  @Post()
  @ApiOperation({
    summary: 'Ouvrir un environnement de preview pour une merge request',
  })
  async open(
    @Param('projectId') projectId: string,
    @Body() dto: OpenPreviewDto,
    @GetUser() user: JwtPayload,
  ) {
    await this.assertAccess(projectId, user);
    return this.previews.openPreview(projectId, dto.mergeRequestId, dto.branch);
  }

  @Delete(':mergeRequestId')
  @ApiOperation({ summary: 'Close (destroy) a preview environment' })
  async close(
    @Param('projectId') projectId: string,
    @Param('mergeRequestId') mergeRequestId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.assertAccess(projectId, user);
    return this.previews.closePreview(projectId, mergeRequestId);
  }

  private async assertAccess(
    projectId: string,
    user: JwtPayload,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet non trouvé');
    if (user.role === Role.ADMIN) return;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    if (!member) throw new ForbiddenException('Accès non autorisé à ce projet');
  }
}
