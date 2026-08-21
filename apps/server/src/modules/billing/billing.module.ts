import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { UsageGuardService } from './usage-guard.service';
import { AuditModule } from '../audit';
import { NotificationsModule } from '../notifications';

@Module({
  imports: [AuditModule, NotificationsModule],
  // Billing is intentionally not exposed in Phase 2. Quota evaluation remains
  // available on the FREE plan, but no customer mutation, Stripe webhook or
  // billing scheduler is registered until the product capability is enabled.
  controllers: [],
  providers: [BillingService, UsageGuardService],
  exports: [BillingService, UsageGuardService],
})
export class BillingModule {}
