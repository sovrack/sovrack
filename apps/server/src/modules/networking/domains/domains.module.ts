import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { CryptoModule } from '../../../shared/crypto/crypto.module';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  // exports: [DomainsService],
})
export class DomainsModule {}
