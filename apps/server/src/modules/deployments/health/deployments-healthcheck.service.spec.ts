import { ConfigService } from '@nestjs/config';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from './deployments-healthcheck.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { SshExecutorService } from '../../../core/ssh/ssh-executor.service';
import { ServersCryptoService } from '../../infrastructure/servers/services/servers-crypto.service';
import { ServerHostKeyService } from '../../infrastructure/servers/services/server-host-key.service';

describe('DeploymentsHealthcheckService — progressive 3-phase', () => {
  // Mock SSH exec to return responses based on a queue
  let sshResponses: string[] = [];
  const mockSshExec = jest.fn().mockImplementation(async () => {
    const code = sshResponses.shift() ?? 'CONN_ERR';
    return { stdout: code, stderr: '', code: 0 };
  });

  const mockSshConn = { dispose: jest.fn().mockResolvedValue(undefined) };
  const mockSsh = {
    connect: jest.fn().mockResolvedValue(mockSshConn),
    exec: mockSshExec,
  } as unknown as SshExecutorService;

  const mockPrisma = {
    server: { findUnique: jest.fn().mockResolvedValue({ id: 'srv-1', host: '10.0.0.1', port: 22, username: 'ubuntu', sshKey: 'enc-key' }) },
  } as unknown as PrismaService;

  const mockCrypto = { decrypt: jest.fn().mockReturnValue('plain-key') } as unknown as ServersCryptoService;
  const mockHostKeys = { resolveForConnection: jest.fn().mockResolvedValue({ keyBase64: 'abc' }) } as unknown as ServerHostKeyService;

  function makeService(overrides: Record<string, string> = {}) {
    const config: Record<string, string> = {
      DEPLOY_STARTUP_GRACE_MS: '1',
      DEPLOY_HEALTHCHECK_INTERVAL_MS: '1',
      DEPLOY_HEALTHCHECK_RETRIES: '6',
      DEPLOY_HEALTHCHECK_CONSECUTIVE: '2',
      DEPLOY_HEALTHCHECK_TIMEOUT_MS: '1000',
      DEPLOY_HEALTHCHECK_ENABLED: 'true',
      ...overrides,
    };
    const configService = { get: (key: string) => config[key] } as unknown as ConfigService;
    const gateway = { emitLog: jest.fn() } as unknown as DeploymentsGateway;
    return new DeploymentsHealthcheckService(configService, gateway, mockPrisma, mockSsh, mockCrypto, mockHostKeys);
  }

  const params = {
    deploymentId: 'dep-1',
    environmentDomain: null,
    serverHost: '10.0.0.1',
    serverId: 'srv-1',
    appPort: 3000,
    healthcheckPath: '/health',
  };

  beforeEach(() => {
    sshResponses = [];
    mockSshExec.mockClear();
    mockSshConn.dispose.mockClear();
  });

  it('passes only after N consecutive successes (readiness) via SSH', async () => {
    sshResponses = ['200', '503', '200', '200'];
    const service = makeService();
    const summary = await service.runPostDeployHealthChecks(params);
    expect(summary).toContain('Health-check OK');
    expect(mockSshExec).toHaveBeenCalledTimes(4);
  });

  it('accepts a 4xx as alive (server is up)', async () => {
    sshResponses = ['404', '404'];
    const service = makeService();
    const summary = await service.runPostDeployHealthChecks(params);
    expect(summary).toContain('Health-check OK');
  });

  it('throws with the last responses when never ready', async () => {
    sshResponses = ['503', '503', '503'];
    const service = makeService({ DEPLOY_HEALTHCHECK_RETRIES: '3' });
    await expect(service.runPostDeployHealthChecks(params)).rejects.toThrow(/HTTP 503/);
    expect(mockSshExec).toHaveBeenCalledTimes(3);
  });

  it('is skipped when disabled', async () => {
    const service = makeService({ DEPLOY_HEALTHCHECK_ENABLED: 'false' });
    const summary = await service.runPostDeployHealthChecks(params);
    expect(summary).toContain('ignoré');
    expect(mockSshExec).not.toHaveBeenCalled();
  });

  it('closes SSH connection after probing', async () => {
    sshResponses = ['200', '200'];
    const service = makeService({ DEPLOY_HEALTHCHECK_CONSECUTIVE: '1' });
    await service.runPostDeployHealthChecks(params);
    expect(mockSshConn.dispose).toHaveBeenCalledTimes(1);
  });
});
