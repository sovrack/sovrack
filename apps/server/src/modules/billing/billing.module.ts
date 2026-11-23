import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { UsageGuardService } from './usage-guard.service';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BillingJobsService } from './billing-jobs.service';
import { AuditModule } from '../audit';
import { NotificationsModule } from '../notifications';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, UsageGuardService, BillingJobsService],
  exports: [BillingService, UsageGuardService],
})
export class BillingModule {}
