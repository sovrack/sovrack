import { TerminalGateway } from './terminal.gateway';

/**
 * Security-focused coverage for the web terminal gateway.
 * Authorization (ADMIN vs OWNER) is enforced at service level — the gateway
 * forwards any valid JWT to TerminalService with the decoded role, and rejects
 * only missing/invalid tokens.
 */
describe('TerminalGateway.handleConnect (authorization)', () => {
  function make(
    verifyImpl: () => Record<string, unknown>,
    validateImpl: () => Promise<unknown> = async () => undefined,
  ) {
    const handle = { write: jest.fn(), resize: jest.fn(), close: jest.fn() };
    const terminalService = {
      openSession: jest.fn().mockResolvedValue(handle),
    };
    const jwtService = { verify: jest.fn().mockImplementation(verifyImpl) };
    const configService = { get: jest.fn().mockReturnValue('secret') };
    const sessionValidator = {
      validate: jest.fn().mockImplementation(validateImpl),
    };
    const gw = new TerminalGateway(
      terminalService as never,
      jwtService as never,
      configService as never,
      sessionValidator as never,
    );
    return { gw, terminalService, sessionValidator };
  }

  const payload = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    sub: 'a1',
    email: 'owner@example.com',
    role: 'OWNER',
    sessionVersion: 0,
    authType: 'user',
    ...overrides,
  });

  function client(token?: string) {
    return {
      id: 'c1',
      emit: jest.fn(),
      handshake: { auth: token ? { token } : {}, headers: {} },
    };
  }

  it('rejects when no token is provided', async () => {
    const { gw, terminalService } = make(() => payload());
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
    await gw.handleConnect(c as never, {
      serverId: 'srv1',
      token: 'bad-token',
    });
    expect(terminalService.openSession).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('terminal:error', 'Non autorisé');
  });

  it('forwards ADMIN token to the service with the decoded role', async () => {
    const { gw, terminalService, sessionValidator } = make(() => payload());
    const c = client('tok');
    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });
    expect(terminalService.openSession).toHaveBeenCalledWith(
      'srv1',
      'a1',
      'OWNER',
      expect.any(Object),
      expect.any(Object),
    );
    expect(c.emit).toHaveBeenCalledWith('terminal:ready');
    expect(sessionValidator.validate).toHaveBeenCalledWith(payload());
  });

  it('forwards a non-ADMIN token to the service (authorization is service-level)', async () => {
    const { gw, terminalService } = make(() =>
      payload({ id: 'u1', sub: 'u1', role: 'MEMBER' }),
    );
    const c = client('tok');
    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });
    expect(terminalService.openSession).toHaveBeenCalledWith(
      'srv1',
      'u1',
      'MEMBER',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('rejects a signed token when its server-side session is revoked', async () => {
    const { gw, terminalService } = make(
      () => payload(),
      async () => {
        throw new Error('revoked');
      },
    );
    const c = client('tok');

    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });

    expect(terminalService.openSession).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('terminal:error', 'Non autorisé');
  });

  it('always rejects staff impersonation sessions', async () => {
    const { gw, terminalService } = make(() =>
      payload({
        authType: 'staff-impersonation',
        impersonatedByStaffId: 'staff-1',
        impersonationGrantId: 'grant-1',
      }),
    );
    const c = client('tok');

    await gw.handleConnect(c as never, { serverId: 'srv1', token: 'tok' });

    expect(terminalService.openSession).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('terminal:error', 'Non autorisé');
  });
});
