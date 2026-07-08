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
  return { response: { status, data: { message } } };
}

function makeSvc(
  opts: {
    maxRetries?: string;
    retryDelayMs?: string;
    // Hooks returned by the GET listHooks call (default: none).
    existingHooks?: Array<{ id: number; url: string }>;
    resolveCtxError?: unknown;
  } = {},
) {
  const context = makeContext();

  const fileService = {
    resolveRepositoryContext: jest.fn().mockResolvedValue(context),
    extractHttpStatus: jest.fn((err: unknown) => {
      return (
        (err as { response?: { status?: number } })?.response?.status ?? null
      );
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
    // listHooks (GET) — returns existing hooks (default: empty → proceed to POST).
    get: jest.fn().mockReturnValue(of({ data: opts.existingHooks ?? [] })),
    // createHook (POST) — default success with a fresh id.
    post: jest.fn().mockReturnValue(of({ data: { id: 123 } })),
  } as unknown as HttpService;

  const svc = new GitlabWebhookConfiguratorService(
    httpService,
    configService,
    fileService,
  );
  return { svc, httpService, fileService, configService };
}

describe('GitlabWebhookConfiguratorService', () => {
  describe('configureWebhook (create path)', () => {
    it('creates a webhook and returns hookId + url when none exists', async () => {
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

  // The core anti-duplication guarantee: if a hook with the same URL already
  // exists, reuse it — NEVER POST a second one (fixes the 8-duplicate-hooks bug
  // where every "Re-register" click created a new GitLab hook).
  describe('configureWebhook (idempotence)', () => {
    it('reuses an existing hook with the same URL and does NOT POST', async () => {
      const { svc, httpService } = makeSvc({
        existingHooks: [
          { id: 555, url: 'https://platform.io/hook', token: 'secret' },
        ],
      });
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(555);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('creates a new hook when existing hooks point at DIFFERENT URLs', async () => {
      const { svc, httpService } = makeSvc({
        existingHooks: [{ id: 1, url: 'https://other.example/hook' }],
      });
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(123);
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('falls through to create if listing hooks fails (best-effort)', async () => {
      const { svc, httpService } = makeSvc();
      (httpService.get as jest.Mock).mockReturnValue(
        throwError(() => makeHttpError(500)),
      );
      const result = await svc.configureWebhook(
        'proj1',
        'https://platform.io/hook',
        'secret',
      );
      expect(result.hookId).toBe(123);
    });
  });

  describe('configureWebhook (non-retryable error)', () => {
    it('propagates non-retryable errors after exhausting retries', async () => {
      const { svc, httpService } = makeSvc({
        maxRetries: '1',
        retryDelayMs: '1',
      });
      (httpService.post as jest.Mock).mockReturnValue(
        throwError(() => makeHttpError(400, 'bad request')),
      );
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
