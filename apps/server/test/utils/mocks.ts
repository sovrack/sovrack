import { DockerDeployExecutorService } from '../../src/modules/deployments/services/docker-deploy-executor.service';
import { GitlabAdapter } from '../../src/modules/source-providers/adapters/gitlab/gitlab.adapter';

export type AnsibleMockHandle = {
  executeDeploy: jest.Mock;
  reset: () => void;
};

export function mockDockerDeployExecutorService(): {
  provide: typeof DockerDeployExecutorService;
  useValue: AnsibleMockHandle;
} {
  const executeDeploy = jest.fn().mockResolvedValue(undefined);
  return {
    provide: DockerDeployExecutorService,
    useValue: {
      executeDeploy,
      reset: () => executeDeploy.mockClear(),
    } as unknown as AnsibleMockHandle,
  };
}

export type GitlabMockHandle = {
  triggerPipeline: jest.Mock;
  reset: () => void;
};

export function mockGitlabService(): {
  provide: typeof GitlabAdapter;
  useValue: GitlabMockHandle;
} {
  const triggerPipeline = jest
    .fn()
    .mockResolvedValue({ id: 12345, webUrl: 'https://gitlab.example.com/pipeline/12345' });
  return {
    provide: GitlabAdapter,
    useValue: {
      triggerPipeline,
      reset: () => triggerPipeline.mockClear(),
    } as unknown as GitlabMockHandle,
  };
}
