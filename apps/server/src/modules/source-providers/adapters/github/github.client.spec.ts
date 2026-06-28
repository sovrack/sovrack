import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { GithubClient } from './github.client';

const rawRepo = (id: number) => ({
  id,
  name: `repo${id}`,
  full_name: `org/repo${id}`,
  clone_url: `https://github.com/org/repo${id}.git`,
  default_branch: 'main',
  description: null,
});

describe('GithubClient', () => {
  let http: { get: jest.Mock };
  let client: GithubClient;

  beforeEach(() => {
    http = { get: jest.fn() };
    client = new GithubClient(http as unknown as HttpService);
  });

  it('listRepos maps raw repos + sends a Bearer token', async () => {
    http.get.mockReturnValue(of({ data: [rawRepo(1)] }));
    const repos = await client.listRepos('https://api.github.com', 'tok');
    expect(repos[0]).toMatchObject({
      id: 1,
      name: 'repo1',
      fullName: 'org/repo1',
      defaultBranch: 'main',
    });
    expect(http.get.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('paginates until a short page (<100) is returned', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => rawRepo(i + 1));
    http.get
      .mockReturnValueOnce(of({ data: fullPage }))
      .mockReturnValueOnce(of({ data: [rawRepo(101)] }));
    const repos = await client.listRepos('https://api.github.com', 'tok');
    expect(repos).toHaveLength(101);
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls[1][1].params.page).toBe(2);
  });

  it('stops immediately on an empty first page', async () => {
    http.get.mockReturnValue(of({ data: [] }));
    expect(await client.listRepos('https://api.github.com', 'tok')).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(1);
  });
});
