import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UsageGuardService } from './usage-guard.service';
import { AuditModule } from '../audit';

@Module({
  imports: [AuditModule],
  controllers: [BillingController],
  providers: [BillingService, UsageGuardService],
  exports: [BillingService, UsageGuardService],
})
export class BillingModule {}
