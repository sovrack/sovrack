import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from './jwt.service';

describe('JwtService (wrapper)', () => {
  let nest: { sign: jest.Mock; verify: jest.Mock; decode: jest.Mock };
  let service: JwtService;

  beforeEach(() => {
    nest = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
      verify: jest.fn().mockReturnValue({ id: 'u1', email: 'a@b.com' }),
      decode: jest.fn().mockReturnValue({ id: 'u1', email: 'a@b.com' }),
    };
    service = new JwtService(
      nest as unknown as NestJwtService,
      {} as unknown as ConfigService,
    );
  });

  it('generateAccessToken delegates to sign', () => {
    const payload = {
      id: 'u1',
      email: 'a@b.com',
      role: 'OWNER' as const,
      sessionVersion: 0,
    };
    expect(service.generateAccessToken(payload)).toBe('signed.jwt.token');
    expect(nest.sign).toHaveBeenCalledWith(payload);
  });

  it('verifyToken delegates to verify', () => {
    expect(service.verifyToken('t')).toMatchObject({ id: 'u1' });
    expect(nest.verify).toHaveBeenCalledWith('t');
  });

  it('decodeToken delegates to decode', () => {
    expect(service.decodeToken('t')).toMatchObject({ email: 'a@b.com' });
    expect(nest.decode).toHaveBeenCalledWith('t');
  });
});
