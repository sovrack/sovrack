import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { JwtService } from '../src/core/jwt/jwt.service';
import { AnsibleRunnerService } from '../src/core/provisioning/ansible-runner.service';
import { DeploymentsGateway } from '../src/modules/deployments/gateways/deployments.gateway';
import { DeploymentsProcessor } from '../src/modules/deployments/processors/deployments.processor';
import {
  DockerApiMockHandle,
  GitlabMockHandle,
  mockDockerApiService,
  mockGitlabService,
  mockHealthcheckService,
} from './utils/mocks';

export interface E2EContext {
  app: INestApplication;
  prisma: PrismaService;
  docker: DockerApiMockHandle;
  gitlab: GitlabMockHandle;
  /** Build a Cookie header that authenticates as the given user. */
  authCookie: (userId: string, role?: Role, email?: string) => string;
  /** Truncate all data between tests. */
  resetDb: () => Promise<void>;
  close: () => Promise<void>;
}

const TRUNCATE_ROOTS = [
  'User',
  'Project',
  'Server',
  'Team',
  'GitProviderConfig',
  'DnsProvider',
  'RegistryConfig',
  'PlatformConfig',
  'WebhookEndpoint',
];

/**
 * Boot a real NestJS app for e2e with the OUTBOUND side-effects mocked:
 *  - DockerApiService  → fake daemon (the REAL DockerDeployExecutorService runs)
 *  - AnsibleRunnerService → no-op (never spawn ansible-playbook)
 *  - DeploymentsHealthcheckService → instant success (no real HTTP)
 *  - DeploymentsGateway → no-op (no socket server)
 *  - BullMQ queue token + DeploymentsProcessor → stubbed (no Redis needed)
 *
 * The create→deploy path calls the executor DIRECTLY (fire-and-forget), so the
 * queue is intentionally bypassed; tests poll the Deployment row for the result.
 */
export async function bootstrapE2E(): Promise<E2EContext> {
  const dockerMock = mockDockerApiService();
  const gitlabMock = mockGitlabService();
  const healthMock = mockHealthcheckService();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(dockerMock.provide)
    .useValue(dockerMock.useValue)
    .overrideProvider(healthMock.provide)
    .useValue(healthMock.useValue)
    .overrideProvider(gitlabMock.provide)
    .useValue(gitlabMock.useValue)
    .overrideProvider(AnsibleRunnerService)
    .useValue({ run: jest.fn().mockResolvedValue(undefined), runPlaybook: jest.fn().mockResolvedValue('') })
    .overrideProvider(DeploymentsGateway)
    .useValue({
      emitStarted: jest.fn(),
      emitStatus: jest.fn(),
      emitFinished: jest.fn(),
      emitLog: jest.fn(),
    })
    // Decouple e2e from Redis: stub the queue token and the worker bootstrap.
    .overrideProvider('DEPLOYMENTS_QUEUE')
    .useValue({ add: jest.fn().mockResolvedValue({ id: 'stub-job' }) })
    .overrideProvider(DeploymentsProcessor)
    .useValue({ onModuleInit: jest.fn() })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);

  const authCookie = (
    userId: string,
    role: Role = Role.ADMIN,
    email = 'e2e@platform.test',
  ): string => {
    const token = jwt.generateAccessToken({ id: userId, email, role });
    return `devops_platform_token=${token}`;
  };

  const resetDb = async (): Promise<void> => {
    const list = TRUNCATE_ROOTS.map((t) => `"${t}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  };

  return {
    app,
    prisma,
    docker: dockerMock.useValue,
    gitlab: gitlabMock.useValue,
    authCookie,
    resetDb,
    close: async () => {
      await app.close();
    },
  };
}

/** Poll a deployment until it reaches a terminal status or the timeout fires. */
export async function waitForDeploymentStatus(
  prisma: PrismaService,
  deploymentId: string,
  terminal: string[] = ['SUCCESS', 'FAILED', 'CANCELED'],
  timeoutMs = 15000,
): Promise<{ status: string; imageSha: string | null; conditions: unknown }> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const dep = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { status: true, imageSha: true, conditions: true },
    });
    if (dep && terminal.includes(dep.status)) {
      return dep;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timeout waiting for deployment ${deploymentId} (last status: ${dep?.status ?? 'unknown'})`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
