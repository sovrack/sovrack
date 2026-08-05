import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TerminalService } from './terminal.service';

describe('TerminalService.openSession', () => {
  const opts = { cols: 80, rows: 24 };
  const handlers = {
    onData: jest.fn(),
    onClose: jest.fn(),
    onError: jest.fn(),
  };

  const validServer = {
    id: 'srv1',
    host: 'h',
    port: 22,
    username: 'u',
    sshKey: 'key',
    isVerified: true,
    isActive: true,
    environmentId: 'env1',
  };

  function make(server: unknown) {
    const prisma = {
      server: { findUnique: jest.fn().mockResolvedValue(server) },
      environment: {
        findUnique: jest.fn().mockResolvedValue({ projectId: 'proj1' }),
      },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
    };
    const crypto = {
      decrypt: jest.fn((v: string) => v),
      normalizePrivateKeyFormat: jest.fn((v: string) => v),
    };
    const hostKeys = {
      resolveForConnection: jest.fn().mockResolvedValue({ keyBase64: 'k' }),
      hostVerifier: jest.fn().mockReturnValue(() => true),
    };
    const handle = { write: jest.fn(), resize: jest.fn(), close: jest.fn() };
    const sshSessions = { openShell: jest.fn().mockResolvedValue(handle) };
    const audit = {
      recordOpen: jest.fn().mockResolvedValue(undefined),
      recordClose: jest.fn().mockResolvedValue(undefined),
      recordError: jest.fn().mockResolvedValue(undefined),
    };
    const configService = { get: jest.fn().mockReturnValue('300000') };
    const svc = new TerminalService(
      prisma as never,
      crypto as never,
      hostKeys as never,
      sshSessions as never,
      audit as never,
      configService as never,
    );
    return { svc, prisma, sshSessions, audit, handle };
  }

  // ── Server validation ──────────────────────────────────────────────────────

  it('throws NotFound when the server does not exist', async () => {
    const { svc, sshSessions } = make(null);
    await expect(
      svc.openSession('ghost', 'admin', Role.OWNER, opts, handlers),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sshSessions.openShell).not.toHaveBeenCalled();
  });

  it('refuses an unverified server', async () => {
    const { svc, sshSessions } = make({ ...validServer, isVerified: false });
    await expect(
      svc.openSession('srv1', 'admin', Role.OWNER, opts, handlers),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sshSessions.openShell).not.toHaveBeenCalled();
  });

  it('refuses a deactivated server', async () => {
    const { svc, sshSessions } = make({ ...validServer, isActive: false });
    await expect(
      svc.openSession('srv1', 'admin', Role.OWNER, opts, handlers),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sshSessions.openShell).not.toHaveBeenCalled();
  });

  // ── ADMIN access ───────────────────────────────────────────────────────────

  it('opens the shell for a platform ADMIN and records the audit trail', async () => {
    const { svc, sshSessions, audit, handle } = make(validServer);
    const res = await svc.openSession(
      'srv1',
      'admin',
      Role.OWNER,
      opts,
      handlers,
    );
    expect(audit.recordOpen).toHaveBeenCalledWith(
      'srv1',
      'admin',
      expect.objectContaining({ host: 'h', port: 22 }),
    );
    expect(sshSessions.openShell).toHaveBeenCalled();
    expect(res).toBe(handle);
  });

  it('ADMIN bypasses ownership check even for a server without environmentId', async () => {
    const { svc, sshSessions } = make({ ...validServer, environmentId: null });
    await expect(
      svc.openSession('srv1', 'admin', Role.OWNER, opts, handlers),
    ).resolves.toBeDefined();
    expect(sshSessions.openShell).toHaveBeenCalled();
  });

  it('records an audit error and rethrows when the SSH shell fails', async () => {
    const { svc, sshSessions, audit } = make(validServer);
    sshSessions.openShell.mockRejectedValueOnce(new Error('boom'));
    await expect(
      svc.openSession('srv1', 'admin', Role.OWNER, opts, handlers),
    ).rejects.toThrow('boom');
    expect(audit.recordError).toHaveBeenCalledWith(
      'srv1',
      'admin',
      expect.objectContaining({ message: 'boom' }),
    );
  });

  // ── Project OWNER access ───────────────────────────────────────────────────

  it('allows a project OWNER to access a server linked to their environment', async () => {
    const { svc, sshSessions } = make(validServer);
    const res = await svc.openSession(
      'srv1',
      'u1',
      Role.MEMBER,
      opts,
      handlers,
    );
    expect(sshSessions.openShell).toHaveBeenCalled();
    expect(res).toBeDefined();
  });

  it('blocks a non-ADMIN user on a server with no environmentId', async () => {
    const { svc } = make({ ...validServer, environmentId: null });
    await expect(
      svc.openSession('srv1', 'u1', Role.MEMBER, opts, handlers),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a project DEVELOPER (OWNER-only for terminal)', async () => {
    const { svc, prisma } = make(validServer);
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'DEVELOPER' });
    await expect(
      svc.openSession('srv1', 'u1', Role.MEMBER, opts, handlers),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a user who is not a member of the project at all', async () => {
    const { svc, prisma } = make(validServer);
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(
      svc.openSession('srv1', 'u1', Role.MEMBER, opts, handlers),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when the server environment cannot be resolved', async () => {
    const { svc, prisma } = make(validServer);
    prisma.environment.findUnique.mockResolvedValue(null);
    await expect(
      svc.openSession('srv1', 'u1', Role.MEMBER, opts, handlers),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
