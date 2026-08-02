import { ManagedServersProvisioningService } from './managed-servers-provisioning.service';

describe('ManagedServersProvisioningService', () => {
  function makeServer(overrides: Record<string, unknown> = {}) {
    return {
      id: 'srv-1',
      name: 'srv-manage',
      host: 'sovrack-managed-abc123',
      isManaged: true,
      isActive: true,
      status: 'NEW',
      isVerified: false,
      onboardingStep: 'PENDING',
      ...overrides,
    };
  }

  function createService(
    overrides: {
      servers?: unknown[];
      serverRunCount?: number;
      verified?: unknown;
    } = {},
  ) {
    const prisma = {
      server: {
        findMany: jest.fn().mockResolvedValue(overrides.servers ?? []),
        update: jest.fn().mockResolvedValue({}),
      },
      serverRun: {
        count: jest.fn().mockResolvedValue(overrides.serverRunCount ?? 0),
      },
    } as never;

    const core = {
      verifyServer: jest
        .fn()
        .mockResolvedValue(overrides.verified ?? { isVerified: true }),
    } as never;

    const setup = {
      startSetup: jest.fn().mockResolvedValue({ id: 'setup-1' }),
    } as never;

    return {
      svc: new ManagedServersProvisioningService(prisma, core, setup),
      prisma,
      core,
      setup,
    };
  }

  it('skips managed servers still on the placeholder host', async () => {
    const { svc, core, setup, prisma } = createService({
      servers: [makeServer()],
    });
    await svc.provisionPendingManagedServers();
    expect(core.verifyServer).not.toHaveBeenCalled();
    expect(setup.startSetup).not.toHaveBeenCalled();
    expect(prisma.server.update).not.toHaveBeenCalled();
  });

  it('marks the platform key installed when host is real and key not set', async () => {
    const { svc, prisma, core, setup } = createService({
      servers: [makeServer({ host: '203.0.113.10' })],
    });
    await svc.provisionPendingManagedServers();
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: 'srv-1' },
      data: { onboardingStep: 'KEY_INSTALLED' },
    });
    expect(core.verifyServer).not.toHaveBeenCalled();
    expect(setup.startSetup).not.toHaveBeenCalled();
  });

  it('runs SSH verification once the key step is done', async () => {
    const { svc, core, setup } = createService({
      servers: [
        makeServer({
          host: '203.0.113.10',
          onboardingStep: 'KEY_INSTALLED',
        }),
      ],
      verified: { isVerified: true },
    });
    await svc.provisionPendingManagedServers();
    expect(core.verifyServer).toHaveBeenCalledWith('srv-1');
    expect(setup.startSetup).not.toHaveBeenCalled();
  });

  it('starts the Ansible setup once the server is verified', async () => {
    const { svc, setup } = createService({
      servers: [
        makeServer({
          host: '203.0.113.10',
          onboardingStep: 'KEY_INSTALLED',
          isVerified: true,
        }),
      ],
    });
    await svc.provisionPendingManagedServers();
    expect(setup.startSetup).toHaveBeenCalledWith(
      'srv-1',
      undefined,
      undefined,
    );
  });

  it('does not start a second setup while one is running', async () => {
    const { svc, setup } = createService({
      servers: [
        makeServer({
          host: '203.0.113.10',
          onboardingStep: 'KEY_INSTALLED',
          isVerified: true,
        }),
      ],
      serverRunCount: 1,
    });
    await svc.provisionPendingManagedServers();
    expect(setup.startSetup).not.toHaveBeenCalled();
  });

  it('tolerates per-server errors without aborting the batch', async () => {
    const bad = makeServer({ id: 'srv-bad', host: '203.0.113.10' });
    const good = makeServer({
      id: 'srv-good',
      host: '203.0.113.11',
      onboardingStep: 'KEY_INSTALLED',
    });
    const { svc, core } = createService({ servers: [bad, good] });
    core.verifyServer = jest
      .fn()
      .mockRejectedValueOnce(new Error('ssh refused'))
      .mockResolvedValue({ isVerified: true });
    await expect(svc.provisionPendingManagedServers()).resolves.toBeUndefined();
    expect(core.verifyServer).toHaveBeenCalledTimes(1);
  });
});
