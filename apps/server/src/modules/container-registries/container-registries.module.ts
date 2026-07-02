import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { ContainerRegistriesController } from './container-registries.controller';
import { ContainerRegistriesService } from './container-registries.service';
import { RegistryConnectionTestService } from './registry-connection-test.service';

@Module({
  imports: [PrismaModule, HttpModule, CryptoModule],
  controllers: [ContainerRegistriesController],
  providers: [ContainerRegistriesService, RegistryConnectionTestService],
  exports: [ContainerRegistriesService],
})
export class ContainerRegistriesModule {}
