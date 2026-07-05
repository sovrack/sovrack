import { Role } from '@prisma/client';
import { GitlabController } from './gitlab.controller';

function makeAdapter() {
  return {
    listAvailableProviders: jest.fn().mockResolvedValue([]),
    listGroupRepositoriesByProvider: jest
      .fn()
      .mockResolvedValue({ items: [], totalCount: 0 }),
    listProjectBranchesByProvider: jest.fn().mockResolvedValue([]),
    connectProject: jest.fn().mockResolvedValue({ id: 'prov1' }),
    getBranches: jest.fn().mockResolvedValue([]),
    getPipelines: jest.fn().mockResolvedValue([]),
    getPipelinesForService: jest.fn().mockResolvedValue([]),
    getRepos: jest.fn().mockResolvedValue([]),
    triggerPipeline: jest.fn().mockResolvedValue({ id: 1, status: 'created' }),
    getGitlabConfig: jest.fn().mockResolvedValue({ id: 'prov1' }),
  };
}

const user = { id: 'user1', role: Role.ADMIN } as never;

describe('GitlabController', () => {
  describe('listProviders', () => {
    it('delegates to adapter.listAvailableProviders', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.listProviders();
      expect(adapter.listAvailableProviders).toHaveBeenCalled();
    });
  });

  describe('listGroupRepositories', () => {
    it('passes undefined for providerId=default', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.listGroupRepositories('default', 'grp1', {} as never);
      expect(adapter.listGroupRepositoriesByProvider).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: undefined }),
      );
    });

    it('passes real providerId when not default', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.listGroupRepositories('prov1', 'grp1', {} as never);
      expect(adapter.listGroupRepositoriesByProvider).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'prov1' }),
      );
    });

    it('parses archived string to boolean', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.listGroupRepositories('p1', 'grp1', {
        archived: 'true',
      } as never);
      const call = (adapter.listGroupRepositoriesByProvider as jest.Mock).mock
        .calls[0][0];
      expect(call.query.archived).toBe(true);
    });

    it('defaults includeSubgroups to true when not provided', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.listGroupRepositories('p1', 'grp1', {} as never);
      const call = (adapter.listGroupRepositoriesByProvider as jest.Mock).mock
        .calls[0][0];
      expect(call.query.includeSubgroups).toBe(true);
    });
  });

  describe('connectProject', () => {
    it('passes projectId, dto, and user credentials to adapter', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.connectProject(
        'proj1',
        { gitlabUrl: 'https://gl.io' } as never,
        user,
      );
      expect(adapter.connectProject).toHaveBeenCalledWith(
        'proj1',
        expect.anything(),
        'user1',
        Role.ADMIN,
      );
    });
  });

  describe('getBranches', () => {
    it('parses numeric repoId from query string', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.getBranches('proj1', '42', undefined, user);
      expect(adapter.getBranches).toHaveBeenCalledWith(
        'proj1',
        'user1',
        Role.ADMIN,
        42,
        undefined,
      );
    });

    it('passes undefined when repoId is empty', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.getBranches('proj1', undefined, undefined, user);
      expect(adapter.getBranches).toHaveBeenCalledWith(
        'proj1',
        'user1',
        Role.ADMIN,
        undefined,
        undefined,
      );
    });

    it('passes undefined when repoId is invalid', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.getBranches('proj1', 'not-a-number', undefined, user);
      expect(adapter.getBranches).toHaveBeenCalledWith(
        'proj1',
        'user1',
        Role.ADMIN,
        undefined,
        undefined,
      );
    });

    // Bug B3: serviceId must reach the adapter (and from there,
    // getProjectConfig) so the resolved repo/branches genuinely match the
    // service the caller is asking about, not an arbitrary one.
    it('passes serviceId through to the adapter so the correct service repo is resolved', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.getBranches('proj1', undefined, 'svc-frontend', user);
      expect(adapter.getBranches).toHaveBeenCalledWith(
        'proj1',
        'user1',
        Role.ADMIN,
        undefined,
        'svc-frontend',
      );
    });
  });

  describe('triggerPipeline', () => {
    it('passes branch and repoId to adapter', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.triggerPipeline(
        'proj1',
        { branch: 'main', repoId: 5 } as never,
        user,
      );
      expect(adapter.triggerPipeline).toHaveBeenCalledWith(
        'proj1',
        'main',
        'user1',
        Role.ADMIN,
        5,
      );
    });
  });

  describe('getPipelinesForService', () => {
    it('passes serviceId to adapter', async () => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.getPipelinesForService('proj1', 'svc1', user);
      expect(adapter.getPipelinesForService).toHaveBeenCalledWith(
        'proj1',
        'svc1',
        'user1',
        Role.ADMIN,
      );
    });
  });

  describe('parseOptionalBoolean (private, tested via listGroupRepositories)', () => {
    it.each([
      ['true', true],
      ['1', true],
      ['yes', true],
      ['false', false],
      ['0', false],
      ['no', false],
      ['garbage', undefined],
      ['', undefined],
    ])('"%s" → %s', async (value, expected) => {
      const adapter = makeAdapter();
      const ctrl = new GitlabController(adapter as never);
      await ctrl.listGroupRepositories('p1', 'g1', {
        archived: value,
      } as never);
      const query = (adapter.listGroupRepositoriesByProvider as jest.Mock).mock
        .calls[0][0].query;
      expect(query.archived).toBe(expected);
    });
  });
});
