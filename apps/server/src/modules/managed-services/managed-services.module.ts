import { Module } from '@nestjs/common';
import { ManagedServicesController } from './managed-services.controller';
import { ManagedServicesService } from './managed-services.service';

@Module({
  controllers: [ManagedServicesController],
  providers: [ManagedServicesService],
  exports: [ManagedServicesService],
})
export class ManagedServicesModule {}
