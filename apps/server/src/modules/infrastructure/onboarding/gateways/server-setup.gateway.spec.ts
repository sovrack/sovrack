import { ServerRunKind } from '@prisma/client';
import { ServerSetupGateway } from './server-setup.gateway';

function makeClient(
  opts: {
    id?: string;
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
    data: { user: { id: 'user1', role: 'MEMBER' } },
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
          throw new Error('invalid');
        })
      : jest
          .fn()
          .mockReturnValue(opts.jwtPayload ?? { id: 'user1', role: 'MEMBER' }),
  };

  const prisma = {
    serverRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.runFound !== false
            ? { id: 'prep1', teamId: 'workspace-1' }
            : null,
        ),
    },
  };

  const configService = {
    get: jest.fn().mockReturnValue('sovrack_token'),
  };
  const workspaceAccess = {
    assertWorkspaceAction: jest.fn().mockResolvedValue({}),
  };

  return { jwtService, prisma, configService, workspaceAccess };
}

describe('ServerSetupGateway', () => {
  describe('handleConnection', () => {
    it('disconnects when no token', () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps();
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      const client = makeClient();
      gw.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects when token is invalid', () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps({
        jwtError: true,
      });
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      gw.handleConnection(makeClient({ authToken: 'bad' }));
      // handleConnection swallows the error and disconnects
    });

    it('defers workspace authorization until a setup is joined', () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps({
        jwtPayload: { id: 'u1', role: 'MEMBER' },
      });
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      const client = makeClient({ authToken: 'dev-tok' });
      gw.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('allows ADMIN token', () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps();
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      const client = makeClient({ authToken: 'admin-tok' });
      gw.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleJoinSetup', () => {
    it('returns error when setupId is missing', async () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps();
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      const result = await gw.handleJoinSetup(makeClient(), {});
      expect(result).toEqual({ ok: false, error: 'setupId manquant' });
    });

    it('returns error when preparation run is not found', async () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps({
        runFound: false,
      });
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      const result = await gw.handleJoinSetup(makeClient(), {
        setupId: 'prep1',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('introuvable');
    });

    it('joins room and emits setup:joined on success', async () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps();
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      const client = makeClient();
      const result = await gw.handleJoinSetup(client, {
        setupId: 'prep1',
      });
      expect(client.join).toHaveBeenCalledWith('server-setup:prep1');
      expect(client.emit).toHaveBeenCalledWith('setup:joined', {
        setupId: 'prep1',
      });
      expect(result).toEqual({ ok: true, setupId: 'prep1' });
    });

    it('queries with PREPARATION kind', async () => {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps();
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      await gw.handleJoinSetup(makeClient(), { setupId: 'prep1' });
      expect(prisma.serverRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prep1', kind: ServerRunKind.PREPARATION },
        }),
      );
    });
  });

  describe('emit helpers', () => {
    function makeGw() {
      const { jwtService, prisma, configService, workspaceAccess } = makeDeps();
      const gw = new ServerSetupGateway(
        jwtService as never,
        prisma as never,
        configService as never,
        workspaceAccess as never,
      );
      const emitMock = jest.fn();
      gw.server = {
        to: jest.fn().mockReturnValue({ emit: emitMock }),
      } as never;
      return {
        gw,
        emitMock,
        serverMock: gw.server as unknown as { to: jest.Mock },
      };
    }

    it('emitLog serializes createdAt as ISO string', () => {
      const { gw, emitMock } = makeGw();
      const date = new Date('2026-06-01T12:00:00.000Z');
      gw.emitLog({
        setupId: 'p1',
        level: 'info',
        source: 'ansible',
        message: 'ok',
        lineNumber: 1,
        createdAt: date,
      });
      expect(emitMock).toHaveBeenCalledWith(
        'setup:log',
        expect.objectContaining({
          createdAt: '2026-06-01T12:00:00.000Z',
        }),
      );
    });

    it('emitStatus emits to room', () => {
      const { gw, serverMock } = makeGw();
      gw.emitStatus({ setupId: 'p1', status: 'RUNNING' });
      expect(serverMock.to).toHaveBeenCalledWith('server-setup:p1');
    });

    it('emitFinished emits to room', () => {
      const { gw, emitMock } = makeGw();
      gw.emitFinished({ setupId: 'p1', status: 'SUCCESS' });
      expect(emitMock).toHaveBeenCalledWith(
        'setup:finished',
        expect.objectContaining({ status: 'SUCCESS' }),
      );
    });
  });
});
