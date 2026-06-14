import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from './deployments-healthcheck.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DeploymentsHealthcheckService — progressive 3-phase', () => {
  function makeService(overrides: Record<string, string> = {}) {
    const config: Record<string, string> = {
      // grace/interval at 1ms keep the test instant (parsePositiveInt rejects 0)
      DEPLOY_STARTUP_GRACE_MS: '1',
      DEPLOY_HEALTHCHECK_INTERVAL_MS: '1',
      DEPLOY_HEALTHCHECK_RETRIES: '6',
      DEPLOY_HEALTHCHECK_CONSECUTIVE: '2',
      DEPLOY_HEALTHCHECK_TIMEOUT_MS: '1000',
      DEPLOY_HEALTHCHECK_ENABLED: 'true',
      ...overrides,
    };
    const configService = {
      get: (key: string) => config[key],
    } as unknown as ConfigService;
    const gateway = { emitLog: jest.fn() } as unknown as DeploymentsGateway;
    return new DeploymentsHealthcheckService(configService, gateway);
  }

  const params = {
    deploymentId: 'dep-1',
    environmentDomain: null,
    serverHost: '10.0.0.1',
    appPort: 3000,
    healthcheckPath: '/health',
  };

  beforeEach(() => mockedAxios.get.mockReset());

  it('passes only after N consecutive successes (readiness)', async () => {
    // 1 success, then a 503 (resets), then 2 successes → ready
    mockedAxios.get
      .mockResolvedValueOnce({ status: 200 } as never)
      .mockResolvedValueOnce({ status: 503 } as never)
      .mockResolvedValueOnce({ status: 200 } as never)
      .mockResolvedValueOnce({ status: 200 } as never);
    const service = makeService();
    const summary = await service.runPostDeployHealthChecks(params);
    expect(summary).toContain('Health-check OK');
    expect(mockedAxios.get).toHaveBeenCalledTimes(4);
  });

  it('accepts a 4xx as alive (server is up)', async () => {
    mockedAxios.get.mockResolvedValue({ status: 404 } as never);
    const service = makeService();
    const summary = await service.runPostDeployHealthChecks(params);
    expect(summary).toContain('Health-check OK');
  });

  it('throws with the last responses when never ready', async () => {
    mockedAxios.get.mockResolvedValue({ status: 503 } as never);
    const service = makeService({ DEPLOY_HEALTHCHECK_RETRIES: '3' });
    await expect(service.runPostDeployHealthChecks(params)).rejects.toThrow(/HTTP 503/);
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });

  it('is skipped when disabled', async () => {
    const service = makeService({ DEPLOY_HEALTHCHECK_ENABLED: 'false' });
    const summary = await service.runPostDeployHealthChecks(params);
    expect(summary).toContain('ignoré');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('probes host:port with the healthcheckPath', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200 } as never);
    const service = makeService({ DEPLOY_HEALTHCHECK_CONSECUTIVE: '1' });
    await service.runPostDeployHealthChecks(params);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://10.0.0.1:3000/health',
      expect.any(Object),
    );
  });
});
