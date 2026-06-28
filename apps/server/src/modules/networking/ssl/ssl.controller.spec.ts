import { SslCertificateService } from './ssl-certificate.service';
import { SslController } from './ssl.controller';

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
    ctrl.issue({ domainName: 'd.com' } as never);
    ctrl.revoke('d.com');
    ctrl.getExpiring();
    expect(sslCertificateService.issueAndConfigure).toHaveBeenCalledWith({
      domainName: 'd.com',
    });
    expect(sslCertificateService.revoke).toHaveBeenCalledWith('d.com');
    expect(sslCertificateService.getExpiringCertificates).toHaveBeenCalledWith(
      30,
    );
  });
});
