import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { PlatformService } from './platform.service';
import { EnterpriseLicenseService } from './enterprise-license.service';

@Module({
  imports: [PrismaModule, CryptoModule],
  providers: [PlatformService, EnterpriseLicenseService],
  exports: [PlatformService, EnterpriseLicenseService],
})
export class PlatformModule {}
