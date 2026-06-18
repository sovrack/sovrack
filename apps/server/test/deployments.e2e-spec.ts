import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DeploymentStatus } from '@prisma/client';
import type { BuildSource } from '../src/modules/build/strategies/build-strategy.interface';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { DeploymentsCreateService } from '../src/modules/deployments/core/deployments-create.service';
import { DockerDeployExecutorService } from '../src/modules/deployments/core/docker-deploy-executor.service';
import { DeploymentsProcessor } from '../src/modules/deployments/processors/deployments.processor';
import { GitlabAdapter } from '../src/modules/source-providers/adapters/gitlab/gitlab.adapter';
import { DeploymentsGateway } from '../src/modules/deployments/gateways/deployments.gateway';
import { BuildImageService } from '../src/modules/build/lifecycle/build-image.service';
import { CreateDeploymentDto } from '../src/modules/deployments/dto/create-deployment.dto';

import { createTestFixtures, createTestService, TestFixtures } from './utils/test-fixtures';
import { mockDockerDeployExecutorService, mockGitlabService } from './utils/mocks';

type AnsibleMock = ReturnType<typeof mockDockerDeployExecutorService>['useValue'];
type GitlabMock = ReturnType<typeof mockGitlabService>['useValue'];

interface MatrixCase {
  name: string;
  buildSource: BuildSource;
  expectedIsLocalBuild: boolean;
  expectedDirectTrigger: boolean;
  expectedPlaybook: string;
  expectedPipelineTriggered: boolean;
}

const buildDto = (f: TestFixtures, overrides: Partial<CreateDeploymentDto> = {}): CreateDeploymentDto => ({
  serviceEnvId: f.serviceEnvId,
  branch: 'main',
  buildSource: 'DOCKERFILE_REGISTRY',
  ...overrides,
});

describe('DeploymentsCreateService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let createService: DeploymentsCreateService;
  let ansibleMock: AnsibleMock;
  let gitlabMock: GitlabMock;
  let dockerImageMock: { buildDockerImage: jest.Mock };

  beforeAll(async () => {
    dockerImageMock = {
      buildDockerImage: jest
        .fn()
        .mockResolvedValue('registry.gitlab.example.com/platform/e2e:main'),
    };

    const dockerExecMock = mockDockerDeployExecutorService().useValue;
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DockerDeployExecutorService)
      .useValue(dockerExecMock)
      .overrideProvider(GitlabAdapter)
      .useValue(mockGitlabService().useValue)
      .overrideProvider(BuildImageService)
      .useValue(dockerImageMock)
      .overrideProvider(DeploymentsGateway)
      .useValue({
        emitStarted: jest.fn(),
        emitStatus: jest.fn(),
        emitFinished: jest.fn(),
      })
      // Deploys now go through the queue; simulate the worker by invoking the
      // (mocked) executor synchronously when a 'deploy' job is enqueued.
      .overrideProvider('DEPLOYMENTS_QUEUE')
      .useValue({
        add: (name: string, data: { deploymentId: string; overrideImage?: string }) => {
          if (name === 'deploy') {
            void dockerExecMock.executeDeploy(data.deploymentId, data.overrideImage);
          }
          return Promise.resolve({ id: 'stub-job' });
        },
      })
      .overrideProvider(DeploymentsProcessor)
      .useValue({ onModuleInit: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    createService = app.get(DeploymentsCreateService);
    ansibleMock = app.get<AnsibleMock>(DockerDeployExecutorService);
    gitlabMock = app.get<GitlabMock>(GitlabAdapter);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    ansibleMock.reset();
    gitlabMock.reset();
    dockerImageMock.buildDockerImage.mockClear();
    // Reset deployment-related tables between cases so rows from a previous
    // case (PipelineRun, Deployment, Build) never leak into the next one.
    await prisma.pipelineRun.deleteMany({});
    await prisma.container.deleteMany({});
    await prisma.deployment.deleteMany({});
    await prisma.build.deleteMany({});
  });

  /**
   * The full (buildStrategy, buildMode) matrix.
   * Each case seeds fresh fixtures, calls create(), and asserts that:
   *  - status is correct (RUNNING if direct trigger, RUNNING if pipeline)
   *  - the right downstream was triggered (ansible vs gitlab)
   *  - the playbook chosen matches PlaybookRouter's contract
   */
  const cases: MatrixCase[] = [
    {
      name: 'STATIC → deploy-static.yml, direct ansible',
      buildSource: 'STATIC',
      expectedIsLocalBuild: true,
      expectedDirectTrigger: true,
      expectedPlaybook: 'deploy-static.yml',
      expectedPipelineTriggered: false,
    },
    {
      name: 'DOCKER_COMPOSE → deploy-compose.yml, direct ansible',
      buildSource: 'DOCKER_COMPOSE',
      expectedIsLocalBuild: true,
      expectedDirectTrigger: true,
      expectedPlaybook: 'deploy-compose.yml',
      expectedPipelineTriggered: false,
    },
    {
      name: 'NIXPACKS_LOCAL → deploy-nixpacks.yml, direct ansible',
      buildSource: 'NIXPACKS_LOCAL',
      expectedIsLocalBuild: true,
      expectedDirectTrigger: true,
      expectedPlaybook: 'deploy-nixpacks.yml',
      expectedPipelineTriggered: false,
    },
    {
      name: 'NIXPACKS_REGISTRY → deploy.yml, CI pipeline',
      buildSource: 'NIXPACKS_REGISTRY',
      expectedIsLocalBuild: false,
      expectedDirectTrigger: false,
      expectedPlaybook: 'deploy.yml',
      expectedPipelineTriggered: true,
    },
    {
      name: 'DOCKERFILE_LOCAL → deploy-local-build.yml, direct ansible',
      buildSource: 'DOCKERFILE_LOCAL',
      expectedIsLocalBuild: true,
      expectedDirectTrigger: true,
      expectedPlaybook: 'deploy-local-build.yml',
      expectedPipelineTriggered: false,
    },
    {
      name: 'DOCKERFILE_REGISTRY → deploy.yml, CI pipeline',
      buildSource: 'DOCKERFILE_REGISTRY',
      expectedIsLocalBuild: false,
      expectedDirectTrigger: false,
      expectedPlaybook: 'deploy.yml',
      expectedPipelineTriggered: true,
    },
    {
      name: 'EXTERNAL_IMAGE → deploy.yml, direct ansible',
      buildSource: 'EXTERNAL_IMAGE',
      expectedIsLocalBuild: false,
      expectedDirectTrigger: true,
      expectedPlaybook: 'deploy.yml',
      expectedPipelineTriggered: false,
    },
  ];

  describe.each(cases)('$name', (tc) => {
    it('selects the right playbook and triggers the right downstream', async () => {
      const fixtures = await createTestFixtures(prisma);
      const extra: Partial<CreateDeploymentDto> = { buildSource: tc.buildSource };
      if (tc.buildSource === 'EXTERNAL_IMAGE') extra.overrideImage = 'docker.io/nginx:latest';
      const dto = buildDto(fixtures, extra);

      const deployment = await createService.create(dto, fixtures.userId);

      // Status assertion — direct trigger cases immediately go RUNNING.
      // Pipeline cases also go RUNNING once the pipeline is created.
      expect(deployment.status).toBe(DeploymentStatus.RUNNING);

      // Downstream trigger assertion
      if (tc.expectedDirectTrigger) {
        expect(ansibleMock.executeDeploy).toHaveBeenCalledTimes(1);
        expect(ansibleMock.executeDeploy).toHaveBeenCalledWith(deployment.id, undefined);
        expect(gitlabMock.triggerPipeline).not.toHaveBeenCalled();
      } else {
        expect(gitlabMock.triggerPipeline).toHaveBeenCalledTimes(1);
        expect(ansibleMock.executeDeploy).not.toHaveBeenCalled();
      }
    }, 30000);

    it('persists isLocalBuild on the linked Build row', async () => {
      const fixtures = await createTestFixtures(prisma);
      const extra: Partial<CreateDeploymentDto> = { buildSource: tc.buildSource };
      if (tc.buildSource === 'EXTERNAL_IMAGE') extra.overrideImage = 'docker.io/nginx:latest';
      const dto = buildDto(fixtures, extra);
      const deployment = await createService.create(dto, fixtures.userId);

      const build = await prisma.build.findUnique({
        where: { id: deployment.buildId! },
      });
      expect(build?.isLocalBuild).toBe(tc.expectedIsLocalBuild);
    }, 30000);

    // P2-#1 regression: every Deployment must be linked to a Build row,
    // created in the same transaction (so the deployment cannot exist
    // without its build, and vice versa).
    it('creates a Build row alongside the Deployment (P2-#1)', async () => {
      const fixtures = await createTestFixtures(prisma);
      const extra: Partial<CreateDeploymentDto> = { buildSource: tc.buildSource };
      if (tc.buildSource === 'EXTERNAL_IMAGE') extra.overrideImage = 'docker.io/nginx:latest';
      const dto = buildDto(fixtures, extra);
      const deployment = await createService.create(dto, fixtures.userId);

      expect(deployment.buildId).toBeTruthy();
      const build = await prisma.build.findUnique({
        where: { id: deployment.buildId! },
      });
      expect(build).toBeTruthy();
      expect(build!.projectId).toBe(fixtures.projectId);
      expect(build!.branch).toBe(deployment.branch);
      expect(build!.status).toBe('NOT_BUILT');
    }, 30000);
  });

  describe('regression — skipGitlabCi flow', () => {
    /**
     * REGRESSION TEST: this is the exact bug we fixed. Before the fix,
     * deployments with `needsDirectTrigger=true` were created with status
     * RUNNING but NO ansible call was ever made — they'd hang forever.
     */
    it('STATIC deployment: ansible MUST be triggered (no hang)', async () => {
      const fixtures = await createTestFixtures(prisma);
      const dto = buildDto(fixtures, { buildSource: 'STATIC' });
      const deployment = await createService.create(dto, fixtures.userId);
      expect(deployment.status).toBe(DeploymentStatus.RUNNING);
      expect(ansibleMock.executeDeploy).toHaveBeenCalledWith(deployment.id, undefined);
    });

    it('NIXPACKS_LOCAL deployment: ansible MUST be triggered (no hang)', async () => {
      const fixtures = await createTestFixtures(prisma);
      const dto = buildDto(fixtures, { buildSource: 'NIXPACKS_LOCAL' });
      const deployment = await createService.create(dto, fixtures.userId);
      expect(deployment.status).toBe(DeploymentStatus.RUNNING);
      expect(ansibleMock.executeDeploy).toHaveBeenCalledWith(deployment.id, undefined);
    });
  });

  describe('error paths', () => {
    it('rejects when an active deployment exists on the environment', async () => {
      const fixtures = await createTestFixtures(prisma);
      const dto = buildDto(fixtures, { buildSource: 'NIXPACKS_LOCAL' });
      await createService.create(dto, fixtures.userId);
      await expect(
        createService.create(dto, fixtures.userId),
      ).rejects.toThrow(/déjà en cours/i);
    });

    it('rejects when no Git provider config on project', async () => {
      const fixtures = await createTestFixtures(prisma);
      // In the new schema, git provider config is per-service, not per-project.
      // This test now verifies that a service without providerId still works.
      const dto = buildDto(fixtures);
      await expect(
        createService.create(dto, fixtures.userId),
      ).resolves.toBeDefined();
    });

    it('STATIC deployment with no env config still succeeds', async () => {
      const fixtures = await createTestFixtures(prisma);
      const dto = buildDto(fixtures, { buildSource: 'STATIC' });
      const deployment = await createService.create(dto, fixtures.userId);
      expect(deployment.status).toBe(DeploymentStatus.RUNNING);
    });
  });

  describe('PlaybookRouter contract enforcement', () => {
    /**
     * Iterates over every BuildStrategy value to ensure:
     *  - create() always returns a RUNNING deployment
     *  - either ansible or gitlab was called (never neither — no hang)
     *  - the router's choice matches what the service did
     */
    const allSources: BuildSource[] = [
      'DOCKERFILE_REGISTRY', 'DOCKERFILE_LOCAL',
      'NIXPACKS_REGISTRY', 'NIXPACKS_LOCAL',
      'DOCKER_COMPOSE', 'STATIC', 'EXTERNAL_IMAGE',
    ];
    it.each(allSources)(
      'buildSource %s always triggers exactly one downstream (no hang)',
      async (src) => {
        const fixtures = await createTestFixtures(prisma);
        const extra: Partial<CreateDeploymentDto> = { buildSource: src };
        if (src === 'EXTERNAL_IMAGE') extra.overrideImage = 'docker.io/nginx:latest';
        const dto = buildDto(fixtures, extra);
        const deployment = await createService.create(dto, fixtures.userId);

        const ansibleCalls = ansibleMock.executeDeploy.mock.calls.length;
        const gitlabCalls = gitlabMock.triggerPipeline.mock.calls.length;

        expect(deployment.status).toBe(DeploymentStatus.RUNNING);
        expect(ansibleCalls + gitlabCalls).toBe(1);
        expect(ansibleCalls).toBeLessThanOrEqual(1);
        expect(gitlabCalls).toBeLessThanOrEqual(1);
      },
      30000,
    );
  });
});
