import { Role } from '@prisma/client';
import { GitlabCiService } from './gitlab-ci.service';

type Pipe = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
};
const pipe = (id: number): Pipe => ({
  id,
  status: 'success',
  ref: 'main',
  sha: 's',
  web_url: `u/${id}`,
});

function build(overrides: {
  services?: { repoPath: string | null }[];
  perRepo?: Record<string, Pipe[] | Error>;
  persisted?: {
    externalId: number;
    status: string;
    branch: string | null;
    commitSha: string | null;
    webUrl: string | null;
  }[];
}) {
  const prisma = {
    service: {
      findMany: jest.fn().mockResolvedValue(overrides.services ?? []),
    },
    pipelineRun: {
      findMany: jest.fn().mockResolvedValue(overrides.persisted ?? []),
    },
  };
  const apiService = {
    getPipelines: jest.fn((_c: unknown, repoPath: string) => {
      const v = overrides.perRepo?.[repoPath];
      if (v instanceof Error) return Promise.reject(v);
      return Promise.resolve(v ?? []);
    }),
  };
  const pipelinePersistence = {
    upsertPipeline: jest.fn().mockResolvedValue(undefined),
  };
  const projectConfig = {
    getProjectConfig: jest.fn().mockResolvedValue({}),
    normalizeUrl: (u: string) => u,
  };
  const auth = {
    assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new GitlabCiService(
    prisma as never,
    apiService as never,
    pipelinePersistence as never,
    projectConfig as never,
    auth as never,
  );
  return { svc, prisma, apiService };
}

describe('GitlabCiService.getPipelines (agrégation projet)', () => {
  it('aggregates pipelines from all services and deduplicates by id', async () => {
    const { svc } = build({
      services: [{ repoPath: 'grp/a' }, { repoPath: 'grp/b' }],
      perRepo: { 'grp/a': [pipe(1), pipe(2)], 'grp/b': [pipe(2), pipe(3)] },
    });
    const out = await svc.getPipelines('p1', 'u1', Role.ADMIN);
    expect(out.map((p) => p.id)).toEqual([3, 2, 1]); // dédupliqué + trié desc
  });

  it('ignores a failing repository (best-effort, no global 404)', async () => {
    const { svc } = build({
      services: [{ repoPath: 'grp/a' }, { repoPath: 'grp/bad' }],
      perRepo: { 'grp/a': [pipe(5)], 'grp/bad': new Error('404') },
    });
    const out = await svc.getPipelines('p1', 'u1', Role.ADMIN);
    expect(out.map((p) => p.id)).toEqual([5]);
  });

  it('falls back to persisted history when no services', async () => {
    const { svc, apiService } = build({
      services: [],
      persisted: [
        {
          externalId: 9,
          status: 'SUCCESS',
          branch: 'main',
          commitSha: 'x',
          webUrl: 'w',
        },
      ],
    });
    const out = await svc.getPipelines('p1', 'u1', Role.ADMIN);
    expect(apiService.getPipelines).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 9, status: 'success' });
  });

  it('falls back to persisted history when all repositories fail', async () => {
    const { svc } = build({
      services: [{ repoPath: 'grp/a' }],
      perRepo: { 'grp/a': new Error('boom') },
      persisted: [
        {
          externalId: 7,
          status: 'FAILED',
          branch: 'dev',
          commitSha: null,
          webUrl: null,
        },
      ],
    });
    const out = await svc.getPipelines('p1', 'u1', Role.ADMIN);
    expect(out.map((p) => p.id)).toEqual([7]);
  });
});
