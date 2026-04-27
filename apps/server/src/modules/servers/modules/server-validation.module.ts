import { Module } from '@nestjs/common';
import { ServerValidationController } from '../controllers/server-validation.controller';
import { ServersSharedModule } from '../servers-shared.module';

@Module({
  imports: [ServersSharedModule],
  controllers: [ServerValidationController],
})
export class ServerValidationModule {}
