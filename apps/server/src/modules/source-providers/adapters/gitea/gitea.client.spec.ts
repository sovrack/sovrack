import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { GiteaClient } from './gitea.client';

describe('GiteaClient', () => {
  let http: { get: jest.Mock; post: jest.Mock };
  let client: GiteaClient;

  beforeEach(() => {
    http = { get: jest.fn(), post: jest.fn() };
    client = new GiteaClient(http as unknown as HttpService);
  });

  it('listRepos uses the "token <pat>" auth scheme', async () => {
    http.get.mockReturnValue(
      of({ data: [{ id: 1, name: 'r', full_name: 'o/r' }] }),
    );
    const res = await client.listRepos('https://gitea.io/api/v1', 'pat');
    expect(res).toHaveLength(1);
    expect(http.get.mock.calls[0][1].headers.Authorization).toBe('token pat');
  });

  it('listBranches flags the default branch', async () => {
    http.get.mockReturnValue(
      of({
        data: [
          { name: 'main', commit: { id: 'sha1' } },
          { name: 'dev', commit: { id: 'sha2' } },
        ],
      }),
    );
    const branches = await client.listBranches(
      'https://gitea.io/api/v1',
      'pat',
      'o/r',
      'main',
    );
    expect(branches).toEqual([
      { name: 'main', isDefault: true, commitSha: 'sha1' },
      { name: 'dev', isDefault: false, commitSha: 'sha2' },
    ]);
  });

  it('listActionRuns returns [] when Gitea Actions are disabled (request fails)', async () => {
    http.get.mockReturnValue(throwError(() => new Error('404 Not Found')));
    expect(
      await client.listActionRuns('https://gitea.io/api/v1', 'pat', 'o/r'),
    ).toEqual([]);
  });
});
