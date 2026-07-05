import { ServerRunKind } from '@prisma/client';
import { AutomationGateway } from './automation.gateway';

function makeClient(
  opts: {
    id?: string;
    token?: string;
    authToken?: string;
    cookie?: string;
    authorization?: string;
  } = {},
) {
  return {
    id: opts.id ?? 'socket-1',
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    data: {},
    handshake: {
      auth: opts.authToken ? { token: opts.authToken } : {},
      headers: {
        cookie: opts.cookie,
        authorization: opts.authorization,
      },
    },
  } as never;
}

function makeDeps(
  opts: {
    jwtPayload?: unknown;
    jwtError?: boolean;
    runFound?: boolean;
  } = {},
) {
  const jwtService = {
    verify: opts.jwtError
      ? jest.fn().mockImplementation(() => {
          throw new Error('invalid token');
        })
      : jest
          .fn()
          .mockReturnValue(opts.jwtPayload ?? { sub: 'user1', role: 'ADMIN' }),
  };

  const prisma = {
    serverRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.runFound !== false ? { id: 'run1' } : null),
    },
  };

  const configService = {
    get: jest.fn().mockReturnValue('platform_auth'),
  };

  return { jwtService, prisma, configService };
}

describe('AutomationGateway', () => {
  describe('handleConnection', () => {
    it('disconnects client when no token is present', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient();
      gw.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects client when token is invalid', () => {
      const { jwtService, prisma, configService } = makeDeps({
        jwtError: true,
      });
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient({ authToken: 'bad-token' });
      gw.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects client when role is not ADMIN', () => {
      const { jwtService, prisma, configService } = makeDeps({
        jwtPayload: { sub: 'user1', role: 'DEVELOPER' },
      });
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient({ authToken: 'developer-token' });
      gw.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('accepts ADMIN token passed via auth.token', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient({ authToken: 'admin-token' });
      gw.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('strips Bearer prefix from authorization header', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient({ authorization: 'Bearer admin-token' });
      gw.handleConnection(client);
      expect(jwtService.verify).toHaveBeenCalledWith('admin-token');
    });
  });

  describe('handleJoinRun', () => {
    it('returns error when runId is missing', async () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient();
      const result = await gw.handleJoinRun(client, {});
      expect(result).toEqual({ ok: false, error: 'runId manquant' });
    });

    it('returns error when run is not found', async () => {
      const { jwtService, prisma, configService } = makeDeps({
        runFound: false,
      });
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient();
      const result = await gw.handleJoinRun(client, { runId: 'run1' });
      expect(result).toEqual({
        ok: false,
        runId: 'run1',
        error: 'Automation run introuvable',
      });
    });

    it('joins room and returns ok when run exists', async () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient();
      const result = await gw.handleJoinRun(client, { runId: 'run1' });
      expect(client.join).toHaveBeenCalledWith('automation-run:run1');
      expect(result).toEqual({ ok: true, runId: 'run1' });
    });

    it('queries serverRun with AUTOMATION kind', async () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const client = makeClient();
      await gw.handleJoinRun(client, { runId: 'run1' });
      expect(prisma.serverRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run1', kind: ServerRunKind.AUTOMATION },
        }),
      );
    });
  });

  describe('emit helpers', () => {
    it('emitRunStatus emits to room', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      gw.server = mockServer as never;
      gw.emitRunStatus({ runId: 'run1', status: 'SUCCESS' });
      expect(mockServer.to).toHaveBeenCalledWith('automation-run:run1');
    });

    it('emitRunLog serializes createdAt to ISO string', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const emitMock = jest.fn();
      gw.server = {
        to: jest.fn().mockReturnValue({ emit: emitMock }),
      } as never;
      const date = new Date('2026-01-01T00:00:00.000Z');
      gw.emitRunLog({
        runId: 'run1',
        level: 'info',
        source: 'ansible',
        message: 'done',
        lineNumber: 1,
        createdAt: date,
      });
      expect(emitMock).toHaveBeenCalledWith(
        'automation:log',
        expect.objectContaining({
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      );
    });

    it('emitRunFinished emits to room', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new AutomationGateway(
        jwtService as never,
        prisma as never,
        configService as never,
      );
      const emitMock = jest.fn();
      gw.server = {
        to: jest.fn().mockReturnValue({ emit: emitMock }),
      } as never;
      gw.emitRunFinished({ runId: 'run1', status: 'SUCCESS' });
      expect(emitMock).toHaveBeenCalledWith(
        'automation:finished',
        expect.objectContaining({ status: 'SUCCESS' }),
      );
    });
  });
});
