import { TerminalGateway } from './terminal.gateway';

/**
 * Security-focused coverage for the web terminal gateway.
 * Authorization (ADMIN vs OWNER) is enforced at service level — the gateway
 * forwards any valid JWT to TerminalService with the decoded role, and rejects
 * only missing/invalid tokens.
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

  it('rejects when no token is provided', async () => {
    const { gw, terminalService } = make(() => ({ role: 'ADMIN', sub: 'a1' }));
    const c = client(undefined);
    await gw.handleConnect(c as never, { serverId: 'srv1' });
    expect(terminalService.openSession).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('terminal:error', 'Non autorisé');
  });

  it('rejects when the JWT is invalid', async () => {
    const { gw, terminalService } = make(() => {
      throw new Error('invalid signature');
    });
    const c = client('bad-token');
    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'bad-token' });
    expect(terminalService.openSession).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('terminal:error', 'Non autorisé');
  });

  it('forwards ADMIN token to the service with the decoded role', async () => {
    const { gw, terminalService } = make(() => ({ role: 'ADMIN', sub: 'a1' }));
    const c = client('tok');
    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });
    expect(terminalService.openSession).toHaveBeenCalledWith(
      'srv1',
      'a1',
      'ADMIN',
      expect.any(Object),
      expect.any(Object),
    );
    expect(c.emit).toHaveBeenCalledWith('terminal:ready');
  });

  it('forwards a non-ADMIN token to the service (authorization is service-level)', async () => {
    const { gw, terminalService } = make(() => ({
      role: 'DEVELOPER',
      sub: 'u1',
    }));
    const c = client('tok');
    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });
    expect(terminalService.openSession).toHaveBeenCalledWith(
      'srv1',
      'u1',
      'DEVELOPER',
      expect.any(Object),
      expect.any(Object),
    );
  });
});
