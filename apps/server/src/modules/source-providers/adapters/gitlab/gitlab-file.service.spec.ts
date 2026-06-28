import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitlabFileService } from './gitlab-file.service';

describe('GitlabFileService.readFile', () => {
  let http: { get: jest.Mock };
  let svc: GitlabFileService;

  beforeEach(() => {
    http = { get: jest.fn() };
    svc = new GitlabFileService(
      {} as unknown as PrismaService,
      http as unknown as HttpService,
      {} as unknown as CryptoService,
    );
    jest
      .spyOn(
        svc as unknown as { resolveRepositoryContext: jest.Mock },
        'resolveRepositoryContext',
      )
      .mockResolvedValue({
        baseUrl: 'https://gitlab.com',
        gitlabProjectId: 42,
        token: 'tok',
      });
  });

  it('decodes a base64 file + sends PRIVATE-TOKEN and ref', async () => {
    http.get.mockReturnValue(
      of({
        data: {
          content: Buffer.from('hello world').toString('base64'),
          encoding: 'base64',
        },
      }),
    );
    const content = await svc.readFile('p1', 'Dockerfile', 'main');
    expect(content).toBe('hello world');
    const [url, opts] = http.get.mock.calls[0];
    expect(url).toContain('/api/v4/projects/42/repository/files/Dockerfile');
    expect(opts.headers['PRIVATE-TOKEN']).toBe('tok');
    expect(opts.params.ref).toBe('main');
  });

  it('returns plain content as-is when not base64', async () => {
    http.get.mockReturnValue(
      of({ data: { content: 'plain', encoding: 'text' } }),
    );
    expect(await svc.readFile('p1', 'f')).toBe('plain');
  });

  it('returns null on a 404 (file absent)', async () => {
    http.get.mockReturnValue(throwError(() => ({ response: { status: 404 } })));
    expect(await svc.readFile('p1', 'missing')).toBeNull();
  });
});
