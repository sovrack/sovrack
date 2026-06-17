import { EventEmitter2 } from '@nestjs/event-emitter';
import { GitProviderType, PipelineRunStatus } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { GitlabWebhookHandler } from './gitlab-webhook.handler';
import { DEPLOYMENT_AUTO_DEPLOY_TRIGGER } from '../../../deployments/events/deployment.events';
import type { WebhookEndpointContext } from '../../../webhooks/interfaces/webhook-handler.interface';

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
  } as WebhookEndpointContext;

  function makeHandler(previousStatus: PipelineRunStatus | null) {
    const prisma = {
      pipelineRun: {
        findUnique: jest.fn().mockResolvedValue(
          previousStatus ? { status: previousStatus } : null,
        ),
        upsert: jest.fn().mockResolvedValue({}),
      },
      service: {
        findUnique: jest.fn().mockResolvedValue({ id: 'svc1', branch: 'main' }),
      },
      build: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const emit = jest.fn().mockResolvedValue([]);
    const events = { emitAsync: emit } as unknown as EventEmitter2;
    return { handler: new GitlabWebhookHandler(prisma, events), emit };
  }

  const successPayload = {
    object_kind: 'pipeline',
    object_attributes: { id: 42, status: 'success', ref: 'main', sha: 'deadbeef' },
  };

  it('triggers auto-deploy when a pipeline transitions to success', async () => {
    const { handler, emit } = makeHandler(null);
    const res = await handler.handleIncoming(endpoint, successPayload);
    expect(res.status).toBe('ok');
    const autoDeploy = emit.mock.calls.find(
      (c) => c[0] === DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
    );
    expect(autoDeploy).toBeDefined();
    expect(autoDeploy?.[1]).toMatchObject({ projectId: 'p1', branch: 'main', serviceId: 'svc1' });
  });

  it('does NOT trigger auto-deploy when already success (no transition)', async () => {
    const { handler, emit } = makeHandler(PipelineRunStatus.SUCCESS);
    await handler.handleIncoming(endpoint, successPayload);
    const autoDeploy = emit.mock.calls.find(
      (c) => c[0] === DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
    );
    expect(autoDeploy).toBeUndefined();
  });

  it('ignores non-pipeline events', async () => {
    const { handler, emit } = makeHandler(null);
    const res = await handler.handleIncoming(endpoint, {
      object_kind: 'push',
      ref: 'refs/heads/main',
    });
    expect(res.status).toBe('ignored');
    expect(emit).not.toHaveBeenCalled();
  });
});
