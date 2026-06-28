import { TerminalGateway } from './terminal.gateway';

/**
 * Security-focused coverage for the web terminal gateway: only a platform ADMIN
 * may open an SSH session, and a missing/invalid token is rejected.
 */
describe('TerminalGateway.handleConnect (authorization)', () => {
  function make(verifyImpl: () => { role: string; sub: string }) {
    const handle = { write: jest.fn(), resize: jest.fn(), close: jest.fn() };
    const terminalService = {
      openSession: jest.fn().mockResolvedValue(handle),
    };
    const jwtService = { verify: jest.fn().mockImplementation(verifyImpl) };
    const configService = { get: jest.fn().mockReturnValue('secret') };
    const gw = new TerminalGateway(
      terminalService as never,
      jwtService as never,
      configService as never,
    );
    return { gw, terminalService };
  }

  function client(token?: string) {
    return {
      id: 'c1',
      emit: jest.fn(),
      handshake: { auth: token ? { token } : {}, headers: {} },
    };
  }

  it('rejects a non-ADMIN token (no SSH session)', async () => {
    const { gw, terminalService } = make(() => ({
      role: 'DEVELOPER',
      sub: 'u1',
    }));
    const c = client('tok');
    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });
    expect(terminalService.openSession).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('terminal:error', 'Non autorisé');
  });

  it('rejects when no token is provided', async () => {
    const { gw, terminalService } = make(() => ({ role: 'ADMIN', sub: 'a1' }));
    const c = client(undefined);
    await gw.handleConnect(c as never, { serverId: 'srv1' });
    expect(terminalService.openSession).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('terminal:error', 'Non autorisé');
  });

  it('opens a session for an ADMIN token', async () => {
    const { gw, terminalService } = make(() => ({ role: 'ADMIN', sub: 'a1' }));
    const c = client('tok');
    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });
    expect(terminalService.openSession).toHaveBeenCalledWith(
      'srv1',
      'a1',
      expect.any(Object),
      expect.any(Object),
    );
    expect(c.emit).toHaveBeenCalledWith('terminal:ready');
  });
});
