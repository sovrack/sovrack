import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Service Prisma centralisé pour les accès base de données.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // SÉCURITÉ : secretsEnv est exclu de TOUTES les requêtes par défaut
    // (jamais retourne par l'API). Seuls les chemins internes qui le
    // selectionnent EXPLICITEMENT (ex: docker-deploy-executor pour injecter
    // les secrets au deploiement) y accedent.
    super({
      omit: {
        service: { secretsEnv: true },
        environment: { secretsEnv: true },
        serviceEnvironment: { secretsEnv: true },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
