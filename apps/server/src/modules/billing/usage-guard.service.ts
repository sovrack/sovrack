import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { BillingService } from './billing.service';

export type UsageAction =
  | 'CREATE_PROJECT'
  | 'ADD_SERVER'
  | 'ADD_TEAM_MEMBER'
  | 'INCREASE_STORAGE';

/**
 * UsageGuard — enforcement central des limites de plan.
 * Appelé par les controllers AVANT chaque action créatrice.
 * Conforme au modèle Railway/Coolify (limites par plan vérifiées à l'action,
 * comptées sur les ressources liées à la team).
 */
@Injectable()
export class UsageGuardService {
  private readonly logger = new Logger(UsageGuardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Vérifie que l'action est autorisée pour la team de l'utilisateur.
   * @throws ForbiddenException si la limite du plan est atteinte
   */
  async guard(userId: string, action: UsageAction): Promise<void> {
    const teamId = await this.billing.resolveTeamId(userId);
    await this.guardForTeam(teamId, action);
  }

  /** Variante scopée à une team précise (utilisée par les services internes). */
  async guardForTeam(teamId: string, action: UsageAction): Promise<void> {
    const subscription = await this.billing.ensureSubscription(teamId);
    const limits = await this.billing.getLimitsForPlan(subscription.plan);
    const plan = subscription.plan;

    const [projectCount, serverCount, memberCount, volumeCount] =
      await Promise.all([
        this.prisma.project.count({ where: { teamId } }),
        this.prisma.server.count({ where: { teamId } }),
        this.prisma.teamMember.count({ where: { teamId } }),
        this.prisma.volume.count({
          where: {
            server: { teamId },
          },
        }),
      ]);

    let exceeded = false;
    let message = '';

    switch (action) {
      case 'CREATE_PROJECT':
        if (projectCount >= limits.maxProjects) {
          exceeded = true;
          message = `Limite du plan ${plan} atteinte : ${projectCount}/${limits.maxProjects} projets.`;
        }
        break;
      case 'ADD_SERVER':
        if (serverCount >= limits.maxServers) {
          exceeded = true;
          message = `Limite du plan ${plan} atteinte : ${serverCount}/${limits.maxServers} serveurs.`;
        }
        break;
      case 'ADD_TEAM_MEMBER':
        if (memberCount >= limits.maxTeamMembers) {
          exceeded = true;
          message = `Limite du plan ${plan} atteinte : ${memberCount}/${limits.maxTeamMembers} membres.`;
        }
        break;
      case 'INCREASE_STORAGE':
        if (volumeCount >= limits.storageLimitMb) {
          exceeded = true;
          message = `Stockage du plan ${plan} atteint (${limits.storageLimitMb} Mo).`;
        }
        break;
      default:
        return;
    }

    if (exceeded) {
      this.logger.warn(
        `UsageGuard deny: team=${teamId} action=${action} plan=${plan}`,
      );
      throw new ForbiddenException(
        `${message} Passez au plan supérieur pour continuer.`,
      );
    }
  }
}
