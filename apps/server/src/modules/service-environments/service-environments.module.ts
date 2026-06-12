import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { ServiceEnvironmentsController } from './service-environments.controller';
import { ServiceEnvironmentsService } from './service-environments.service';

@Module({
  imports: [PrismaModule],
  controllers: [ServiceEnvironmentsController],
  providers: [ServiceEnvironmentsService],
  exports: [ServiceEnvironmentsService],
})
export class ServiceEnvironmentsModule {}
