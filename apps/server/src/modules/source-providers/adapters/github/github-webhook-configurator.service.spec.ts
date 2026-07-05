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

  const httpService = { get: httpGet, post: httpPost } as never;
  return {
    svc: new GithubWebhookConfiguratorService(httpService, fileService),
    httpPost,
    httpGet,
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

    it('returns existing hookId when webhook already exists for that URL', async () => {
      const { svc, httpPost } = makeSvc({ existingHookId: 789 });
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(789);
      expect(httpPost).not.toHaveBeenCalled();
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
});
