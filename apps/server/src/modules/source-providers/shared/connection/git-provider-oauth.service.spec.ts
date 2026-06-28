import { NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitProviderOauthService } from './git-provider-oauth.service';

describe('GitProviderOauthService — helpers', () => {
  let prisma: {
    gitProviderConfig: { findUnique: jest.Mock; findFirst: jest.Mock };
  };
  let service: GitProviderOauthService;

  const priv = <T>(name: string, ...args: unknown[]): T =>
    (service as unknown as Record<string, (...a: unknown[]) => T>)[name](
      ...args,
    );

  beforeEach(() => {
    prisma = {
      gitProviderConfig: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const config = {
      get: jest.fn(
        (_k: string, def?: string) => def ?? 'http://localhost:3000',
      ),
    };
    service = new GitProviderOauthService(
      prisma as unknown as PrismaService,
      {} as unknown as HttpService,
      {} as unknown as CryptoService,
      config as unknown as ConfigService,
    );
  });

  it('builds a frontend redirect with oauth status + params', () => {
    const url = priv<string>(
      'buildFrontendSettingsRedirect',
      'success',
      'done',
      'p1',
    );
    expect(url).toContain('/settings/git');
    expect(url).toContain('oauth=success');
    expect(url).toContain('provider_id=p1');
    expect(url).toContain('oauth_message=done');
  });

  it('omits optional params when not provided', () => {
    const url = priv<string>('buildFrontendSettingsRedirect', 'error');
    expect(url).toContain('oauth=error');
    expect(url).not.toContain('provider_id=');
    expect(url).not.toContain('oauth_message=');
  });

  it('normalizes a base URL by trimming trailing slashes', () => {
    expect(
      priv<string>('normalizeGitlabBaseUrl', 'https://gl.example.com///'),
    ).toBe('https://gl.example.com');
  });

  it('normalizeOptional trims and nulls empties', () => {
    expect(priv<string | null>('normalizeOptional', '  x  ')).toBe('x');
    expect(priv<string | null>('normalizeOptional', '   ')).toBeNull();
    expect(priv<string | null>('normalizeOptional', null)).toBeNull();
  });

  it('prefers the isDefault GitLab provider, else the oldest', async () => {
    prisma.gitProviderConfig.findFirst.mockResolvedValueOnce({ id: 'def' });
    const res = await priv<Promise<{ id: string } | null>>(
      'getDefaultGitlabProvider',
    );
    expect(res?.id).toBe('def');
  });

  it('falls back to the oldest provider when none is default', async () => {
    prisma.gitProviderConfig.findFirst
      .mockResolvedValueOnce(null) // no default
      .mockResolvedValueOnce({ id: 'oldest' });
    const res = await priv<Promise<{ id: string } | null>>(
      'getDefaultGitlabProvider',
    );
    expect(res?.id).toBe('oldest');
  });

  it('404s getGitlabProviderOrFail for a missing or wrong-type provider', async () => {
    prisma.gitProviderConfig.findUnique.mockResolvedValue({
      id: 'g1',
      type: GitProviderType.GITHUB,
    });
    await expect(
      priv<Promise<unknown>>('getGitlabProviderOrFail', 'g1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
