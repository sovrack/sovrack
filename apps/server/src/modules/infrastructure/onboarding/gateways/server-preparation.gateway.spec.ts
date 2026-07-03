import { ServerRunKind } from '@prisma/client';
import { ServerPreparationGateway } from './server-preparation.gateway';

function makeClient(opts: {
  id?: string;
  authToken?: string;
  cookie?: string;
  authorization?: string;
} = {}) {
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

function makeDeps(opts: {
  jwtPayload?: unknown;
  jwtError?: boolean;
  runFound?: boolean;
} = {}) {
  const jwtService = {
    verify: opts.jwtError
      ? jest.fn().mockImplementation(() => { throw new Error('invalid'); })
      : jest.fn().mockReturnValue(
          opts.jwtPayload ?? { sub: 'user1', role: 'ADMIN' },
        ),
  };

  const prisma = {
    serverRun: {
      findFirst: jest.fn().mockResolvedValue(
        opts.runFound !== false ? { id: 'prep1' } : null,
      ),
    },
  };

  const configService = {
    get: jest.fn().mockReturnValue('platform_auth'),
  };

  return { jwtService, prisma, configService };
}

describe('ServerPreparationGateway', () => {
  describe('handleConnection', () => {
    it('disconnects when no token', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      const client = makeClient();
      gw.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects when token is invalid', () => {
      const { jwtService, prisma, configService } = makeDeps({ jwtError: true });
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      gw.handleConnection(makeClient({ authToken: 'bad' }));
      // handleConnection swallows the error and disconnects
    });

    it('disconnects non-ADMIN role', () => {
      const { jwtService, prisma, configService } = makeDeps({
        jwtPayload: { sub: 'u1', role: 'DEVELOPER' },
      });
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      const client = makeClient({ authToken: 'dev-tok' });
      gw.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('allows ADMIN token', () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      const client = makeClient({ authToken: 'admin-tok' });
      gw.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleJoinPreparation', () => {
    it('returns error when preparationId is missing', async () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      const result = await gw.handleJoinPreparation(makeClient(), {});
      expect(result).toEqual({ ok: false, error: 'preparationId manquant' });
    });

    it('returns error when preparation run is not found', async () => {
      const { jwtService, prisma, configService } = makeDeps({ runFound: false });
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      const result = await gw.handleJoinPreparation(makeClient(), { preparationId: 'prep1' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('introuvable');
    });

    it('joins room and emits preparation:joined on success', async () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      const client = makeClient();
      const result = await gw.handleJoinPreparation(client, { preparationId: 'prep1' });
      expect(client.join).toHaveBeenCalledWith('server-preparation:prep1');
      expect(client.emit).toHaveBeenCalledWith('preparation:joined', { preparationId: 'prep1' });
      expect(result).toEqual({ ok: true, preparationId: 'prep1' });
    });

    it('queries with PREPARATION kind', async () => {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      await gw.handleJoinPreparation(makeClient(), { preparationId: 'prep1' });
      expect(prisma.serverRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prep1', kind: ServerRunKind.PREPARATION } }),
      );
    });
  });

  describe('emit helpers', () => {
    function makeGw() {
      const { jwtService, prisma, configService } = makeDeps();
      const gw = new ServerPreparationGateway(jwtService as never, prisma as never, configService as never);
      const emitMock = jest.fn();
      gw.server = { to: jest.fn().mockReturnValue({ emit: emitMock }) } as never;
      return { gw, emitMock, serverMock: gw.server as unknown as { to: jest.Mock } };
    }

    it('emitLog serializes createdAt as ISO string', () => {
      const { gw, emitMock } = makeGw();
      const date = new Date('2026-06-01T12:00:00.000Z');
      gw.emitLog({ preparationId: 'p1', level: 'info', source: 'ansible', message: 'ok', lineNumber: 1, createdAt: date });
      expect(emitMock).toHaveBeenCalledWith('preparation:log', expect.objectContaining({
        createdAt: '2026-06-01T12:00:00.000Z',
      }));
    });

    it('emitStatus emits to room', () => {
      const { gw, serverMock } = makeGw();
      gw.emitStatus({ preparationId: 'p1', status: 'RUNNING' });
      expect(serverMock.to).toHaveBeenCalledWith('server-preparation:p1');
    });

    it('emitFinished emits to room', () => {
      const { gw, emitMock } = makeGw();
      gw.emitFinished({ preparationId: 'p1', status: 'SUCCESS' });
      expect(emitMock).toHaveBeenCalledWith('preparation:finished', expect.objectContaining({ status: 'SUCCESS' }));
    });
  });
});
