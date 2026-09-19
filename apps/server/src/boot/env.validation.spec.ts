import { validateEnv } from './env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/sovrack',
  REDIS_URL: 'redis://localhost:6379',
  CONFIG_SECRET: 'config-secret-00000000000000000000000000001',
  JWT_SECRET: 'customer-jwt-secret-000000000000000000000001',
  STAFF_JWT_SECRET: 'staff-jwt-secret-00000000000000000000000001',
  STAFF_OTP_SECRET: 'staff-otp-secret-00000000000000000000000001',
  CUSTOMER_MFA_SECRET: 'customer-mfa-secret-00000000000000000000001',
};

describe('validateEnv cryptographic separation', () => {
  it('accepts five independently generated application secrets', () => {
    expect(validateEnv(baseEnv)).toMatchObject(baseEnv);
  });

  it.each([
    'CONFIG_SECRET',
    'STAFF_JWT_SECRET',
    'STAFF_OTP_SECRET',
    'CUSTOMER_MFA_SECRET',
  ] as const)('rejects JWT_SECRET reuse as %s', (name) => {
    expect(() =>
      validateEnv({ ...baseEnv, [name]: baseEnv.JWT_SECRET }),
    ).toThrow(`${name} doit être un secret indépendant de JWT_SECRET`);
  });

  it('rejects a secret derived by appending a suffix', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        STAFF_JWT_SECRET: `${baseEnv.JWT_SECRET}-staff`,
      }),
    ).toThrow('STAFF_JWT_SECRET doit être un secret indépendant de JWT_SECRET');
  });
});
