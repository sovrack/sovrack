import { Role } from '@prisma/client';
import { SslCertificateService } from './ssl-certificate.service';
import { SslController } from './ssl.controller';

const mockUser = { id: 'u1', email: 'test@test.com', role: Role.DEVELOPER };

describe('SslController', () => {
  function build() {
    const sslCertificateService = {
      issueAndConfigure: jest.fn().mockResolvedValue({ id: 'c1' }),
      revoke: jest.fn().mockResolvedValue({ ok: true }),
      getExpiringCertificates: jest.fn().mockResolvedValue([]),
    } as unknown as SslCertificateService;
    const ctrl = new SslController(sslCertificateService);
    return { ctrl, sslCertificateService };
  }

  it('issue / revoke / getExpiring delegate', () => {
    const { ctrl, sslCertificateService } = build();
    ctrl.issue({ domainName: 'd.com' } as never, mockUser as never);
    ctrl.revoke('d.com', mockUser as never);
    ctrl.getExpiring();
    expect(sslCertificateService.issueAndConfigure).toHaveBeenCalledWith(
      { domainName: 'd.com' },
      'u1',
      Role.DEVELOPER,
    );
    expect(sslCertificateService.revoke).toHaveBeenCalledWith(
      'd.com',
      'u1',
      Role.DEVELOPER,
    );
    expect(sslCertificateService.getExpiringCertificates).toHaveBeenCalledWith(
      30,
    );
  });
});
