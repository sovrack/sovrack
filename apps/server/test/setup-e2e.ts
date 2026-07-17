// DeploymentPreflightService's repo+branch check (checkRepoCloneable) shells
// out to the real `git` binary via child_process.execFile for local build
// sources. Partial-mock only execFile (jest.requireActual for everything
// else) so Prisma Client's own platform-detection code — which needs the
// real child_process module at import time — keeps working.
const execFileMock = jest.fn(
  (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (e: Error | null, r: { stdout: string; stderr: string }) => void,
  ) => cb(null, { stdout: 'e2eaaaa\trefs/heads/main', stderr: '' }),
);
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: execFileMock,
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Role } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { JwtService } from '../src/shared/jwt/jwt.service';
import { AnsibleRunnerService } from '../src/adapters/provisioning/ansible-runner.service';
import { DeploymentsGateway } from '../src/modules/deployments/gateways/deployments.gateway';
import { DeploymentsProcessor } from '../src/modules/deployments/processors/deployments.processor';
import { DockerDeployExecutorService } from '../src/modules/deployments/core/docker-deploy-executor.service';
import {
  DockerApiMockHandle,
  GitlabMockHandle,
  LocalBuildMockHandle,
  mockDockerApiService,
  mockGitlabService,
  mockHealthcheckService,
  mockLocalBuildService,
} from './utils/mocks';

export interface E2EContext {
  app: INestApplication;
  prisma: PrismaService;
  docker: DockerApiMockHandle;
  gitlab: GitlabMockHandle;
  localBuild: LocalBuildMockHandle;
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
  const localBuildMock = mockLocalBuildService();
  // Patched after app.init() to drive the real executor (simulated worker).
  const deploymentsQueueStub: {
    add: (
      name: string,
      data: { deploymentId: string; overrideImage?: string },
    ) => Promise<{ id: string }>;
  } = { add: () => Promise.resolve({ id: 'stub-job' }) };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(dockerMock.provide)
    .useValue(dockerMock.useValue)
    .overrideProvider(healthMock.provide)
    .useValue(healthMock.useValue)
    .overrideProvider(gitlabMock.provide)
    .useValue(gitlabMock.useValue)
    .overrideProvider(localBuildMock.provide)
    .useValue(localBuildMock.useValue)
    .overrideProvider(AnsibleRunnerService)
    .useValue({
      run: jest.fn().mockResolvedValue(undefined),
      runPlaybook: jest.fn().mockResolvedValue(''),
    })
    .overrideProvider(DeploymentsGateway)
    .useValue({
      emitStarted: jest.fn(),
      emitStatus: jest.fn(),
      emitFinished: jest.fn(),
      emitLog: jest.fn(),
    })
    // e2e tests business logic, not rate limiting — disable the global throttler
    // so rapid-fire test requests (matrix deploys) aren't 429'd by per-route caps.
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    // Decouple e2e from Redis: stub the queue token + worker bootstrap. The
    // stub's `add` is patched after init() to invoke the real executor, so
    // enqueueDeploy still runs the deployment like the BullMQ worker would.
    .overrideProvider('DEPLOYMENTS_QUEUE')
    .useValue(deploymentsQueueStub)
    .overrideProvider(DeploymentsProcessor)
    .useValue({ onModuleInit: jest.fn() })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  // Simulate the BullMQ worker: run the real executor when a deploy is enqueued.
  const executor = app.get(DockerDeployExecutorService);
  deploymentsQueueStub.add = (
    name: string,
    data: { deploymentId: string; overrideImage?: string },
  ) => {
    if (name === 'deploy') {
      void executor.executeDeploy(data.deploymentId, data.overrideImage);
    }
    return Promise.resolve({ id: 'stub-job' });
  };

  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);

  const authCookie = (
    userId: string,
    role: Role = Role.ADMIN,
    email = 'e2e@deployautomation.test',
  ): string => {
    const token = jwt.generateAccessToken({ id: userId, email, role });
    return `deploy_automation_token=${token}`;
  };

  const resetDb = async (): Promise<void> => {
    const list = TRUNCATE_ROOTS.map((t) => `"${t}"`).join(', ');
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
    );
  };

  return {
    app,
    prisma,
    docker: dockerMock.useValue,
    gitlab: gitlabMock.useValue,
    localBuild: localBuildMock.useValue,
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
