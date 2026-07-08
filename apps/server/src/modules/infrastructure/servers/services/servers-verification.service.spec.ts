import { ServerStatus } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersVerificationService } from './servers-verification.service';

describe('ServersVerificationService', () => {
  let prisma: {
    server: { update: jest.Mock; findUnique: jest.Mock };
    serverValidationResult: { create: jest.Mock };
    serverLog: { create: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };
  let service: ServersVerificationService;

  beforeEach(() => {
    prisma = {
      server: {
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 's1', ...data }),
          ),
        // Default: a fresh server (never prepared) so re-validation advances
        // it to SSH_VALIDATED. Individual tests override for prepared servers.
        findUnique: jest.fn().mockResolvedValue({
          status: ServerStatus.NEW,
          onboardingStep: 'NEW',
        }),
      },
      serverValidationResult: { create: jest.fn().mockResolvedValue({}) },
      serverLog: { create: jest.fn().mockResolvedValue({}) },
    };
    eventEmitter = { emit: jest.fn() };
    service = new ServersVerificationService(
      prisma as unknown as PrismaService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('startVerification moves the server to SSH_PENDING and logs', async () => {
    const res = await service.startVerification('s1');
    expect(res.status).toBe(ServerStatus.SSH_PENDING);
    expect(prisma.serverLog.create).toHaveBeenCalled();
  });

  it('markSshValidated → SSH_VALIDATED + isVerified when fully validated', async () => {
    const res = await service.markSshValidated('s1', {
      sshReachable: true,
      authSucceeded: true,
      sudoAvailable: true,
      pythonAvailable: true,
    });
    expect(res.status).toBe(ServerStatus.SSH_VALIDATED);
    expect(res.isVerified).toBe(true);
    expect(prisma.serverValidationResult.create).toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith('server.ssh.validated', {
      serverId: 's1',
    });
  });

  it('markSshValidated → VALIDATION_FAILED when sudo is missing', async () => {
    const res = await service.markSshValidated('s1', {
      sshReachable: true,
      authSucceeded: true,
      sudoAvailable: false,
      pythonAvailable: true,
    });
    expect(res.status).toBe(ServerStatus.VALIDATION_FAILED);
    expect(res.isVerified).toBe(false);
  });

  // Regression: re-validating SSH on an already-prepared server must NOT
  // demote its status (which then let auto-detect push it to INFO_DETECTED,
  // producing a "server not ready" + "all tools installed" contradiction and
  // blocking deploys).
  it('markSshValidated preserves PREPARED status on re-validation', async () => {
    prisma.server.findUnique.mockResolvedValue({
      status: ServerStatus.PREPARED,
      onboardingStep: 'PREPARED',
    });
    const res = await service.markSshValidated('s1', {
      sshReachable: true,
      authSucceeded: true,
      sudoAvailable: true,
      pythonAvailable: true,
    });
    // status/onboardingStep untouched (not in the update payload) → isVerified
    // refreshed without demoting the provisioning state.
    expect(res.status).toBeUndefined();
    expect(res.isVerified).toBe(true);
    const updateArg = prisma.server.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('status');
    expect(updateArg.data).not.toHaveProperty('onboardingStep');
  });

  it('markSshValidated on a prepared server that now FAILS still demotes to VALIDATION_FAILED', async () => {
    prisma.server.findUnique.mockResolvedValue({
      status: ServerStatus.PREPARED,
      onboardingStep: 'PREPARED',
    });
    const res = await service.markSshValidated('s1', {
      sshReachable: true,
      authSucceeded: true,
      sudoAvailable: false,
      pythonAvailable: true,
    });
    expect(res.status).toBe(ServerStatus.VALIDATION_FAILED);
    expect(res.isVerified).toBe(false);
  });

  it('markFailed records the error and sets VALIDATION_FAILED', async () => {
    const res = await service.markFailed('s1', new Error('connection refused'));
    expect(res.status).toBe(ServerStatus.VALIDATION_FAILED);
    expect(res.verificationError).toBe('connection refused');
    expect(prisma.serverValidationResult.create).toHaveBeenCalled();
  });

  it('addLog never throws even if the log write fails', async () => {
    prisma.serverLog.create.mockRejectedValue(new Error('db down'));
    await expect(service.addLog('s1', 'msg')).resolves.toBeUndefined();
  });
});
