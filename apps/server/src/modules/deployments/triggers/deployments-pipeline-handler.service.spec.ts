import { Test, TestingModule } from '@nestjs/testing';
import {
  DeploymentStatus,
  GitProviderType,
  PipelineRunStatus,
} from '@prisma/client';
import { DeploymentsPipelineHandlerService } from './deployments-pipeline-handler.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { QueueService } from '../../../shared/queue/queue.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';

const buildPrisma = () => ({
  pipelineRun: {
    findUnique: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
  },
  deployment: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  project: {
    findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1' }),
  },
});

const buildQueue = () => ({
  enqueueDeploy: jest.fn().mockResolvedValue('job-1'),
});

const buildGateway = () => ({
  emitStatus: jest.fn(),
  emitFinished: jest.fn(),
  emitLog: jest.fn(),
});

const buildNotifications = () => ({
  notifyDeploymentFinished: jest.fn().mockResolvedValue(undefined),
});

const PIPELINE_ID = 999;
const DEPLOYMENT_ID = 'deploy-1';
const PROJECT_ID = 'project-1';

describe('DeploymentsPipelineHandlerService', () => {
  let service: DeploymentsPipelineHandlerService;
  let prisma: ReturnType<typeof buildPrisma>;
  let queue: ReturnType<typeof buildQueue>;
  let gateway: ReturnType<typeof buildGateway>;

  beforeEach(async () => {
    prisma = buildPrisma();
    queue = buildQueue();
    gateway = buildGateway();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentsPipelineHandlerService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
        { provide: DeploymentEventsPublisher, useValue: gateway },
        { provide: NotificationsService, useValue: buildNotifications() },
      ],
    }).compile();

    service = module.get(DeploymentsPipelineHandlerService);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('handlePipelineUpdate', () => {
    it('returns ignored when no PipelineRun and no matching Deployment', async () => {
      prisma.pipelineRun.findUnique.mockResolvedValue(null);
      prisma.deployment.findFirst.mockResolvedValue(null);

      const result = await service.handlePipelineUpdate(
        PROJECT_ID,
        PIPELINE_ID,
        'running',
      );

      expect(result).toEqual({ status: 'ignored' });
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
    });

    it('on SUCCESS — claims deployment and triggers Ansible', async () => {
      prisma.pipelineRun.findUnique.mockResolvedValue(null);
      prisma.deployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.RUNNING,
        logs: '',
        projectId: PROJECT_ID,
      });
      prisma.deployment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.handlePipelineUpdate(
        PROJECT_ID,
        PIPELINE_ID,
        'success',
        'my-image:sha256',
      );

      expect(result).toEqual({ status: 'ok' });
      expect(queue.enqueueDeploy).toHaveBeenCalledWith(
        DEPLOYMENT_ID,
        'team-1',
        'my-image:sha256',
      );
    });

    it('on SUCCESS — returns ignored when deployment already claimed (race condition)', async () => {
      prisma.pipelineRun.findUnique.mockResolvedValue(null);
      prisma.deployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.RUNNING,
        logs: '',
        projectId: PROJECT_ID,
      });
      prisma.deployment.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.handlePipelineUpdate(
        PROJECT_ID,
        PIPELINE_ID,
        'success',
      );

      expect(result).toEqual({ status: 'ignored' });
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
    });

    it('on FAILED — marks deployment FAILED and emits gateway events', async () => {
      const finishedAt = new Date();
      prisma.pipelineRun.findUnique.mockResolvedValue(null);
      prisma.deployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.RUNNING,
        logs: '',
        projectId: PROJECT_ID,
      });
      prisma.deployment.updateMany.mockResolvedValue({ count: 1 });
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.FAILED,
        finishedAt,
      });
      prisma.deployment.findUnique.mockResolvedValueOnce(null);

      const result = await service.handlePipelineUpdate(
        PROJECT_ID,
        PIPELINE_ID,
        'failed',
      );

      expect(result).toEqual({ status: 'ok' });
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
      expect(gateway.emitStatus).toHaveBeenCalledWith({
        deploymentId: DEPLOYMENT_ID,
        status: DeploymentStatus.FAILED,
      });
      expect(gateway.emitFinished).toHaveBeenCalledWith({
        deploymentId: DEPLOYMENT_ID,
        status: DeploymentStatus.FAILED,
        finishedAt,
      });
    });

    it('on CANCELED — marks deployment CANCELED', async () => {
      prisma.pipelineRun.findUnique.mockResolvedValue(null);
      prisma.deployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.RUNNING,
        logs: '',
        projectId: PROJECT_ID,
      });
      prisma.deployment.updateMany.mockResolvedValue({ count: 1 });
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.CANCELED,
        finishedAt: new Date(),
      });
      prisma.deployment.findUnique.mockResolvedValueOnce(null);

      const result = await service.handlePipelineUpdate(
        PROJECT_ID,
        PIPELINE_ID,
        'canceled',
      );

      expect(result).toEqual({ status: 'ok' });
      const updateManyCall = prisma.deployment.updateMany.mock.calls[0][0] as {
        data: { status: DeploymentStatus };
      };
      expect(updateManyCall.data.status).toBe(DeploymentStatus.CANCELED);
    });

    it('uses PipelineRun linked deploymentId when available', async () => {
      prisma.pipelineRun.findUnique.mockResolvedValue({
        id: 'run-1',
        deploymentId: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
      });
      prisma.deployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.RUNNING,
        logs: '',
        projectId: PROJECT_ID,
      });
      prisma.deployment.updateMany.mockResolvedValue({ count: 1 });

      await service.handlePipelineUpdate(PROJECT_ID, PIPELINE_ID, 'success');

      expect(prisma.deployment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DEPLOYMENT_ID, projectId: PROJECT_ID },
        }),
      );
      expect(queue.enqueueDeploy).toHaveBeenCalledWith(
        DEPLOYMENT_ID,
        'team-1',
        undefined,
      );
    });

    it('upserts PipelineRun with correct status and provider', async () => {
      prisma.pipelineRun.findUnique.mockResolvedValue(null);
      prisma.deployment.findFirst.mockResolvedValue({
        id: DEPLOYMENT_ID,
        status: DeploymentStatus.PENDING,
        logs: null,
        projectId: PROJECT_ID,
      });
      prisma.deployment.updateMany.mockResolvedValue({ count: 1 });

      await service.handlePipelineUpdate(
        PROJECT_ID,
        PIPELINE_ID,
        'running',
        undefined,
        GitProviderType.GITHUB,
      );

      expect(prisma.pipelineRun.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: PipelineRunStatus.RUNNING,
            provider: GitProviderType.GITHUB,
          }),
        }),
      );
    });
  });
});
