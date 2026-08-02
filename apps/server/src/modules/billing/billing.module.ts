import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UsageGuardService } from './usage-guard.service';
import { AuditModule } from '../audit';
import { NotificationsModule } from '../notifications';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, UsageGuardService],
  exports: [BillingService, UsageGuardService],
})
export class BillingModule {}
