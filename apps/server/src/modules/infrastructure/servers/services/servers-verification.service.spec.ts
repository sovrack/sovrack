import { ServerStatus } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersVerificationService } from './servers-verification.service';

describe('ServersVerificationService', () => {
  let prisma: {
    server: { update: jest.Mock };
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
