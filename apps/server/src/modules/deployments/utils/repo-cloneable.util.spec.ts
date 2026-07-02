import { BadRequestException, Logger } from '@nestjs/common';

const execFileMock = jest.fn(
  (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (e: Error | null, r: { stdout: string; stderr: string }) => void,
  ) =>
    cb(null, {
      stdout: 'abc123\trefs/heads/main\ndef456\trefs/heads/dev',
      stderr: '',
    }),
);
jest.mock('child_process', () => ({ execFile: execFileMock }));
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { checkRepoCloneable } from './repo-cloneable.util';
import type { SourceProvidersService } from '../../source-providers/source-providers.service';

describe('checkRepoCloneable', () => {
  const logger = new Logger('test');
  let providers: { forProject: jest.Mock; forService: jest.Mock };

  beforeEach(() => {
    execFileMock.mockClear();
    providers = {
      forProject: jest.fn().mockResolvedValue({
        resolveGitCredentials: jest.fn().mockResolvedValue({
          repoUrl: 'https://gitlab.example.com/g/r.git',
          token: 't',
        }),
      }),
      forService: jest.fn().mockResolvedValue({
        resolveGitCredentials: jest.fn().mockResolvedValue({
          repoUrl: 'https://gitlab.example.com/g/r.git',
          token: 't',
        }),
      }),
    };
  });

  it('passes when the repo is reachable and the branch exists', async () => {
    await expect(
      checkRepoCloneable(
        providers as unknown as SourceProvidersService,
        logger,
        'p1',
        's1',
        'main',
      ),
    ).resolves.toBeUndefined();
    expect(providers.forService).toHaveBeenCalledWith('s1');
  });

  it('falls back to forProject when no serviceId is given', async () => {
    await checkRepoCloneable(
      providers as unknown as SourceProvidersService,
      logger,
      'p1',
      undefined,
      'main',
    );
    expect(providers.forProject).toHaveBeenCalledWith('p1');
  });

  it('rejects with a distinct message when the repo is accessible but the branch does not exist', async () => {
    await expect(
      checkRepoCloneable(
        providers as unknown as SourceProvidersService,
        logger,
        'p1',
        's1',
        'feature/does-not-exist',
      ),
    ).rejects.toThrow(/branche.*n'existe pas/);
  });

  it('rejects with the generic message when the repo itself is unreachable', async () => {
    execFileMock.mockImplementationOnce((_f, _a, _o, cb) =>
      cb(null, { stdout: '', stderr: 'fatal: Authentication failed' }),
    );
    await expect(
      checkRepoCloneable(
        providers as unknown as SourceProvidersService,
        logger,
        'p1',
        's1',
        'main',
      ),
    ).rejects.toThrow(/Dépôt Git inaccessible/);
  });

  it('always rejects with a BadRequestException', async () => {
    execFileMock.mockImplementationOnce((_f, _a, _o, cb) =>
      cb(null, { stdout: '', stderr: 'fatal: repository not found' }),
    );
    await expect(
      checkRepoCloneable(
        providers as unknown as SourceProvidersService,
        logger,
        'p1',
        's1',
        'main',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
