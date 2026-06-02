import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CryptoModule } from '../../core/crypto/crypto.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [PlatformController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
