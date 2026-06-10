import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class ConfigsPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }

  async assertCanAccess(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);
    if (userRole === Role.ADMIN) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!m) throw new ForbiddenException('Accès non autorisé à ce projet');
  }

  async assertCanManage(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);
    if (userRole === Role.ADMIN) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    if (m?.role === ProjectRole.OWNER) return;
    throw new ForbiddenException('Action réservée au OWNER du projet ou ADMIN');
  }

  async assertEnvironmentBelongsToProject(
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    const env = await this.prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      select: { id: true },
    });
    if (!env) throw new NotFoundException('Environnement introuvable pour ce projet');
  }
}
