import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  DEPLOYMENT_PIPELINE_UPDATED,
} from '../../../../shared/events/events.catalog';
import { GithubWebhookHandler } from './github-webhook.handler';
import type { WebhookEndpointContext } from '../../../webhooks/interfaces/webhook-handler.interface';

describe('GithubWebhookHandler', () => {
  let emit: jest.Mock;
  let handler: GithubWebhookHandler;

  beforeEach(() => {
    emit = jest.fn().mockResolvedValue([]);
    const prisma = {} as unknown as PrismaService;
    handler = new GithubWebhookHandler(prisma, {
      emitAsync: emit,
    } as unknown as EventEmitter2);
  });

  const endpoint = (over: Partial<WebhookEndpointContext> = {}) =>
    ({
      isActive: true,
      projectId: 'p1',
      serviceId: 'svc1',
      ...over,
    }) as WebhookEndpointContext;

  it('ignores events on an inactive endpoint', async () => {
    const res = await handler.handleIncoming(endpoint({ isActive: false }), {
      ref: 'refs/heads/main',
      repository: {},
    });
    expect(res.status).toBe('ignored');
    expect(emit).not.toHaveBeenCalled();
  });

  it('push on a branch → emits auto-deploy with the branch name', async () => {
    const res = await handler.handleIncoming(endpoint(), {
      ref: 'refs/heads/release/v2',
      repository: { full_name: 'org/app' },
    });
    expect(res.status).toBe('ok');
    expect(emit).toHaveBeenCalledWith(
      DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
      expect.objectContaining({
        projectId: 'p1',
        branch: 'release/v2',
        serviceId: 'svc1',
      }),
    );
  });

  it('push without a ref → ignored', async () => {
    const res = await handler.handleIncoming(endpoint(), { repository: {} });
    expect(res.status).toBe('ignored');
    expect(emit).not.toHaveBeenCalled();
  });

  it('workflow_run success → pipeline update + auto-deploy', async () => {
    const res = await handler.handleIncoming(endpoint(), {
      workflow_run: { id: 42, conclusion: 'success', head_branch: 'main' },
    });
    expect(res.status).toBe('ok');
    const events = emit.mock.calls.map((c) => c[0]);
    expect(events).toContain(DEPLOYMENT_PIPELINE_UPDATED);
    expect(events).toContain(DEPLOYMENT_AUTO_DEPLOY_TRIGGER);
  });

  it('workflow_run failure → pipeline update only (no auto-deploy)', async () => {
    const res = await handler.handleIncoming(endpoint(), {
      workflow_run: { id: 43, conclusion: 'failure', head_branch: 'main' },
    });
    expect(res.status).toBe('ok');
    const events = emit.mock.calls.map((c) => c[0]);
    expect(events).toContain(DEPLOYMENT_PIPELINE_UPDATED);
    expect(events).not.toContain(DEPLOYMENT_AUTO_DEPLOY_TRIGGER);
  });

  it('ignores an unrecognized event shape', async () => {
    const res = await handler.handleIncoming(endpoint(), { hello: 'world' });
    expect(res.status).toBe('ignored');
  });
});
