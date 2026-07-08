import { createDeploymentsWorker } from '../../../shared/queue/queue.provider';
import { DockerDeployExecutorService } from '../core/docker-deploy-executor.service';
import { DeploymentsProcessor } from './deployments.processor';

jest.mock('../../../shared/queue/queue.provider', () => ({
  createDeploymentsWorker: jest.fn(),
}));

describe('DeploymentsProcessor', () => {
  let processor: DeploymentsProcessor;
  let mockWorker: { on: jest.Mock; close: jest.Mock };
  let executeDeploy: jest.Mock;
  let capturedProcessFn: (job: {
    name: string;
    data: unknown;
    id?: string;
  }) => Promise<void>;

  beforeEach(() => {
    mockWorker = {
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (createDeploymentsWorker as jest.Mock).mockImplementation((fn) => {
      capturedProcessFn = fn as typeof capturedProcessFn;
      return mockWorker;
    });

    executeDeploy = jest.fn().mockResolvedValue(undefined);
    const executor = {
      executeDeploy,
    } as unknown as DockerDeployExecutorService;
    processor = new DeploymentsProcessor(executor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('creates a BullMQ worker', async () => {
      processor.onModuleInit();
      expect(createDeploymentsWorker).toHaveBeenCalledTimes(1);
    });

    it('registers completed and failed event listeners', async () => {
      processor.onModuleInit();
      expect(mockWorker.on).toHaveBeenCalledWith(
        'completed',
        expect.any(Function),
      );
      expect(mockWorker.on).toHaveBeenCalledWith(
        'failed',
        expect.any(Function),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('closes the worker on destroy', async () => {
      processor.onModuleInit();
      await processor.onModuleDestroy();
      expect(mockWorker.close).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when worker was never initialized', async () => {
      await expect(processor.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockWorker.close).not.toHaveBeenCalled();
    });

    it('does not close twice on double-destroy', async () => {
      processor.onModuleInit();
      await processor.onModuleDestroy();
      await processor.onModuleDestroy();
      expect(mockWorker.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('job dispatch', () => {
    beforeEach(async () => {
      processor.onModuleInit();
    });

    it('routes deploy job to executeDeploy', async () => {
      await capturedProcessFn({
        name: 'deploy',
        data: { deploymentId: 'd1', overrideImage: null },
      });
      expect(executeDeploy).toHaveBeenCalledWith('d1', null);
    });

    it('passes overrideImage to executeDeploy', async () => {
      await capturedProcessFn({
        name: 'deploy',
        data: { deploymentId: 'd2', overrideImage: 'registry/img:tag' },
      });
      expect(executeDeploy).toHaveBeenCalledWith('d2', 'registry/img:tag');
    });

    it('returns undefined for unknown job names without throwing', async () => {
      await expect(
        capturedProcessFn({ name: 'unknown-job', data: {} }),
      ).resolves.toBeUndefined();
      expect(executeDeploy).not.toHaveBeenCalled();
    });
  });
});
