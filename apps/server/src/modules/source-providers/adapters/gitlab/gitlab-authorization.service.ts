import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';

@Injectable()
export class GitlabAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanAccessProject(
    projectId: string,
    userId: string,
    _userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Accès non autorisé à ce projet');
    }
  }

  async assertCanManageProject(
    projectId: string,
    userId: string,
    _userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    const ownerMembership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!ownerMembership || ownerMembership.role !== ProjectRole.OWNER) {
      throw new ForbiddenException('Action réservée au OWNER du projet');
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }
}
