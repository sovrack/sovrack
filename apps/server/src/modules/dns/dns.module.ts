import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { DnsController } from './dns.controller';
import { DnsService } from './dns.service';

@Module({
  imports: [PrismaModule],
  controllers: [DnsController],
  providers: [DnsService],
  exports: [DnsService],
})
export class DnsModule {}
