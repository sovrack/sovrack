import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { CryptoModule } from '../../../shared/crypto/crypto.module';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { Dns01ChallengeService } from './dns-01-challenge.service';

@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [DomainsController],
  providers: [DomainsService, Dns01ChallengeService],
  exports: [DomainsService, Dns01ChallengeService],
})
export class DomainsModule {}
