import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ServerStatus, ServerOnboardingStep, Server } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { runsBackgroundWork } from '../../../../shared/utils/process-role.util';
import { ServersCoreService } from './servers-core.service';
import { ServerSetupService } from '../../onboarding/services/infra-setup.service';

/**
 * Provisioning automatique des serveurs managés.
 *
 * Un serveur managé est créé avec un hôte placeholder (sovrack-managed-*).
 * Quand la plateforme a réellement provisionné le VPS, l'hôte réel (IP ou
 * hostname) est renseigné via PATCH /managed-servers/:id. Ce service prend
 * alors le relais du pipeline existant — exactement comme un serveur
 * auto-hébergé après "install SSH key" :
 *
 *   NEW (hôte réel connu) → KEY_INSTALLED (clé posée par la plateforme)
 *   → vérification SSH (verifyServer) → préparation Ansible (startSetup)
 *
 * Toutes les étapes passent par les jobs serveurs existants (queue worker,
 * WebSocket, audit) — aucune duplication de logique.
 */
@Injectable()
export class ManagedServersProvisioningService {
  private readonly logger = new Logger(ManagedServersProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: ServersCoreService,
    private readonly setup: ServerSetupService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async provisionPendingManagedServers(): Promise<void> {
    if (!runsBackgroundWork()) return;

    const pending = await this.prisma.server.findMany({
      where: {
        isManaged: true,
        isActive: true,
        status: {
          in: [
            ServerStatus.NEW,
            ServerStatus.SSH_PENDING,
            ServerStatus.SSH_VALIDATED,
            ServerStatus.INFO_DETECTED,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    for (const server of pending) {
      try {
        await this.provisionOne(server);
      } catch (err) {
        this.logger.warn(
          `[managed-provision] ${server.id} (${server.name}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async provisionOne(server: Server): Promise<void> {
    // 1) Hôte réel renseigné ? Le placeholder "sovrack-managed-*" signifie
    //    que le VPS n'est pas encore provisionné côté infrastructure.
    if (!server.host || server.host.startsWith('sovrack-managed-')) {
      return;
    }

    // 2) Clé SSH de la plateforme : l'hôte managé est provisionné avec la clé
    //    publique du backend (cloud-init / clé root), donc on marque l'étape
    //    clé installée sans intervention utilisateur.
    if (
      server.onboardingStep === ServerOnboardingStep.PENDING &&
      !server.isVerified
    ) {
      await this.prisma.server.update({
        where: { id: server.id },
        data: { onboardingStep: ServerOnboardingStep.KEY_INSTALLED },
      });
      this.logger.log(
        `[managed-provision] ${server.id} — clé plateforme marquée installée`,
      );
      return;
    }

    // 3) Vérification SSH + détection automatique.
    if (!server.isVerified) {
      const verified = await this.core.verifyServer(server.id);
      if (!verified.isVerified) {
        this.logger.log(
          `[managed-provision] ${server.id} — vérification SSH en cours`,
        );
      }
      return;
    }

    // 4) Préparation Ansible (Docker + outils + runner), une seule fois.
    const activeSetups = await this.prisma.serverRun.count({
      where: {
        serverId: server.id,
        kind: 'PREPARATION',
        status: {
          in: ['QUEUED', 'RESOLVING_OPTIONS', 'WAITING_FOR_LOCK', 'RUNNING'],
        },
      },
    });
    if (activeSetups === 0) {
      await this.setup.startSetup(server.id, undefined, undefined);
      this.logger.log(
        `[managed-provision] ${server.id} — préparation Ansible lancée`,
      );
    }
  }
}
