import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './shared/database/prisma.service';
import { JwtService } from './shared/jwt/jwt.service';
import { AnsibleRunnerService } from './adapters/provisioning/ansible-runner.service';
import { DockerApiService } from './adapters/container-runtime/docker-api.service';
import { DeploymentsGateway } from './modules/deployments/gateways/deployments.gateway';
import { DeploymentsProcessor } from './modules/deployments/processors/deployments.processor';

describe('AppModule', () => {
  let mod: TestingModule;

  afterAll(async () => {
    await mod?.close();
  });

  it('compiles without errors', async () => {
    mod = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn() })
      .overrideProvider(JwtService)
      .useValue({})
      .overrideProvider(AnsibleRunnerService)
      .useValue({})
      .overrideProvider(DockerApiService)
      .useValue({})
      .overrideProvider(DeploymentsGateway)
      .useValue({})
      .overrideProvider(DeploymentsProcessor)
      .useValue({ onModuleInit: jest.fn() })
      .overrideProvider('DEPLOYMENTS_QUEUE')
      .useValue({ add: jest.fn() })
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: () => true })
      .compile();

    expect(mod.get(AppModule)).toBeDefined();
  });
});
