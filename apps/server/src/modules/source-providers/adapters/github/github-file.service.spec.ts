import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitProviderConfigService } from '../../shared/connection/git-provider-config.service';
import { GithubClient } from './github.client';
import { GithubFileService } from './github-file.service';

describe('GithubFileService — error mapping helpers', () => {
  let service: GithubFileService;
  const priv = <T>(name: string, ...args: unknown[]): T =>
    (service as unknown as Record<string, (...a: unknown[]) => T>)[name](
      ...args,
    );

  beforeEach(() => {
    service = new GithubFileService(
      {} as unknown as PrismaService,
      {} as unknown as HttpService,
      {} as unknown as GithubClient,
      {} as unknown as GitProviderConfigService,
    );
  });

  it('extractStatus reads a nested axios response.status', () => {
    expect(
      priv<number | null>('extractStatus', { response: { status: 404 } }),
    ).toBe(404);
    expect(priv<number | null>('extractStatus', new Error('x'))).toBeNull();
    expect(priv<number | null>('extractStatus', null)).toBeNull();
  });

  it('builds GitHub auth headers', () => {
    const h = priv<Record<string, string>>('headers', 'pat123');
    expect(h.Authorization).toBe('Bearer pat123');
    expect(h.Accept).toContain('github');
    expect(h['X-GitHub-Api-Version']).toBeTruthy();
  });

  it('throwMapped maps HTTP status to the right exception', () => {
    const cases: Array<[number, unknown]> = [
      [401, UnauthorizedException],
      [403, ForbiddenException],
      [404, NotFoundException],
      [409, BadRequestException],
      [500, BadRequestException],
    ];
    for (const [status, type] of cases) {
      expect(() =>
        priv('throwMapped', 'op', { response: { status } }, 'fallback'),
      ).toThrow(type as never);
    }
  });
});
