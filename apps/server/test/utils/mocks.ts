import { DeploymentsExecutorService } from '../../src/modules/deployments/services/deployments-executor.service';
import { GitlabService } from '../../src/modules/git-providers/gitlab/gitlab.service';

export type AnsibleMockHandle = {
  deployWithAnsible: jest.Mock;
  reset: () => void;
};

export function mockDeploymentsExecutorService(): {
  provide: typeof DeploymentsExecutorService;
  useValue: AnsibleMockHandle;
} {
  const deployWithAnsible = jest.fn().mockResolvedValue(undefined);
  return {
    provide: DeploymentsExecutorService,
    useValue: {
      deployWithAnsible,
      reset: () => deployWithAnsible.mockClear(),
    } as unknown as AnsibleMockHandle,
  };
}

export type GitlabMockHandle = {
  triggerPipeline: jest.Mock;
  reset: () => void;
};

export function mockGitlabService(): {
  provide: typeof GitlabService;
  useValue: GitlabMockHandle;
} {
  const triggerPipeline = jest
    .fn()
    .mockResolvedValue({ id: 12345, webUrl: 'https://gitlab.example.com/pipeline/12345' });
  return {
    provide: GitlabService,
    useValue: {
      triggerPipeline,
      reset: () => triggerPipeline.mockClear(),
    } as unknown as GitlabMockHandle,
  };
}
