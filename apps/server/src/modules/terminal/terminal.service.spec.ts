import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TerminalService } from './terminal.service';

describe('TerminalService.openSession', () => {
  const opts = { cols: 80, rows: 24 };
  const handlers = {
    onData: jest.fn(),
    onClose: jest.fn(),
    onError: jest.fn(),
  };

  function make(server: unknown) {
    const prisma = {
      server: { findUnique: jest.fn().mockResolvedValue(server) },
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

  const validServer = {
    id: 'srv1',
    host: 'h',
    port: 22,
    username: 'u',
    sshKey: 'key',
    isVerified: true,
    isActive: true,
  };

  it('throws NotFound when the server does not exist', async () => {
    const { svc, sshSessions } = make(null);
    await expect(
      svc.openSession('ghost', 'admin', opts, handlers),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sshSessions.openShell).not.toHaveBeenCalled();
  });

  it('refuses an unverified server (no SSH session)', async () => {
    const { svc, sshSessions } = make({ ...validServer, isVerified: false });
    await expect(
      svc.openSession('srv1', 'admin', opts, handlers),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sshSessions.openShell).not.toHaveBeenCalled();
  });

  it('refuses a deactivated server', async () => {
    const { svc, sshSessions } = make({ ...validServer, isActive: false });
    await expect(
      svc.openSession('srv1', 'admin', opts, handlers),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sshSessions.openShell).not.toHaveBeenCalled();
  });

  it('opens the shell and records the audit trail on a valid server', async () => {
    const { svc, sshSessions, audit, handle } = make(validServer);
    const res = await svc.openSession('srv1', 'admin', opts, handlers);
    expect(audit.recordOpen).toHaveBeenCalledWith(
      'srv1',
      'admin',
      expect.objectContaining({ host: 'h', port: 22 }),
    );
    expect(sshSessions.openShell).toHaveBeenCalled();
    expect(res).toBe(handle);
  });

  it('records an audit error and rethrows when the SSH shell fails', async () => {
    const { svc, sshSessions, audit } = make(validServer);
    sshSessions.openShell.mockRejectedValueOnce(new Error('boom'));
    await expect(
      svc.openSession('srv1', 'admin', opts, handlers),
    ).rejects.toThrow('boom');
    expect(audit.recordError).toHaveBeenCalledWith(
      'srv1',
      'admin',
      expect.objectContaining({ message: 'boom' }),
    );
  });
});
