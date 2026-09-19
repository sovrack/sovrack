import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { BillingService } from './billing.service';
import { Plan } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export type UsageAction = 'CREATE_PROJECT' | 'ADD_SERVER' | 'ADD_TEAM_MEMBER';

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
  async guardForTeam(
    teamId: string,
    action: UsageAction,
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const subscription = await database.subscription.findUnique({
      where: { teamId },
      select: { plan: true },
    });
    const plan = subscription?.plan ?? Plan.FREE;
    const limits = await this.billing.getLimitsForPlan(plan);

    const [projectCount, serverCount, memberCount] = await Promise.all([
      database.project.count({ where: { teamId } }),
      database.server.count({ where: { teamId } }),
      database.teamMember.count({ where: { teamId } }),
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
      default:
        return;
    }

    if (exceeded) {
      this.logger.warn(
        `UsageGuard deny: team=${teamId} action=${action} plan=${plan}`,
      );
      throw new ForbiddenException(
        `${message} Contactez contact@sovrack.tech si vous avez besoin d’une capacité supplémentaire.`,
      );
    }
  }
}
