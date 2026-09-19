import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UserTokenService } from './user-token.service';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  fullName: 'User Example',
  role: Role.MEMBER,
  isActive: true,
  sessionVersion: 4,
  legacyStaffRetiredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeService(identity: typeof user | null = user) {
  const jwt = { sign: jest.fn().mockReturnValue('token') };
  const users = { findById: jest.fn().mockResolvedValue(identity) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new UserTokenService(jwt as never, users as never, audit as never),
    jwt,
    audit,
  };
}

describe('UserTokenService', () => {
  it('creates a customer access token without a global privilege role', () => {
    const { service, jwt } = makeService();
    expect(service.generateAccessToken(user as never)).toBe('token');
    expect(jwt.sign).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'user@example.com',
      role: Role.MEMBER,
      sessionVersion: 4,
    });
  });

  it('binds a websocket token to the current session', () => {
    const { service, jwt } = makeService();
    service.generateWsToken('user-1', 'user@example.com', 4);
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        id: 'user-1',
        sub: 'user-1',
        email: 'user@example.com',
        role: Role.MEMBER,
        sessionVersion: 4,
        authType: 'user',
      },
      { expiresIn: '5m' },
    );
  });

  it('reloads Google identities and audits a successful token issue', async () => {
    const { service, audit } = makeService();
    await expect(service.generateTokenForUserId('user-1')).resolves.toEqual(
      expect.objectContaining({ access_token: 'token' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'user-1',
      'AUTH_GOOGLE_LOGIN',
      'User',
      'user-1',
      { email: 'user@example.com' },
    );
  });

  it('rejects an unavailable identity', async () => {
    const { service } = makeService(null);
    await expect(service.generateTokenForUserId('missing')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
