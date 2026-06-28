import { BadRequestException } from '@nestjs/common';
import { Server, ServerStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersAuditService } from './servers-audit.service';
import { ServerVerificationService } from './server-verification.service';
import { ServersConnectionService } from './servers-connection.service';
import { ServersDetectionService } from './servers-detection.service';

describe('ServersDetectionService', () => {
  let prisma: { server: { update: jest.Mock; findUnique: jest.Mock } };
  let ssh: { openConnection: jest.Mock; closeConnection: jest.Mock };
  let verification: { addLog: jest.Mock };
  let audit: { record: jest.Mock };
  let execCommand: jest.Mock;
  let service: ServersDetectionService;

  const server = { id: 's1', isVerified: true } as Server;

  beforeEach(() => {
    execCommand = jest
      .fn()
      .mockResolvedValue({ stdout: 'ok|1|deb', stderr: '', code: 0 });
    prisma = {
      server: {
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 's1', ...data }),
          ),
        findUnique: jest.fn(),
      },
    };
    ssh = {
      openConnection: jest.fn().mockResolvedValue({ target: { execCommand } }),
      closeConnection: jest.fn(),
    };
    verification = { addLog: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ServersDetectionService(
      prisma as unknown as PrismaService,
      ssh as unknown as ServersConnectionService,
      verification as unknown as ServerVerificationService,
      audit as unknown as ServersAuditService,
    );
  });

  it('refuses detection on an unverified server', async () => {
    await expect(
      service.detect({ id: 's1', isVerified: false } as Server),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('detects tools, persists INFO_DETECTED + capabilities, audits, closes SSH', async () => {
    const updated = await service.detect(server, 'admin');
    expect(updated.status).toBe(ServerStatus.INFO_DETECTED);
    expect(prisma.server.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({
          status: ServerStatus.INFO_DETECTED,
          onboardingStep: 'INFO_DETECTED',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      's1',
      'SERVER_DETECT',
      'admin',
      expect.anything(),
    );
    expect(ssh.closeConnection).toHaveBeenCalled();
  });

  it('marks a tool MISSING when its probe exits non-zero', async () => {
    // os/arch/systemd/python/memory/disk succeed; tool probes fail.
    let call = 0;
    execCommand.mockImplementation(() => {
      call += 1;
      // first 6 system probes succeed; the rest (tools) fail.
      return Promise.resolve(
        call <= 6
          ? { stdout: 'ok|1|deb', stderr: '', code: 0 }
          : { stdout: '', stderr: 'not found', code: 127 },
      );
    });
    await service.detect(server);
    const data = prisma.server.update.mock.calls[0][0].data;
    const tools = data.installedTools as Array<{ status: string }>;
    expect(tools.every((t) => t.status === 'MISSING')).toBe(true);
  });

  it('closes the SSH connection even if detection throws', async () => {
    execCommand.mockRejectedValue(new Error('ssh broke'));
    await expect(service.detect(server)).rejects.toThrow('ssh broke');
    expect(ssh.closeConnection).toHaveBeenCalled();
  });

  it('rebuilds a sorted capabilities list from the JSON map', async () => {
    prisma.server.findUnique.mockResolvedValue({
      capabilities: { 'os.name': 'Ubuntu', 'docker.installed': 'true' },
      lastDetectedAt: new Date(),
    });
    const caps = await service.listCapabilities('s1');
    expect(caps.map((c) => c.key)).toEqual(['docker.installed', 'os.name']);
  });

  it('rebuilds a sorted installed-tools list from the JSON array', async () => {
    prisma.server.findUnique.mockResolvedValue({
      installedTools: [
        { toolKey: 'redis', displayName: 'Redis', status: 'INSTALLED' },
        {
          toolKey: 'docker',
          displayName: 'Docker Engine',
          status: 'INSTALLED',
        },
      ],
    });
    const tools = await service.listInstalledTools('s1');
    expect(tools.map((t) => t.displayName)).toEqual(['Docker Engine', 'Redis']);
  });
});
