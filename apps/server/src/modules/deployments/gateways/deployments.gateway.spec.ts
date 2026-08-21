import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Server } from 'socket.io';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DeploymentsLogStreamService } from '../query/deployments-log-stream.service';
import { DeploymentsGateway } from './deployments.gateway';

// ── Socket mock helpers ───────────────────────────────────────────────────────

function makeSocket(
  overrides: Partial<{
    cookieHeader: string;
    authToken: string | undefined;
    authorizationHeader: string;
    userData: Record<string, unknown>;
  }> = {},
) {
  return {
    id: 'socket-1',
    handshake: {
      auth:
        overrides.authToken !== undefined ? { token: overrides.authToken } : {},
      headers: {
        cookie: overrides.cookieHeader ?? '',
        authorization: overrides.authorizationHeader ?? '',
      },
    },
    data: overrides.userData ?? {},
    disconnect: jest.fn(),
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Gateway factory ───────────────────────────────────────────────────────────

function makeGateway(
  opts: {
    jwtPayload?: Record<string, unknown> | null;
    deployment?: { projectId: string } | null;
    member?: { id: string } | null;
  } = {},
) {
  const jwtService = {
    verify: jest.fn(),
  } as unknown as JwtService;

  if (opts.jwtPayload === null) {
    (jwtService.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid token');
    });
  } else {
    (jwtService.verify as jest.Mock).mockReturnValue(
      opts.jwtPayload ?? { id: 'u1', email: 'user@test.com', role: Role.USER },
    );
  }

  const prisma = {
    deployment: {
      findUnique: jest.fn().mockResolvedValue(
        'deployment' in opts
          ? opts.deployment
          : {
              projectId: 'proj1',
              resolvedRefs: { serverId: 's1' },
              serviceEnv: null,
            },
      ),
    },
    projectMember: {
      findUnique: jest
        .fn()
        .mockResolvedValue('member' in opts ? opts.member : { id: 'pm1' }),
    },
  } as unknown as PrismaService;

  const configService = {
    get: jest.fn().mockReturnValue('deployautomation_auth'),
  } as unknown as ConfigService;

  const logStreamService = {
    unsubscribeAll: jest.fn().mockReturnValue(0),
    unsubscribe: jest.fn().mockReturnValue(true),
    subscribe: jest.fn().mockReturnValue('sub-key-1'),
  } as unknown as DeploymentsLogStreamService;

  const workspaceAccess = {
    assertProjectAction:
      opts.member === null
        ? jest.fn().mockRejectedValue(new Error('not found'))
        : jest.fn().mockResolvedValue({ effectiveProjectRole: 'VIEWER' }),
  };

  const gateway = new DeploymentsGateway(
    jwtService,
    prisma,
    configService,
    logStreamService,
    workspaceAccess as never,
  );

  const _mockTo = jest.fn().mockReturnThis();
  const mockEmit = jest.fn();
  const mockServerTo = jest.fn().mockReturnValue({ emit: mockEmit });
  gateway.server = {
    to: mockServerTo,
  } as unknown as Server;

  return {
    gateway,
    jwtService,
    prisma,
    logStreamService,
    mockServerTo,
    mockEmit,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeploymentsGateway', () => {
  describe('handleConnection', () => {
    it('disconnects a client with no token', () => {
      const { gateway } = makeGateway();
      const client = makeSocket();
      gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('accepts a client with a valid auth.token', () => {
      const { gateway } = makeGateway();
      const client = makeSocket({ authToken: 'valid-jwt' });
      gateway.handleConnection(client as never);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('strips Bearer prefix from Authorization header', () => {
      const { gateway } = makeGateway();
      const client = makeSocket({ authorizationHeader: 'Bearer valid-jwt' });
      gateway.handleConnection(client as never);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a client with an invalid/expired token', () => {
      const { gateway } = makeGateway({ jwtPayload: null });
      const client = makeSocket({ authToken: 'bad-token' });
      gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('stores the decoded user in client.data after a successful auth', () => {
      const { gateway } = makeGateway();
      const client = makeSocket({ authToken: 'valid-jwt' });
      gateway.handleConnection(client as never);
      expect((client.data as { user?: unknown }).user).toMatchObject({
        id: 'u1',
        email: 'user@test.com',
      });
    });
  });

  describe('handleDisconnect', () => {
    it('calls unsubscribeAll on the log stream service', () => {
      const { gateway, logStreamService } = makeGateway();
      const client = makeSocket();
      gateway.handleDisconnect(client as never);
      expect(logStreamService.unsubscribeAll).toHaveBeenCalledWith('socket-1');
    });
  });

  describe('handleJoinDeployment', () => {
    it('returns error when deploymentId is missing', async () => {
      const { gateway } = makeGateway();
      const client = makeSocket({
        userData: { user: { id: 'u1', role: Role.USER } },
      });
      const result = await gateway.handleJoinDeployment(client as never, {
        deploymentId: '',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('deploymentId');
    });

    it('returns error when client has no user (unauthenticated)', async () => {
      const { gateway } = makeGateway();
      const client = makeSocket({ userData: {} });
      const result = await gateway.handleJoinDeployment(client as never, {
        deploymentId: 'd1',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('non authentifié');
    });

    it('returns error when access check fails (non-member)', async () => {
      const { gateway } = makeGateway({ member: null });
      const client = makeSocket({
        userData: { user: { id: 'u1', role: Role.USER, email: 'u@t.com' } },
      });
      const result = await gateway.handleJoinDeployment(client as never, {
        deploymentId: 'd1',
      });
      expect(result.ok).toBe(false);
    });

    it('joins the room and returns ok=true for authorized member', async () => {
      const { gateway } = makeGateway();
      const client = makeSocket({
        userData: { user: { id: 'u1', role: Role.USER, email: 'u@t.com' } },
      });
      const result = await gateway.handleJoinDeployment(client as never, {
        deploymentId: 'd1',
      });
      expect(result.ok).toBe(true);
      expect(client.join).toHaveBeenCalledWith('deployment:d1');
    });

    it('denies a SUPER_ADMIN who is not a project member', async () => {
      const { gateway } = makeGateway({ member: null });
      const client = makeSocket({
        userData: {
          user: { id: 'admin1', role: Role.SUPER_ADMIN, email: 'a@t.com' },
        },
      });
      const result = await gateway.handleJoinDeployment(client as never, {
        deploymentId: 'd1',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('event emitters', () => {
    it('emitStarted broadcasts to the deployment room', () => {
      const { gateway, mockServerTo, mockEmit } = makeGateway();
      gateway.emitStarted({
        deploymentId: 'd1',
        startedAt: new Date().toISOString(),
      });
      expect(mockServerTo).toHaveBeenCalledWith('deployment:d1');
      expect(mockEmit).toHaveBeenCalledWith(
        'deployment:started',
        expect.objectContaining({ deploymentId: 'd1' }),
      );
    });

    it('emitLog broadcasts and appends to the ring buffer', () => {
      const { gateway, mockServerTo, mockEmit } = makeGateway();
      const log = {
        deploymentId: 'd1',
        line: 'build ok',
        timestamp: '2026-01-01T00:00:00Z',
      };
      gateway.emitLog(log);
      expect(mockServerTo).toHaveBeenCalledWith('deployment:d1');
      expect(mockEmit).toHaveBeenCalledWith('deployment:log', log);
    });

    it('emitStatus broadcasts to the deployment room', () => {
      const { gateway, mockServerTo } = makeGateway();
      gateway.emitStatus({ deploymentId: 'd1', status: 'SUCCESS' });
      expect(mockServerTo).toHaveBeenCalledWith('deployment:d1');
    });

    it('emitFinished broadcasts and clears the log buffer', () => {
      const { gateway, mockEmit } = makeGateway();
      // pre-populate buffer via emitLog
      gateway.emitLog({ deploymentId: 'd1', line: 'line1', timestamp: '' });
      gateway.emitFinished({
        deploymentId: 'd1',
        status: 'SUCCESS',
        finishedAt: '',
      });
      expect(mockEmit).toHaveBeenCalledWith(
        'deployment:finished',
        expect.any(Object),
      );

      // buffer should be cleared — replay should return count=0
    });

    it('ring buffer evicts oldest entries when MAX_BUFFER_SIZE is exceeded', () => {
      const { gateway } = makeGateway();
      for (let i = 0; i < 210; i++) {
        gateway.emitLog({
          deploymentId: 'd-buf',
          line: `line-${i}`,
          timestamp: '',
        });
      }
      // No error means eviction worked; buffer is capped at 200
    });
  });

  describe('handleReplayRequest', () => {
    it('returns error when deploymentId is missing', async () => {
      const { gateway } = makeGateway();
      const client = makeSocket({
        userData: { user: { id: 'u1', role: Role.USER } },
      });
      const result = await gateway.handleReplayRequest(client as never, {});
      expect(result.ok).toBe(false);
    });

    it('returns count=0 when buffer is empty', async () => {
      const { gateway } = makeGateway();
      const client = makeSocket({
        userData: { user: { id: 'u1', role: Role.USER, email: 'u@t.com' } },
      });
      const result = await gateway.handleReplayRequest(client as never, {
        deploymentId: 'd1',
      });
      expect(result.ok).toBe(true);
      expect(result.count).toBe(0);
    });

    it('emits buffered logs and returns their count', async () => {
      const { gateway } = makeGateway();
      // populate buffer first
      gateway.emitLog({
        deploymentId: 'd-replay',
        line: 'log1',
        timestamp: '',
      });
      gateway.emitLog({
        deploymentId: 'd-replay',
        line: 'log2',
        timestamp: '',
      });

      const client = makeSocket({
        userData: {
          user: { id: 'u1', role: Role.SUPER_ADMIN, email: 'a@t.com' },
        },
      });
      const result = await gateway.handleReplayRequest(client as never, {
        deploymentId: 'd-replay',
      });
      expect(result.ok).toBe(true);
      expect(result.count).toBe(2);
      expect(client.emit).toHaveBeenCalledWith(
        'deployment:log-replay',
        expect.objectContaining({
          deploymentId: 'd-replay',
          logs: expect.any(Array),
        }),
      );
    });
  });

  describe('handleLogsSubscribe', () => {
    it('returns error when required fields are missing', async () => {
      const { gateway } = makeGateway();
      const client = makeSocket({
        userData: { user: { id: 'u1', role: Role.USER, email: 'u@t.com' } },
      });
      const result = await gateway.handleLogsSubscribe(client as never, {
        deploymentId: 'd1',
        serverId: 's1',
        // containerName missing
      });
      expect(result.ok).toBe(false);
    });

    it('returns subscriptionKey on success', async () => {
      const { gateway } = makeGateway();
      const client = makeSocket({
        userData: {
          user: { id: 'u1', role: Role.SUPER_ADMIN, email: 'a@t.com' },
        },
      });
      const result = await gateway.handleLogsSubscribe(client as never, {
        deploymentId: 'd1',
        serverId: 's1',
        containerName: 'app',
        tail: 100,
      });
      expect(result.ok).toBe(true);
      expect(result.subscriptionKey).toBe('sub-key-1');
    });

    it('returns error when logStreamService returns null (no DockerConnection)', async () => {
      const { gateway, logStreamService } = makeGateway();
      (logStreamService.subscribe as jest.Mock).mockReturnValue(null);
      const client = makeSocket({
        userData: {
          user: { id: 'u1', role: Role.SUPER_ADMIN, email: 'a@t.com' },
        },
      });
      const result = await gateway.handleLogsSubscribe(client as never, {
        deploymentId: 'd1',
        serverId: 's1',
        containerName: 'app',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('handleLogsUnsubscribe', () => {
    it('cancels a valid subscription key', () => {
      const { gateway } = makeGateway();
      const result = gateway.handleLogsUnsubscribe({ subscriptionKey: 'k1' });
      expect(result.ok).toBe(true);
      expect(result.cancelled).toBe(true);
    });

    it('returns ok=false when key is absent', () => {
      const { gateway } = makeGateway();
      const result = gateway.handleLogsUnsubscribe({});
      expect(result.ok).toBe(false);
    });
  });
});
