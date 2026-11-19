import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsSmtpService } from '../notifications/notifications-smtp.service';

/**
 * Prix par plan en millimes (1 TND = 1000 millimes).
 * La V1 publique utilise le plan FREE sans date d'expiration. Les anciens
 * plans payants restent dans le modèle pour compatibilité, mais leur parcours
 * libre-service est désactivé par le contrat produit.
 */
export const PLAN_PRICES_MILLIMES: Record<Plan, number> = {
  [Plan.FREE]: 0,
  [Plan.STARTER]: 45000,
  [Plan.PRO]: 45000,
  [Plan.ENTERPRISE]: 150000,
};

export const PLAN_LIMITS_DEFAULTS: Record<
  Plan,
  {
    maxProjects: number;
    maxServers: number;
    maxTeamMembers: number;
    storageLimitMb: number;
    maxBackups: number;
  }
> = {
  [Plan.FREE]: {
    maxProjects: 1,
    maxServers: 1,
    maxTeamMembers: 3,
    storageLimitMb: 500,
    maxBackups: 1,
  },
  [Plan.STARTER]: {
    maxProjects: 10,
    maxServers: 5,
    maxTeamMembers: 10,
    storageLimitMb: 2048,
    maxBackups: 7,
  },
  [Plan.PRO]: {
    maxProjects: 999999,
    maxServers: 999999,
    maxTeamMembers: 10,
    storageLimitMb: 10240,
    maxBackups: 30,
  },
  [Plan.ENTERPRISE]: {
    maxProjects: 999999,
    maxServers: 999999,
    maxTeamMembers: 999999,
    storageLimitMb: 102400,
    maxBackups: 365,
  },
};

/**
 * Billing intégré à la plateforme, attaché à la Team (tenant).
 * Conforme au modèle universel vérifié chez Dokploy/Coolify/Railway :
 * une seule base, le paiement vit dans le produit.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly smtp?: NotificationsSmtpService,
  ) {}

  /** Retourne les limites du plan (base de données avec fallback défauts). */
  async getLimitsForPlan(plan: Plan) {
    const stored = await this.prisma.planLimit.findUnique({ where: { plan } });
    if (stored) {
      return {
        maxProjects: stored.maxProjects,
        maxServers: stored.maxServers,
        maxTeamMembers: stored.maxTeamMembers,
        storageLimitMb: stored.storageLimitMb,
        maxBackups: stored.maxBackups,
      };
    }
    return PLAN_LIMITS_DEFAULTS[plan];
  }

  /** Compatibility helper: resolves only an unambiguous active workspace. */
  async resolveTeamId(userId: string): Promise<string> {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { joinedAt: 'asc' },
      select: { teamId: true },
      take: 2,
    });
    if (memberships.length === 0) {
      throw new NotFoundException('Aucune équipe associée à ce compte');
    }
    if (memberships.length > 1) {
      throw new BadRequestException({
        code: 'WORKSPACE_CONTEXT_REQUIRED',
        message: 'Sélectionnez explicitement le workspace de facturation',
      });
    }
    return memberships[0].teamId;
  }

  /**
   * Annule l'abonnement d'une équipe : statut CANCELED + canceledAt.
   * Sans intégration de paiement réelle, l'annulation est immédiate en base.
   */
  async cancel(teamId: string, adminId?: string) {
    const subscription = await this.ensureSubscription(teamId);

    if (subscription.status === 'CANCELED') {
      return {
        success: true,
        message: 'Votre abonnement est déjà annulé.',
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: 'CANCELED',
          canceledAt: subscription.canceledAt,
        },
      };
    }

    const now = new Date();
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELED', canceledAt: now },
    });

    if (adminId) {
      await this.auditService.record(
        adminId,
        'BILLING_CANCEL',
        'Subscription',
        subscription.id,
        { plan: subscription.plan, canceledAt: now },
      );
    }

    this.logger.log(`Team ${teamId}: subscription canceled`);
    await this.sendCancelEmail(teamId);
    return {
      success: true,
      message: 'Votre abonnement a été annulé.',
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: 'CANCELED',
        canceledAt: now,
      },
    };
  }

  /** Récupère (ou crée) l'abonnement d'une équipe. */
  async ensureSubscription(teamId: string) {
    let subscription = await this.prisma.subscription.findUnique({
      where: { teamId },
    });
    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: {
          teamId,
          plan: Plan.FREE,
          status: 'ACTIVE',
          trialEndsAt: null,
        },
      });
      this.logger.log(`Free V1 access created for team ${teamId}`);
    }
    return subscription;
  }

  /** Vue billing complète pour le dashboard (plan, limites, factures). */
  async getMyBilling(teamId: string) {
    const subscription = await this.ensureSubscription(teamId);
    const [invoices, projectCount, serverCount, memberCount] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: { teamId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.project.count({ where: { teamId } }),
        this.prisma.server.count({ where: { teamId } }),
        this.prisma.teamMember.count({ where: { teamId } }),
      ]);

    const limits = await this.getLimitsForPlan(subscription.plan);

    return {
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        canceledAt: subscription.canceledAt,
      },
      prices: PLAN_PRICES_MILLIMES,
      limits,
      usage: {
        projects: projectCount,
        servers: serverCount,
        members: memberCount,
      },
      invoices,
    };
  }

  /**
   * Changement de plan : crée une facture PENDING (paiement en ligne via
   * Stripe viendra ensuite). Bloque la dégradation en-dessous de l'usage.
   */
  async subscribe(teamId: string, plan: Plan, adminId?: string) {
    if (!Object.values(Plan).includes(plan)) {
      throw new BadRequestException('Plan invalide');
    }

    const subscription = await this.ensureSubscription(teamId);
    const current = subscription.plan;

    if (current === plan) {
      return { success: true, message: 'Vous êtes déjà abonné à ce plan.' };
    }

    // Blocage : downgrade impossible si l'usage dépasse les limites du plan cible.
    if (this.isDowngrade(current, plan)) {
      const targetLimits = await this.getLimitsForPlan(plan);
      const [projectCount, serverCount, memberCount] = await Promise.all([
        this.prisma.project.count({ where: { teamId } }),
        this.prisma.server.count({ where: { teamId } }),
        this.prisma.teamMember.count({ where: { teamId } }),
      ]);
      const problems: string[] = [];
      if (projectCount > targetLimits.maxProjects)
        problems.push(
          `${projectCount} projets (max ${targetLimits.maxProjects})`,
        );
      if (serverCount > targetLimits.maxServers)
        problems.push(
          `${serverCount} serveurs (max ${targetLimits.maxServers})`,
        );
      if (memberCount > targetLimits.maxTeamMembers)
        problems.push(
          `${memberCount} membres (max ${targetLimits.maxTeamMembers})`,
        );
      if (problems.length > 0) {
        throw new ForbiddenException(
          `Impossible de passer au plan ${plan} : usage actuel ${problems.join(', ')}. Réduisez d'abord l'usage.`,
        );
      }
    }

    const amount = PLAN_PRICES_MILLIMES[plan];
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          plan,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
        },
      });
      if (amount > 0) {
        await tx.invoice.create({
          data: {
            teamId,
            amountMillimes: amount,
            currency: 'TND',
            status: 'PENDING',
            periodStart: now,
            periodEnd,
          },
        });
      }
    });

    if (adminId) {
      await this.auditService.record(
        adminId,
        'BILLING_CHANGE_PLAN',
        'Subscription',
        subscription.id,
        {
          from: current,
          to: plan,
          amountMillimes: amount,
        },
      );
    }

    this.logger.log(`Team ${teamId}: plan ${current} → ${plan}`);
    await this.sendPlanChangeEmail(teamId, plan, amount);
    return { success: true, message: `Plan ${plan} activé.`, plan };
  }

  /**
   * Crée une session de paiement hébergée (Stripe Checkout pour l'international
   * ou Konnect/Flouci pour le marché tunisien).
   */
  async createCheckoutSession(
    teamId: string,
    plan: Plan,
    currency: string = 'USD',
    gateway: 'stripe' | 'konnect' = 'stripe',
    userId?: string,
  ) {
    if (!Object.values(Plan).includes(plan)) {
      throw new BadRequestException('Plan invalide');
    }

    if (plan === Plan.FREE) {
      return this.subscribe(teamId, Plan.FREE, userId);
    }

    const curr = currency.toUpperCase() === 'TND' ? 'TND' : 'USD';
    const amount =
      curr === 'TND'
        ? plan === Plan.PRO
          ? 45000
          : 150000
        : plan === Plan.PRO
          ? 1500
          : 4900;

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const konnectApiKey = process.env.KONNECT_API_KEY;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const invoice = await this.prisma.invoice.create({
      data: {
        teamId,
        amountMillimes: curr === 'TND' ? amount : Math.round(amount * 31),
        currency: curr,
        status: 'PENDING',
        periodStart: now,
        periodEnd,
      },
    });

    let checkoutUrl = '';
    if (gateway === 'konnect' || curr === 'TND') {
      checkoutUrl = konnectApiKey
        ? `https://api.konnect.network/pay/${invoice.id}`
        : `/billing/success?session_id=mock_konnect_${invoice.id}&gateway=konnect`;
    } else {
      checkoutUrl = stripeKey
        ? `https://checkout.stripe.com/pay/${invoice.id}`
        : `/billing/success?session_id=mock_stripe_${invoice.id}&gateway=stripe`;
    }

    return {
      success: true,
      invoiceId: invoice.id,
      plan,
      currency: curr,
      amount,
      gateway: gateway === 'konnect' || curr === 'TND' ? 'konnect' : 'stripe',
      checkoutUrl,
    };
  }

  /** Marque un paiement reçu (appelé par le webhook Stripe). */
  async markPaid(invoiceId: string, stripeInvoiceId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new NotFoundException('Facture introuvable');
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          ...(stripeInvoiceId ? { stripeInvoiceId } : {}),
        },
      });
    });
    this.logger.log(`Invoice ${invoiceId} marked PAID`);
  }

  /** Marque une facture en retard (dunning). */
  async markOverdue(invoiceId: string) {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'OVERDUE' },
    });
    this.logger.log(`Invoice ${invoiceId} marked OVERDUE`);
  }

  /** Suspend un abonnement impayé (J+7) — arrêt des services de la Team. */
  async markSuspended(teamId: string) {
    const subscription = await this.ensureSubscription(teamId);
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' },
    });
    this.logger.warn(`Team ${teamId} subscription PAST_DUE — suspension`);
  }

  /** Réactive un abonnement après paiement. */
  async reactivate(teamId: string) {
    const subscription = await this.ensureSubscription(teamId);
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'ACTIVE' },
    });
    this.logger.log(`Team ${teamId} subscription reactivated`);
  }

  private isDowngrade(current: Plan, target: Plan): boolean {
    const order: Record<Plan, number> = {
      FREE: 0,
      STARTER: 1,
      PRO: 2,
      ENTERPRISE: 3,
    };
    return order[target] < order[current];
  }

  /** Email de confirmation de changement de plan (équipe + admin). */
  private async sendPlanChangeEmail(
    teamId: string,
    plan: Plan,
    amount: number,
  ): Promise<void> {
    if (!this.smtp) return;
    const [team, owner] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId } }),
      this.prisma.teamMember.findFirst({
        where: { teamId },
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);
    if (!team || !owner) return;

    const amountTnd = (amount / 1000).toFixed(3).replace(/\.000$/, '');
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
  <div style="background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:12px;padding:24px;color:#fff;text-align:center">
    <h2 style="margin:0">Sovrack — Plan ${plan}</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
    <p>Bonjour ${owner.user.fullName},</p>
    <p>L'équipe <strong>${team.name}</strong> est maintenant sur le plan
       <strong>${plan}</strong>${amount > 0 ? ` (${amountTnd} DT / mois)` : ' (accès gratuit)'}.</p>
    <p>Votre facture est disponible depuis le dashboard → Facturation.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px">Sovrack — déployez sans limites</p>
  </div>
</div>`;
    await this.smtp.sendBillingEmail(
      owner.user.email,
      `Votre plan ${plan} est actif`,
      html,
    );
  }

  /** Email de confirmation d'annulation d'abonnement. */
  private async sendCancelEmail(teamId: string): Promise<void> {
    if (!this.smtp) return;
    const [team, owner] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId } }),
      this.prisma.teamMember.findFirst({
        where: { teamId },
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);
    if (!team || !owner) return;

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
  <div style="background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:12px;padding:24px;color:#fff;text-align:center">
    <h2 style="margin:0">Sovrack — Abonnement annulé</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
    <p>Bonjour ${owner.user.fullName},</p>
    <p>L'abonnement de l'équipe <strong>${team.name}</strong> a bien été annulé.</p>
    <p>Vous conservez l'accès à vos services jusqu'à la fin de la période en cours.</p>
    <p>Si vous changez d'avis, vous pouvez vous réabonner à tout moment depuis le dashboard → Facturation.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px">Sovrack — déployez sans limites</p>
  </div>
</div>`;
    await this.smtp.sendBillingEmail(
      owner.user.email,
      'Votre abonnement a été annulé',
      html,
    );
  }
}
