import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ManagedServerProvider, ServerStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BillingService } from '../../../billing/billing.service';
import { UsageGuardService } from '../../../billing/usage-guard.service';
import { ServersCryptoService } from '../../../../adapters/ssh/servers-crypto.service';
import { ServersAuditService } from './servers-audit.service';

export interface CreateManagedServerDto {
  name: string;
  provider: ManagedServerProvider;
  serverSize?: string;
  region?: string;
}

export interface ManagedServerResult {
  id: string;
  name: string;
  provider: ManagedServerProvider;
  serverSize: string | null;
  monthlyCostMillimes: number;
  status: string;
  message: string;
}

/**
 * Serveurs managés Sovrack — hôtes provisionnés par la plateforme pour le
 * compte de la team (isManaged = true). Le coût mensuel est facturé dans le
 * plan (tarif aligné : l'infra gérée est incluse au prix du plan).
 */
@Injectable()
export class ManagedServersService {
  private readonly logger = new Logger(ManagedServersService.name);

  // Coût infra managée par taille (millimes/mois) — consommé à la facturation.
  private static readonly SIZE_COSTS: Record<string, number> = {
    s1: 39000, // 1 vCPU / 2 Go — 39 DT
    m1: 79000, // 2 vCPU / 4 Go — 79 DT
    l1: 149000, // 4 vCPU / 8 Go — 149 DT
    xl1: 299000, // 8 vCPU / 16 Go — 299 DT
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly usageGuard: UsageGuardService,
    private readonly crypto: ServersCryptoService,
    private readonly audit: ServersAuditService,
  ) {}

  /**
   * Résout la team de l'utilisateur (pour les routes scopées team).
   */
  async getTeamId(userId: string): Promise<string> {
    return this.billing.resolveTeamId(userId);
  }

  /**
   * Crée un serveur managé : vérifie la limite du plan, génère une clé SSH,
   * enregistre l'hôte avec isManaged=true et démarre le provisionnement.
   */
  async create(
    dto: CreateManagedServerDto,
    actorUserId: string,
  ): Promise<ManagedServerResult> {
    await this.usageGuard.guard(actorUserId, 'ADD_SERVER');
    const teamId = await this.billing.resolveTeamId(actorUserId);

    const size = dto.serverSize ?? 'm1';
    const cost =
      ManagedServersService.SIZE_COSTS[size] ??
      ManagedServersService.SIZE_COSTS['m1'];
    if (cost <= 0) {
      throw new BadRequestException(
        `Taille de serveur inconnue : ${size}. Tailles disponibles : ${Object.keys(
          ManagedServersService.SIZE_COSTS,
        ).join(', ')}`,
      );
    }

    const sshMaterial = this.crypto.resolveSshMaterial();
    const now = new Date();

    // Nom d'hôte déterministe pour un serveur managé (sovrack-managed-*).
    const managedHost = `${dto.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 40)}-${now.getTime().toString(36)}`;

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        host: managedHost,
        port: 22,
        username: 'ubuntu',
        sshKey: this.crypto.encrypt(sshMaterial.privateKey),
        sshPublicKey: sshMaterial.publicKey,
        connectionMode: 'SSH',
        status: ServerStatus.NEW,
        isActive: true,
        teamId,
        isManaged: true,
        provider: dto.provider,
        serverSize: size,
        monthlyCostMillimes: cost,
      },
    });

    this.logger.log(
      `Managed server "${server.name}" (${server.id}) created for team ${teamId} — size ${size}`,
    );

    await this.audit.record(server.id, 'SERVER_CREATE', actorUserId, {
      managed: true,
      provider: dto.provider,
      size,
      cost,
    });

    return {
      id: server.id,
      name: server.name,
      provider: dto.provider,
      serverSize: size,
      monthlyCostMillimes: cost,
      status: ServerStatus.NEW,
      message:
        'Serveur managé créé. Le provisionnement démarre automatiquement (Docker + agents).',
    };
  }

  /**
   * Liste les serveurs managés d'une team.
   */
  async listManaged(teamId: string) {
    return this.prisma.server.findMany({
      where: { teamId, isManaged: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        host: true,
        provider: true,
        serverSize: true,
        monthlyCostMillimes: true,
        status: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }

  /**
   * Estime le coût mensuel d'un pool managé pour la facturation.
   */
  estimateMonthly(teamId: string) {
    return this.prisma.server.aggregate({
      where: { teamId, isManaged: true },
      _sum: { monthlyCostMillimes: true },
    });
  }

  /**
   * Récupère la clé publique d'un serveur managé (à installer sur l'hôte).
   */
  async getPublicKey(serverId: string, teamId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, teamId, isManaged: true },
    });
    if (!server) {
      throw new NotFoundException('Serveur managé introuvable');
    }
    return { publicKey: server.sshPublicKey };
  }
}
