import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceStatus, BillingStatus, Invoice } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { runsBackgroundWork } from '../../shared/utils/process-role.util';
import { NotificationsSmtpService } from '../notifications/notifications-smtp.service';
import { BillingService } from './billing.service';

/**
 * Tâches planifiées du billing :
 *  - toutes les 6h, escalade les factures impayées (PENDING → OVERDUE),
 *  - à J+7 d'une facture overdue, suspend l'abonnement (ACTIVE/TRIALING → PAST_DUE)
 *    et prévient l'équipe par email.
 *
 * Exécuté uniquement par le process worker (runsBackgroundWork), jamais par
 * l'API seule — évite les doubles escalades en déploiement multi-process.
 */
@Injectable()
export class BillingJobsService {
  private readonly logger = new Logger(BillingJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly smtp: NotificationsSmtpService,
  ) {}

  /** Escalade + suspension des abonnements impayés. */
  @Cron(CronExpression.EVERY_6_HOURS)
  async escalateOverdueInvoices(): Promise<void> {
    if (!runsBackgroundWork()) return;
    const now = new Date();
    const overdueSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1) PENDING de plus de 7 jours → OVERDUE (dunning).
    const pending = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.PENDING, createdAt: { lt: overdueSince } },
      include: { team: { include: { members: { include: { user: true } } } } },
    });
    for (const invoice of pending) {
      await this.billingService.markOverdue(invoice.id);
      await this.notifyTeam(
        invoice,
        'Facture en retard',
        `La facture de ${invoice.amountMillimes / 1000} DT pour l'équipe ${invoice.team.name} est en retard. Paiement requis sous 7 jours.`,
      );
    }

    // 2) Abonnements ACTIVE/TRIALING avec facture OVERDUE depuis ≥ 7 jours → PAST_DUE.
    const overdue = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.OVERDUE,
        team: {
          subscription: {
            status: { in: [BillingStatus.ACTIVE, BillingStatus.TRIALING] },
          },
        },
      },
      include: { team: { include: { members: { include: { user: true } } } } },
    });
    for (const invoice of overdue) {
      // Pas de timestamp d'escalade dédié : on s'appuie sur la date de
      // création. Escalade PENDING→OVERDUE à J+7 (passe 1), donc une facture
      // OVERDUE de 14 jours et plus est impayée depuis ≥ 7 jours → suspension.
      const overdueDays =
        (now.getTime() - invoice.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      if (overdueDays < 14) continue;

      await this.billingService.markSuspended(invoice.teamId);
      await this.notifyTeam(
        invoice,
        'Votre abonnement a été suspendu',
        `Votre abonnement a été suspendu car la facture de ${invoice.amountMillimes / 1000} DT est impayée. Réactivez-le en réglant la facture depuis le dashboard → Facturation.`,
      );
    }

    if (pending.length > 0 || overdue.length > 0) {
      this.logger.warn(
        `[billing-cron] ${pending.length} facture(s) escaladée(s) OVERDUE, ${overdue.length} abonnement(s) suspendu(s)`,
      );
    }
  }

  private async notifyTeam(
    invoice: Invoice & {
      team: {
        name: string;
        members: Array<{ user: { email: string; fullName: string } }>;
      };
    },
    subject: string,
    body: string,
  ): Promise<void> {
    if (!this.smtp) return;
    const owner = invoice.team.members[0]?.user;
    if (!owner) return;
    await this.smtp.sendBillingEmail(
      owner.email,
      subject,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
  <div style="background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:12px;padding:24px;color:#fff;text-align:center">
    <h2 style="margin:0">Sovrack — Facturation</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
    <p>Bonjour ${owner.fullName},</p>
    <p>${body}</p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px">Sovrack — déployez sans limites</p>
  </div>
</div>`,
    );
  }
}
