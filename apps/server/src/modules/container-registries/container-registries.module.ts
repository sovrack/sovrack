import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CryptoModule } from '../../core/crypto/crypto.module';
import { ContainerRegistriesController } from './container-registries.controller';
import { ContainerRegistriesService } from './container-registries.service';

@Module({
  imports: [PrismaModule, HttpModule, CryptoModule],
  controllers: [ContainerRegistriesController],
  providers: [ContainerRegistriesService],
  exports: [ContainerRegistriesService],
})
export class ContainerRegistriesModule {}
