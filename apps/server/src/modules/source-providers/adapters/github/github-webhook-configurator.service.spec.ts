import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { GithubWebhookConfiguratorService } from './github-webhook-configurator.service';

function makeSvc(
  opts: {
    credentials?: { token: string; apiBase: string; fullRepoName: string };
    existingHookId?: number | null;
    createError?: Error;
    listError?: boolean;
  } = {},
) {
  const credentials = opts.credentials ?? {
    token: 'gh-token',
    apiBase: 'https://api.github.com',
    fullRepoName: 'org/repo',
  };

  const fileService = {
    resolveCredentials: jest.fn().mockResolvedValue(credentials),
  } as never;

  const httpGet = jest.fn();
  const httpPost = jest.fn();
  const httpPatch = jest.fn().mockReturnValue(of({}));

  if (opts.listError) {
    httpGet.mockReturnValue(throwError(() => new Error('network')));
  } else if (
    opts.existingHookId !== undefined &&
    opts.existingHookId !== null
  ) {
    httpGet.mockReturnValue(
      of({
        data: [
          {
            id: opts.existingHookId,
            config: { url: 'https://platform.io/hook' },
          },
        ],
      }),
    );
  } else {
    httpGet.mockReturnValue(of({ data: [] }));
  }

  if (opts.createError) {
    httpPost.mockReturnValue(throwError(() => opts.createError));
  } else {
    httpPost.mockReturnValue(of({ data: { id: 456 } }));
  }

  const httpService = {
    get: httpGet,
    post: httpPost,
    patch: httpPatch,
  } as never;

  return {
    svc: new GithubWebhookConfiguratorService(httpService, fileService),
    httpPost,
    httpGet,
    httpPatch,
  };
}

describe('GithubWebhookConfiguratorService', () => {
  describe('configureWebhook', () => {
    it('creates a new webhook when none exists and returns hookId', async () => {
      const { svc } = makeSvc();
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(456);
      expect(result.url).toBe('https://platform.io/hook');
    });

    it('sends push and workflow_run events in creation payload', async () => {
      const { svc, httpPost } = makeSvc();
      await svc.configureWebhook('proj1', 'https://platform.io/hook', 'secret');
      const body = httpPost.mock.calls[0][1] as {
        events: string[];
        config: { url: string; secret: string };
      };
      expect(body.events).toContain('push');
      expect(body.events).toContain('workflow_run');
      expect(body.config.url).toBe('https://platform.io/hook');
      expect(body.config.secret).toBe('secret');
    });

    it('returns existing hookId and syncs secret via PATCH when webhook already exists', async () => {
      const { svc, httpPost, httpPatch } = makeSvc({ existingHookId: 789 });
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(789);
      expect(httpPost).not.toHaveBeenCalled();
      // GitHub's API masks the returned secret → always issues PATCH to sync
      expect(httpPatch).toHaveBeenCalledWith(
        expect.stringContaining('/hooks/789'),
        { config: { secret: 'secret' } },
        expect.any(Object),
      );
    });

    it('skips existing check gracefully when list call fails (network error)', async () => {
      const { svc } = makeSvc({ listError: true });
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(456);
    });

    it('propagates error when webhook creation fails', async () => {
      const { svc } = makeSvc({ createError: new Error('GitHub API down') });
      await expect(
        svc.configureWebhook('proj1', 'https://platform.io/hook', 'secret'),
      ).rejects.toThrow('GitHub API down');
    });

    it('uses correct hooks endpoint for the repository', async () => {
      const { svc, httpGet } = makeSvc();
      await svc.configureWebhook('proj1', 'https://platform.io/hook', 'secret');
      const listUrl = httpGet.mock.calls[0][0] as string;
      expect(listUrl).toContain('/repos/org/repo/hooks');
    });
  });

  describe('configureWebhook (retry)', () => {
    it('retries on 503 and succeeds on second attempt', async () => {
      const { svc, httpPost } = makeSvc();
      httpPost
        .mockReset()
        .mockReturnValueOnce(
          throwError(
            () =>
              new AxiosError(
                'Service Unavailable',
                undefined,
                undefined,
                undefined,
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: {},
                  data: {},
                  config: {} as never,
                } as never,
              ),
          ),
        )
        .mockReturnValue(of({ data: { id: 99 } }));
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(99);
      expect(httpPost).toHaveBeenCalledTimes(2);
    });

    it('retries on ECONNRESET and succeeds', async () => {
      const { svc, httpPost } = makeSvc();
      httpPost
        .mockReset()
        .mockReturnValueOnce(
          throwError(
            () =>
              new AxiosError(
                'read ECONNRESET',
                'ECONNRESET',
                undefined,
                undefined,
                undefined,
              ),
          ),
        )
        .mockReturnValue(of({ data: { id: 77 } }));
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(77);
      expect(httpPost).toHaveBeenCalledTimes(2);
    });

    it('propagates non-retryable error (400) without retry', async () => {
      const { svc, httpPost } = makeSvc();
      httpPost.mockReset().mockReturnValue(
        throwError(
          () =>
            new AxiosError('Bad Request', undefined, undefined, undefined, {
              status: 400,
              statusText: 'Bad Request',
              headers: {},
              data: {},
              config: {} as never,
            } as never),
        ),
      );
      await expect(
        svc.configureWebhook('proj1', 'https://platform.io/hook', 'secret'),
      ).rejects.toThrow();
      expect(httpPost).toHaveBeenCalledTimes(1);
    });
  });
});
