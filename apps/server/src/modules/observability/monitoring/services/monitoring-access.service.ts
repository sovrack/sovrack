import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../../iam/authorization/workspace-policy.types';

/**
 * LOT1a (plan produit) : autorisation PROJET pour les routes monitoring
 * scopées à un déploiement/service-env/projet. Ces routes sont ouvertes aux
 * DEVELOPER (l'onglet Monitoring d'un service est visible par tous les
 * membres du projet) — mais un membre ne voit QUE ses projets. ADMIN passe
 * toujours. Même modèle que MonitoringRuntimeLogsService.assertCanAccess
 * (onglet Logs), centralisé ici pour les trois formes d'identifiant.
 */
@Injectable()
export class MonitoringAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async assertProject(
    projectId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.READ,
      expectedWorkspaceId,
    );
  }

  async assertServiceEnv(
    serviceEnvId: string,
    userId: string,
    userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    const env = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: { service: { select: { projectId: true } } },
    });
    if (!env) throw new NotFoundException('Service-environnement introuvable');
    await this.assertProject(
      env.service.projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );
  }

  async assertDeployment(
    deploymentId: string,
    userId: string,
    userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { projectId: true },
    });
    if (!deployment) throw new NotFoundException('Déploiement introuvable');
    await this.assertProject(
      deployment.projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );
  }
}
