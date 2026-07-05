import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { GitlabFileService } from './gitlab-file.service';
import { GitlabWebhookConfiguratorService } from './gitlab-webhook-configurator.service';

function makeContext(overrides = {}) {
  return {
    baseUrl: 'https://gitlab.com',
    token: 'test-token',
    gitlabProjectId: '42',
    branch: 'main',
    sourceType: 'GIT_PROVIDER',
    repositoryPath: 'group/repo',
    ...overrides,
  };
}

function makeHttpError(status: number, message = 'error') {
  return {
    response: {
      status,
      data: { message },
    },
  };
}

function makeSvc(
  opts: {
    maxRetries?: string;
    retryDelayMs?: string;
    httpResponse?: unknown;
    httpError?: unknown;
    resolveCtxError?: unknown;
  } = {},
) {
  const context = makeContext();

  const fileService = {
    resolveRepositoryContext: jest.fn().mockResolvedValue(context),
    extractHttpStatus: jest.fn((err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      return status ?? null;
    }),
    extractGitlabErrorMessage: jest.fn((err: unknown) => {
      return (
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? ''
      );
    }),
    throwGitlabMappedError: jest
      .fn()
      .mockImplementation((_ctx: unknown, err: unknown) => {
        throw err;
      }),
  } as unknown as GitlabFileService;

  if (opts.resolveCtxError) {
    (fileService.resolveRepositoryContext as jest.Mock).mockRejectedValue(
      opts.resolveCtxError,
    );
  }

  const configService = {
    get: jest.fn().mockImplementation((key: string, defaultVal: string) => {
      if (key === 'GITLAB_WEBHOOK_MAX_RETRIES')
        return opts.maxRetries ?? defaultVal;
      if (key === 'GITLAB_WEBHOOK_RETRY_DELAY_MS')
        return opts.retryDelayMs ?? defaultVal;
      return defaultVal;
    }),
  } as unknown as ConfigService;

  const httpService = {
    post: jest.fn(),
  } as unknown as HttpService;

  if (opts.httpError) {
    (httpService.post as jest.Mock).mockReturnValue(
      throwError(() => opts.httpError),
    );
  } else {
    (httpService.post as jest.Mock).mockReturnValue(of({ data: { id: 123 } }));
  }

  const svc = new GitlabWebhookConfiguratorService(
    httpService,
    configService,
    fileService,
  );
  return { svc, httpService, fileService, configService };
}

describe('GitlabWebhookConfiguratorService', () => {
  describe('configureWebhook (success paths)', () => {
    it('creates a webhook and returns hookId + url', async () => {
      const { svc } = makeSvc();
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(123);
      expect(result.url).toBe('https://platform.io/hook');
    });

    it('calls the correct GitLab hooks endpoint', async () => {
      const { svc, httpService } = makeSvc();
      await svc.configureWebhook('proj1', 'https://platform.io/hook', 'secret');
      const postArg = (httpService.post as jest.Mock).mock
        .calls[0][0] as string;
      expect(postArg).toContain('/api/v4/projects/');
      expect(postArg).toContain('/hooks');
    });

    it('passes push_events and pipeline_events in the body', async () => {
      const { svc, httpService } = makeSvc();
      await svc.configureWebhook('proj1', 'https://platform.io/hook', 'secret');
      const body = (httpService.post as jest.Mock).mock.calls[0][1] as {
        push_events: boolean;
        pipeline_events: boolean;
      };
      expect(body.push_events).toBe(true);
      expect(body.pipeline_events).toBe(true);
    });
  });

  describe('configureWebhook (duplicate detection)', () => {
    it('returns hookId="existing" on HTTP 409', async () => {
      const { svc } = makeSvc({ httpError: makeHttpError(409) });
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe('existing');
    });

    it('returns hookId="existing" on "has already been taken" message', async () => {
      const { svc } = makeSvc({
        httpError: makeHttpError(422, 'URL has already been taken'),
      });
      const result = await svc.configureWebhook(
        'proj1',
        'https://hook.io',
        'sec',
      );
      expect(result.hookId).toBe('existing');
    });
  });

  describe('configureWebhook (non-retryable error)', () => {
    it('propagates non-retryable errors after exhausting retries', async () => {
      const { svc } = makeSvc({
        maxRetries: '1',
        retryDelayMs: '1',
        httpError: makeHttpError(400, 'bad request'),
      });
      await expect(
        svc.configureWebhook('proj1', 'https://platform.io/hook', 'secret'),
      ).rejects.toBeDefined();
    });
  });

  describe('configureWebhook (retryable errors)', () => {
    it('retries on 503 and succeeds on second attempt', async () => {
      const { svc, httpService } = makeSvc({
        maxRetries: '3',
        retryDelayMs: '0',
      });
      (httpService.post as jest.Mock)
        .mockReturnValueOnce(throwError(() => makeHttpError(503)))
        .mockReturnValue(of({ data: { id: 99 } }));
      const result = await svc.configureWebhook(
        'proj1',
        'https://hook.io',
        'sec',
      );
      expect(result.hookId).toBe(99);
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it('retries on ECONNRESET and succeeds', async () => {
      const { svc, httpService } = makeSvc({
        maxRetries: '2',
        retryDelayMs: '0',
      });
      (httpService.post as jest.Mock)
        .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))
        .mockReturnValue(of({ data: { id: 77 } }));
      const result = await svc.configureWebhook(
        'proj1',
        'https://hook.io',
        'sec',
      );
      expect(result.hookId).toBe(77);
    });
  });
});
