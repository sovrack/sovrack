import { EventEmitter2 } from '@nestjs/event-emitter';
import { GitProviderType, PipelineRunStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitlabWebhookHandler } from './gitlab-webhook.handler';
import { GitlabPipelinePersistenceService } from './gitlab-pipeline-persistence.service';
import { DEPLOYMENT_AUTO_DEPLOY_TRIGGER } from '../../../../shared/events/events.catalog';
import type { WebhookEndpointContext } from '../../../../shared/webhook/webhook-handler.interface';

/**
 * Verrouille le cœur CI/CD : un pipeline qui PASSE à success déclenche un
 * auto-deploy ; un success déjà connu (pas de transition) n'en déclenche pas ;
 * un event non-pipeline est ignoré.
 */
describe('GitlabWebhookHandler — pipeline → auto-deploy', () => {
  const endpoint: WebhookEndpointContext = {
    id: 'wh1',
    provider: GitProviderType.GITLAB,
    projectId: 'p1',
    serviceId: 'svc1',
    serviceEnvId: null,
    isActive: true,
  };

  function makeHandler(
    previousStatus: PipelineRunStatus | null,
    deployTrigger = 'PIPELINE_SUCCESS',
  ) {
    const prisma = {
      service: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'svc1', branch: 'main', deployTrigger }),
      },
      build: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const emit = jest.fn().mockResolvedValue([]);
    const events = { emitAsync: emit } as unknown as EventEmitter2;
    const pipelinePersistence = {
      upsertPipelineWithPreviousStatus: jest.fn().mockResolvedValue({
        previousStatus,
        currentStatus: PipelineRunStatus.SUCCESS,
      }),
    } as unknown as GitlabPipelinePersistenceService;
    return {
      handler: new GitlabWebhookHandler(prisma, events, pipelinePersistence),
      emit,
    };
  }

  const successPayload = {
    object_kind: 'pipeline',
    object_attributes: {
      id: 42,
      status: 'success',
      ref: 'main',
      sha: 'deadbeef',
    },
  };

  it('triggers auto-deploy when a pipeline transitions to success', async () => {
    const { handler, emit } = makeHandler(null);
    const res = await handler.handleIncoming(endpoint, successPayload);
    expect(res.status).toBe('ok');
    const autoDeploy = emit.mock.calls.find(
      (c) => c[0] === DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
    );
    expect(autoDeploy).toBeDefined();
    expect(autoDeploy?.[1]).toMatchObject({
      projectId: 'p1',
      branch: 'main',
      serviceId: 'svc1',
    });
  });

  it('does NOT trigger auto-deploy when already success (no transition)', async () => {
    const { handler, emit } = makeHandler(PipelineRunStatus.SUCCESS);
    await handler.handleIncoming(endpoint, successPayload);
    const autoDeploy = emit.mock.calls.find(
      (c) => c[0] === DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
    );
    expect(autoDeploy).toBeUndefined();
  });

  it('ignores a push event when the service is not in PUSH mode', async () => {
    const { handler, emit } = makeHandler(null, 'PIPELINE_SUCCESS');
    const res = await handler.handleIncoming(endpoint, {
      object_kind: 'push',
      ref: 'refs/heads/main',
    });
    expect(res.status).toBe('ignored');
    const autoDeploy = emit.mock.calls.find(
      (c) => c[0] === DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
    );
    expect(autoDeploy).toBeUndefined();
  });

  it('deploys on push when the service is in PUSH mode', async () => {
    const { handler, emit } = makeHandler(null, 'PUSH');
    const res = await handler.handleIncoming(endpoint, {
      object_kind: 'push',
      ref: 'refs/heads/develop',
    });
    expect(res.status).toBe('ok');
    const autoDeploy = emit.mock.calls.find(
      (c) => c[0] === DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
    );
    expect(autoDeploy?.[1]).toMatchObject({
      branch: 'develop',
      serviceId: 'svc1',
    });
  });

  it('does NOT deploy on pipeline success when the service is in PUSH mode', async () => {
    const { handler, emit } = makeHandler(null, 'PUSH');
    await handler.handleIncoming(endpoint, successPayload);
    const autoDeploy = emit.mock.calls.find(
      (c) => c[0] === DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
    );
    expect(autoDeploy).toBeUndefined();
  });
});
