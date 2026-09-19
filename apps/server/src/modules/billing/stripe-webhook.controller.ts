import type { RawBodyRequest } from '@nestjs/common';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../shared/decorators/public.decorator';
import { PrismaService } from '../../shared/database/prisma.service';
import { BillingService } from './billing.service';
import { RequiresProductCapability } from '../../shared/product-capabilities/requires-product-capability.decorator';
import { ProductCapabilities } from '../../shared/product-capabilities/product-capability';

/**
 * Webhook Stripe (paiement en ligne). Public par nature — la signature
 * HTTP-Signature (HMAC-SHA256) est vérifiée via STRIPE_WEBHOOK_SECRET.
 *
 * Si aucune clé n'est configurée, le mode facturation manuelle reste actif :
 * le endpoint répond 503 (non configuré) et les factures sont marquées PAID
 * par un admin.
 */
@ApiTags('billing')
@Controller('billing')
@RequiresProductCapability(ProductCapabilities.SELF_SERVICE_BILLING)
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @Public()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET', '');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Webhook Stripe non configuré (STRIPE_WEBHOOK_SECRET absent) — paiement manuel actif',
      );
    }
    if (!signature) {
      throw new BadRequestException('En-tête stripe-signature manquant');
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Body manquant');
    }

    // La signature Stripe est "t=timestamp,v1=hex" — on vérifie l'HMAC du
    // body brut avec la clé secrète, sans dépendance au SDK (constante de
    // temps pour éviter les attaques de timing).
    const [tsPart, sigPart] = signature.split(',');
    const timestamp = tsPart?.split('=')[1] ?? '';
    const expectedSig = sigPart?.split('=')[1] ?? '';
    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const computed = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    const expected = Buffer.from(expectedSig, 'hex');
    const received = Buffer.from(computed, 'hex');
    if (
      expected.length === 0 ||
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new BadRequestException('Signature Stripe invalide');
    }

    let event: {
      type: string;
      data: { object: Record<string, unknown> };
    };
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as {
        type?: unknown;
        data?: { object?: unknown };
      };
      if (
        typeof parsed?.type !== 'string' ||
        typeof parsed?.data?.object !== 'object' ||
        parsed.data.object === null
      ) {
        throw new BadRequestException('Payload Stripe invalide');
      }
      event = parsed as {
        type: string;
        data: { object: Record<string, unknown> };
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Payload JSON invalide');
    }

    await this.processEvent(event);
    return { received: true };
  }

  private async processEvent(event: {
    type: string;
    data: { object: Record<string, unknown> };
  }): Promise<void> {
    const object = event.data.object;

    switch (event.type) {
      case 'invoice.paid': {
        const stripeInvoiceId = object.id as string;
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        const teamId = metadata.teamId;

        // Priorité : facture locale déjà liée à l'ID Stripe.
        const byStripeId = stripeInvoiceId
          ? await this.prisma.invoice.findFirst({
              where: { stripeInvoiceId },
            })
          : null;
        if (byStripeId) {
          await this.billingService.markPaid(byStripeId.id, stripeInvoiceId);
          return;
        }

        // Sinon : la facture PENDING de la team correspondante (montant égal).
        if (teamId) {
          const pending = await this.prisma.invoice.findFirst({
            where: {
              teamId,
              status: 'PENDING',
            },
            orderBy: { createdAt: 'desc' },
          });
          if (pending) {
            await this.billingService.markPaid(pending.id, stripeInvoiceId);
            await this.billingService.reactivate(teamId);
            return;
          }
        }
        this.logger.warn(
          `[stripe-webhook] invoice.paid sans facture locale correspondante (${stripeInvoiceId})`,
        );
        break;
      }

      case 'invoice.payment_failed': {
        const stripeInvoiceId = object.id as string;
        const invoice = stripeInvoiceId
          ? await this.prisma.invoice.findFirst({
              where: { stripeInvoiceId },
            })
          : null;
        if (invoice) {
          await this.billingService.markOverdue(invoice.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscriptionId = object.id as string;
        const sub = subscriptionId
          ? await this.prisma.subscription.findFirst({
              where: { stripeSubscriptionId: subscriptionId },
            })
          : null;
        if (sub) {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'CANCELED', canceledAt: new Date() },
          });
          this.logger.log(
            `[stripe-webhook] subscription ${sub.teamId} CANCELED`,
          );
        }
        break;
      }

      default:
        // Événements non gérés (checkout.session.*, ping…) : ignorés.
        this.logger.debug(`[stripe-webhook] événement ignoré: ${event.type}`);
    }
  }
}
