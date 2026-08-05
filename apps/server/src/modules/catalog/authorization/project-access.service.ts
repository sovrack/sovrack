import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';

/**
 * Single source of truth for project-scoped authorization across the catalog
 * (projects / environments / services / service-environments). Previously each
 * service carried its own verbatim copy of these checks — a drift risk for
 * security code. L'OWNER d'une organisation n'accède qu'aux projets dont il
 * est membre ; seul le SUPER_ADMIN (plateforme) contourne l'appartenance.
 * La gestion d'un projet requiert le rôle OWNER dans le projet.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }

  /** Any project member (or platform SUPER_ADMIN) may read the project. */
  async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);
    if (userRole === Role.SUPER_ADMIN) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('Accès non autorisé à ce projet');
    }
  }

  /** Only the project OWNER (or platform SUPER_ADMIN) may mutate the project. */
  async assertCanManageProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);
    if (userRole === Role.SUPER_ADMIN) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    if (membership?.role !== ProjectRole.OWNER) {
      throw new ForbiddenException(
        'Action réservée au OWNER du projet ou SUPER_ADMIN',
      );
    }
  }
}
