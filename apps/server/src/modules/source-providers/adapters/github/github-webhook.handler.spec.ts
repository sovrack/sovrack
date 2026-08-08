import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  DEPLOYMENT_PIPELINE_UPDATED,
} from '../../../../shared/events/events.catalog';
import { GithubWebhookHandler } from './github-webhook.handler';
import type { WebhookEndpointContext } from '../../../../shared/webhook/webhook-handler.interface';

describe('GithubWebhookHandler', () => {
  let emit: jest.Mock;
  let handler: GithubWebhookHandler;
  let findUnique: jest.Mock;

  beforeEach(() => {
    emit = jest.fn().mockResolvedValue([]);
    findUnique = jest.fn().mockResolvedValue({
      id: 'svc1',
      branch: 'main',
      deployTrigger: 'PUSH',
    });
    const prisma = {
      service: { findUnique },
    } as unknown as PrismaService;
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

  it('push on the auto-deploy branch → emits auto-deploy with the branch name', async () => {
    const res = await handler.handleIncoming(endpoint(), {
      ref: 'refs/heads/main',
      repository: { full_name: 'org/app' },
    });
    expect(res.status).toBe('ok');
    expect(emit).toHaveBeenCalledWith(
      DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
      expect.objectContaining({
        projectId: 'p1',
        branch: 'main',
        serviceId: 'svc1',
      }),
    );
  });

  it('push on a different branch than the target (autoBranch) → ignored', async () => {
    const res = await handler.handleIncoming(endpoint(), {
      ref: 'refs/heads/release/v2',
      repository: { full_name: 'org/app' },
    });
    expect(res.status).toBe('ignored');
    expect(emit).not.toHaveBeenCalled();
  });

  it('push with deployTrigger !== PUSH → ignored', async () => {
    findUnique.mockResolvedValue({
      id: 'svc1',
      branch: 'main',
      deployTrigger: 'PIPELINE_SUCCESS',
    });
    const res = await handler.handleIncoming(endpoint(), {
      ref: 'refs/heads/main',
      repository: { full_name: 'org/app' },
    });
    expect(res.status).toBe('ignored');
    expect(emit).not.toHaveBeenCalled();
  });

  it('push without a ref → ignored', async () => {
    const res = await handler.handleIncoming(endpoint(), { repository: {} });
    expect(res.status).toBe('ignored');
    expect(emit).not.toHaveBeenCalled();
  });

  it('workflow_run success → pipeline update + auto-deploy', async () => {
    findUnique.mockResolvedValue({
      id: 'svc1',
      branch: 'main',
      deployTrigger: 'PIPELINE_SUCCESS',
    });
    const res = await handler.handleIncoming(endpoint(), {
      workflow_run: { id: 42, conclusion: 'success', head_branch: 'main' },
    });
    expect(res.status).toBe('ok');
    const events = emit.mock.calls.map((c) => c[0]);
    expect(events).toContain(DEPLOYMENT_PIPELINE_UPDATED);
    expect(events).toContain(DEPLOYMENT_AUTO_DEPLOY_TRIGGER);
  });

  it('workflow_run success on a different branch → no auto-deploy', async () => {
    findUnique.mockResolvedValue({
      id: 'svc1',
      branch: 'main',
      deployTrigger: 'PIPELINE_SUCCESS',
    });
    const res = await handler.handleIncoming(endpoint(), {
      workflow_run: { id: 44, conclusion: 'success', head_branch: 'v2' },
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
