import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { PlatformService } from './platform.service';

@Module({
  imports: [PrismaModule, CryptoModule],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
