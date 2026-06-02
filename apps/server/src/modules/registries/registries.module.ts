import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CryptoModule } from '../../core/crypto/crypto.module';
import { RegistriesController } from './registries.controller';
import { RegistriesService } from './registries.service';

@Module({
  imports: [PrismaModule, HttpModule, CryptoModule],
  controllers: [RegistriesController],
  providers: [RegistriesService],
  exports: [RegistriesService],
})
export class RegistriesModule {}
