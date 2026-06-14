import { WebhookEventStatus, GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IWebhookHandler } from '../interfaces/webhook-handler.interface';
import {
  RetryableWebhookEvent,
  WebhooksService,
  WEBHOOK_RETRY_BACKOFF_MS,
} from '../webhooks.service';
import { WebhookRetryService } from './webhook-retry.service';

describe('WebhooksService.markFailed — exponential backoff', () => {
  function makeService(currentAttempts: number) {
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data }));
    const prisma = {
      webhookEvent: {
        findUnique: jest.fn().mockResolvedValue({ attempts: currentAttempts }),
        update,
      },
    } as unknown as PrismaService;
    return { service: new WebhooksService(prisma), update };
  }

  it('1st failure → FAILED, nextRetryAt ≈ now + 1 min', async () => {
    const { service, update } = makeService(0);
    const before = Date.now();
    await service.markFailed('e1', 'boom');
    const data = update.mock.calls[0][0].data;
    expect(data.status).toBe(WebhookEventStatus.FAILED);
    expect((data.nextRetryAt as Date).getTime() - before).toBeGreaterThanOrEqual(
      WEBHOOK_RETRY_BACKOFF_MS[1] - 1000,
    );
    expect((data.nextRetryAt as Date).getTime() - before).toBeLessThanOrEqual(
      WEBHOOK_RETRY_BACKOFF_MS[1] + 1000,
    );
  });

  it('4th failure → FAILED, nextRetryAt ≈ now + 2 h', async () => {
    const { service, update } = makeService(3);
    const before = Date.now();
    await service.markFailed('e1', 'boom');
    const data = update.mock.calls[0][0].data;
    expect(data.status).toBe(WebhookEventStatus.FAILED);
    expect((data.nextRetryAt as Date).getTime() - before).toBeGreaterThanOrEqual(
      WEBHOOK_RETRY_BACKOFF_MS[4] - 1000,
    );
  });

  it('5th failure → DEAD_LETTER, nextRetryAt null', async () => {
    const { service, update } = makeService(4);
    await service.markFailed('e1', 'boom');
    const data = update.mock.calls[0][0].data;
    expect(data.status).toBe(WebhookEventStatus.DEAD_LETTER);
    expect(data.nextRetryAt).toBeNull();
  });
});

describe('WebhookRetryService', () => {
  const endpoint = {
    id: 'ep-1',
    projectId: 'proj-1',
    serviceEnvId: null,
    provider: GitProviderType.GITLAB,
    isActive: true,
  };
  const event: RetryableWebhookEvent = {
    id: 'evt-1',
    provider: GitProviderType.GITLAB,
    attempts: 1,
    payload: { object_kind: 'push' },
    endpoint,
  };

  function makeHarness() {
    const handler: IWebhookHandler = {
      provider: GitProviderType.GITLAB,
      handleIncoming: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    const webhooks = {
      listDueRetries: jest.fn().mockResolvedValue([event]),
      claimForRetry: jest.fn().mockResolvedValue(true),
      markProcessed: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue({ status: WebhookEventStatus.FAILED, attempts: 2 }),
      findEventForRetry: jest.fn().mockResolvedValue(event),
      resetForReplay: jest.fn().mockResolvedValue(undefined),
    } as unknown as WebhooksService;
    const notifications = {
      notifyWebhookDeadLetter: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const service = new WebhookRetryService(webhooks, notifications, [handler]);
    return { service, webhooks, notifications, handler };
  }

  it('retries a due event and marks it processed on success', async () => {
    const { service, webhooks, handler } = makeHarness();
    await service.retryFailedWebhooks();
    expect(handler.handleIncoming).toHaveBeenCalledTimes(1);
    expect(webhooks.markProcessed).toHaveBeenCalledWith('evt-1');
  });

  it('idempotence — does not dispatch when the claim is lost to another worker', async () => {
    const { service, webhooks, handler } = makeHarness();
    (webhooks.claimForRetry as jest.Mock).mockResolvedValue(false);
    await service.retryFailedWebhooks();
    expect(handler.handleIncoming).not.toHaveBeenCalled();
    expect(webhooks.markProcessed).not.toHaveBeenCalled();
  });

  it('on dispatch failure → markFailed, no dead-letter notification yet', async () => {
    const { service, webhooks, notifications, handler } = makeHarness();
    (handler.handleIncoming as jest.Mock).mockRejectedValue(new Error('still failing'));
    await service.retryFailedWebhooks();
    expect(webhooks.markFailed).toHaveBeenCalledWith('evt-1', 'still failing');
    expect(notifications.notifyWebhookDeadLetter).not.toHaveBeenCalled();
  });

  it('notifies the admin when a failure dead-letters the event', async () => {
    const { service, webhooks, notifications, handler } = makeHarness();
    (handler.handleIncoming as jest.Mock).mockRejectedValue(new Error('exhausted'));
    (webhooks.markFailed as jest.Mock).mockResolvedValue({
      status: WebhookEventStatus.DEAD_LETTER,
      attempts: 5,
    });
    await service.retryFailedWebhooks();
    expect(notifications.notifyWebhookDeadLetter).toHaveBeenCalledTimes(1);
  });

  it('replayEvent resets and re-dispatches immediately', async () => {
    const { service, webhooks, handler } = makeHarness();
    const res = await service.replayEvent('evt-1');
    expect(webhooks.resetForReplay).toHaveBeenCalledWith('evt-1');
    expect(handler.handleIncoming).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(WebhookEventStatus.PROCESSED);
  });
});
