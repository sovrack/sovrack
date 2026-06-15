import { DockerApiService } from '../../src/core/container-runtime/docker-api.service';
import { DockerDeployExecutorService } from '../../src/modules/deployments/core/docker-deploy-executor.service';
import { DeploymentsHealthcheckService } from '../../src/modules/deployments/health/deployments-healthcheck.service';
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
  // Each call returns a unique pipeline ID so repeated create() calls across
  // matrix cases never collide on PipelineRun @@unique([externalId, provider]).
  let pipelineSeq = 100000;
  const triggerPipeline = jest.fn().mockImplementation(() => {
    const id = ++pipelineSeq;
    return Promise.resolve({
      id,
      webUrl: `https://gitlab.example.com/pipeline/${id}`,
    });
  });
  return {
    provide: GitlabAdapter,
    useValue: {
      // SourceProvidersService.forType() resolves the adapter by `type`, so the
      // mock must expose it just like the real GitlabAdapter (readonly type).
      type: 'GITLAB',
      triggerPipeline,
      reset: () => triggerPipeline.mockClear(),
    } as unknown as GitlabMockHandle,
  };
}

/**
 * Fake Docker Engine API so the REAL DockerDeployExecutorService can run end to
 * end without touching a Docker daemon. Every lifecycle call resolves to a
 * plausible value; inspectImage returns a stable digest so imageSha is set.
 */
export type DockerApiMockHandle = {
  pullImage: jest.Mock;
  listContainers: jest.Mock;
  createContainer: jest.Mock;
  startContainer: jest.Mock;
  removeContainer: jest.Mock;
  inspectImage: jest.Mock;
  createVolume: jest.Mock;
  streamContainerLogs: jest.Mock;
  reset: () => void;
};

export const E2E_IMAGE_DIGEST = 'sha256:e2eaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export function mockDockerApiService(): {
  provide: typeof DockerApiService;
  useValue: DockerApiMockHandle;
} {
  const pullImage = jest.fn().mockResolvedValue(undefined);
  const listContainers = jest.fn().mockResolvedValue([]);
  const createContainer = jest.fn().mockResolvedValue({ id: 'container-e2e-0123456789ab' });
  const startContainer = jest.fn().mockResolvedValue(undefined);
  const removeContainer = jest.fn().mockResolvedValue(undefined);
  const inspectImage = jest
    .fn()
    .mockResolvedValue({ Id: E2E_IMAGE_DIGEST, RepoDigests: [`repo@${E2E_IMAGE_DIGEST}`] });
  const createVolume = jest.fn().mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/require-await
  const streamContainerLogs = jest.fn(async function* () {
    yield { stream: 'stdout', line: 'e2e log line' };
  });
  return {
    provide: DockerApiService,
    useValue: {
      pullImage,
      listContainers,
      createContainer,
      startContainer,
      removeContainer,
      inspectImage,
      createVolume,
      streamContainerLogs,
      reset: () => {
        [
          pullImage,
          listContainers,
          createContainer,
          startContainer,
          removeContainer,
          inspectImage,
          createVolume,
          streamContainerLogs,
        ].forEach((m) => m.mockClear());
      },
    } as unknown as DockerApiMockHandle,
  };
}

/** Healthcheck mock: always returns a success log line, no real HTTP. */
export function mockHealthcheckService(): {
  provide: typeof DeploymentsHealthcheckService;
  useValue: { runPostDeployHealthChecks: jest.Mock };
} {
  return {
    provide: DeploymentsHealthcheckService,
    useValue: {
      runPostDeployHealthChecks: jest.fn().mockResolvedValue('[HEALTH] skipped in e2e'),
    },
  };
}
