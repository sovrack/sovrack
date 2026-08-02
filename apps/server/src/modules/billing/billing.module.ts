import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingJobsService } from './billing-jobs.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { UsageGuardService } from './usage-guard.service';
import { AuditModule } from '../audit';
import { NotificationsModule } from '../notifications';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, BillingJobsService, UsageGuardService],
  exports: [BillingService, UsageGuardService],
})
export class BillingModule {}
