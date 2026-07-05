import { NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { of, throwError } from 'rxjs';
import { RepositoryFileFetcherService } from './repository-file-fetcher.service';

function makeSvc(httpGetResponses: jest.Mock) {
  const httpService = { get: httpGetResponses } as never;
  return new RepositoryFileFetcherService(httpService);
}

describe('RepositoryFileFetcherService', () => {
  describe('listGitLabRepositoryFiles', () => {
    it('returns file paths from a single page response', async () => {
      const httpGet = jest.fn().mockReturnValue(
        of({
          data: [
            { path: 'package.json', name: 'package.json' },
            { path: 'src/index.ts', name: 'index.ts' },
          ],
          headers: { 'x-next-page': '' },
        }),
      );
      const svc = makeSvc(httpGet);
      const result = await svc.listGitLabRepositoryFiles(
        'https://gitlab.com',
        '42',
        'token',
      );
      expect(result).toContain('package.json');
      expect(result).toContain('src/index.ts');
    });

    it('paginates when x-next-page header is set', async () => {
      const httpGet = jest
        .fn()
        .mockReturnValueOnce(
          of({
            data: [{ path: 'a.ts', name: 'a.ts' }],
            headers: { 'x-next-page': '2' },
          }),
        )
        .mockReturnValueOnce(
          of({
            data: [{ path: 'b.ts', name: 'b.ts' }],
            headers: { 'x-next-page': '' },
          }),
        );
      const svc = makeSvc(httpGet);
      const result = await svc.listGitLabRepositoryFiles(
        'https://gitlab.com',
        '42',
        'token',
      );
      expect(result).toContain('a.ts');
      expect(result).toContain('b.ts');
      expect(httpGet).toHaveBeenCalledTimes(2);
    });

    it('stops when an empty page is returned', async () => {
      const httpGet = jest
        .fn()
        .mockReturnValueOnce(of({ data: [], headers: {} }));
      const svc = makeSvc(httpGet);
      const result = await svc.listGitLabRepositoryFiles(
        'https://gitlab.com',
        '99',
        'token',
      );
      expect(result).toEqual([]);
      expect(httpGet).toHaveBeenCalledTimes(1);
    });

    it('deduplicates paths across pages', async () => {
      const httpGet = jest
        .fn()
        .mockReturnValueOnce(
          of({ data: [{ path: 'dup.ts' }], headers: { 'x-next-page': '2' } }),
        )
        .mockReturnValueOnce(
          of({ data: [{ path: 'dup.ts' }], headers: { 'x-next-page': '' } }),
        );
      const svc = makeSvc(httpGet);
      const result = await svc.listGitLabRepositoryFiles(
        'https://gl.io',
        '1',
        'tok',
      );
      expect(result.filter((p) => p === 'dup.ts')).toHaveLength(1);
    });

    it('uses item.name as fallback when path is absent', async () => {
      const httpGet = jest
        .fn()
        .mockReturnValue(of({ data: [{ name: 'fallback.txt' }], headers: {} }));
      const svc = makeSvc(httpGet);
      const result = await svc.listGitLabRepositoryFiles(
        'https://gl.io',
        '1',
        'tok',
      );
      expect(result).toContain('fallback.txt');
    });
  });

  describe('listGitHubRepositoryFiles', () => {
    it('throws NotFoundException when repoFullName is null', async () => {
      const svc = makeSvc(jest.fn());
      await expect(
        svc.listGitHubRepositoryFiles(
          'https://api.github.com',
          null,
          'tok',
          'main',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns only blob paths from the tree response', async () => {
      const httpGet = jest
        .fn()
        .mockReturnValueOnce(of({ data: { sha: 'abc123' } }))
        .mockReturnValueOnce(
          of({
            data: {
              tree: [
                { type: 'blob', path: 'src/app.ts' },
                { type: 'tree', path: 'src' },
                { type: 'blob', path: 'package.json' },
              ],
              truncated: false,
            },
          }),
        );
      const svc = makeSvc(httpGet);
      const result = await svc.listGitHubRepositoryFiles(
        'https://api.github.com',
        'user/repo',
        'tok',
        'main',
      );
      expect(result).toEqual(['src/app.ts', 'package.json']);
    });

    it('resolves commit sha before fetching tree', async () => {
      const httpGet = jest
        .fn()
        .mockReturnValueOnce(of({ data: { sha: 'def456' } }))
        .mockReturnValueOnce(of({ data: { tree: [], truncated: false } }));
      const svc = makeSvc(httpGet);
      await svc.listGitHubRepositoryFiles(
        'https://api.github.com',
        'org/repo',
        'tok',
        'release',
      );
      const treeUrl = (httpGet as jest.Mock).mock.calls[1][0] as string;
      expect(treeUrl).toContain('def456');
    });
  });

  describe('fetchRawFile', () => {
    describe('GitHub', () => {
      it('decodes base64 content and returns UTF-8 string', async () => {
        const content = Buffer.from('console.log("hello")\n').toString(
          'base64',
        );
        const httpGet = jest
          .fn()
          .mockReturnValue(of({ data: { content, encoding: 'base64' } }));
        const svc = makeSvc(httpGet);
        const result = await svc.fetchRawFile(
          'https://api.github.com',
          GitProviderType.GITHUB,
          'user/repo',
          'tok',
          'src/main.ts',
          'main',
        );
        expect(result).toContain('console.log');
      });

      it('returns content directly when encoding is not base64', async () => {
        const httpGet = jest
          .fn()
          .mockReturnValue(
            of({ data: { content: 'plain text', encoding: 'utf-8' } }),
          );
        const svc = makeSvc(httpGet);
        const result = await svc.fetchRawFile(
          'https://api.github.com',
          GitProviderType.GITHUB,
          'user/repo',
          'tok',
          'README.md',
          'main',
        );
        expect(result).toBe('plain text');
      });

      it('returns null when repoId is empty', async () => {
        const svc = makeSvc(jest.fn());
        const result = await svc.fetchRawFile(
          'https://api.github.com',
          GitProviderType.GITHUB,
          '',
          'tok',
          'file.ts',
          'main',
        );
        expect(result).toBeNull();
      });

      it('returns null when content is absent in response', async () => {
        const httpGet = jest
          .fn()
          .mockReturnValue(of({ data: { encoding: 'base64' } }));
        const svc = makeSvc(httpGet);
        const result = await svc.fetchRawFile(
          'https://api.github.com',
          GitProviderType.GITHUB,
          'user/repo',
          'tok',
          'file.ts',
          'main',
        );
        expect(result).toBeNull();
      });
    });

    describe('GitLab', () => {
      it('returns raw file content string', async () => {
        const httpGet = jest
          .fn()
          .mockReturnValue(of({ data: 'const x = 1;\n' }));
        const svc = makeSvc(httpGet);
        const result = await svc.fetchRawFile(
          'https://gitlab.com',
          GitProviderType.GITLAB,
          '42',
          'tok',
          'src/app.ts',
          'main',
        );
        expect(result).toBe('const x = 1;\n');
      });

      it('returns null when response data is not a string', async () => {
        const httpGet = jest
          .fn()
          .mockReturnValue(of({ data: { unexpected: true } }));
        const svc = makeSvc(httpGet);
        const result = await svc.fetchRawFile(
          'https://gitlab.com',
          GitProviderType.GITLAB,
          '42',
          'tok',
          'file.ts',
          'main',
        );
        expect(result).toBeNull();
      });
    });

    describe('error handling', () => {
      it('returns null on 404 error (file not found)', async () => {
        const httpGet = jest
          .fn()
          .mockReturnValue(throwError(() => ({ response: { status: 404 } })));
        const svc = makeSvc(httpGet);
        const result = await svc.fetchRawFile(
          'https://gitlab.com',
          GitProviderType.GITLAB,
          '42',
          'tok',
          'missing.ts',
          'main',
        );
        expect(result).toBeNull();
      });

      it('returns null on network error', async () => {
        const httpGet = jest
          .fn()
          .mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
        const svc = makeSvc(httpGet);
        const result = await svc.fetchRawFile(
          'https://gitlab.com',
          GitProviderType.GITLAB,
          '42',
          'tok',
          'file.ts',
          'main',
        );
        expect(result).toBeNull();
      });
    });
  });
});
