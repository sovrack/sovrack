import { AnsibleRunnerService } from '../../../adapters/provisioning/ansible-runner.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SslCertificateService } from './ssl-certificate.service';
import { SslRenewalService } from './ssl-renewal.service';

function makeService(certs: { domainName: string }[] = []) {
  const sslCertificateService = {
    getExpiringCertificates: jest.fn().mockResolvedValue(certs),
  } as unknown as SslCertificateService;

  const ansibleRunner = {
    resolvePlaybooksRoot: jest.fn().mockReturnValue('/playbooks'),
    runPlaybook: jest.fn().mockResolvedValue(undefined),
  } as unknown as AnsibleRunnerService;

  const notifications = {
    notifySslRenewalFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;

  const svc = new SslRenewalService(sslCertificateService, ansibleRunner, notifications);
  return { svc, sslCertificateService, ansibleRunner, notifications };
}

describe('SslRenewalService', () => {
  describe('renewExpiringCertificates', () => {
    it('does nothing when no certificates are expiring', async () => {
      const { svc, ansibleRunner } = makeService([]);
      await svc.renewExpiringCertificates();
      expect(ansibleRunner.runPlaybook).not.toHaveBeenCalled();
    });

    it('runs the ssl-renew playbook for each expiring certificate', async () => {
      const { svc, ansibleRunner } = makeService([
        { domainName: 'example.com' },
        { domainName: 'api.example.com' },
      ]);
      await svc.renewExpiringCertificates();
      expect(ansibleRunner.runPlaybook).toHaveBeenCalledTimes(2);
    });

    it('passes the domain name as extra-vars to the playbook', async () => {
      const { svc, ansibleRunner } = makeService([{ domainName: 'example.com' }]);
      await svc.renewExpiringCertificates();
      const call = (ansibleRunner.runPlaybook as jest.Mock).mock.calls[0];
      const args: string[] = call[0];
      expect(args[0]).toContain('ssl-renew.yml');
      expect(args).toContain('--extra-vars');
      const extraVars = JSON.parse(args[args.indexOf('--extra-vars') + 1]) as { domain_name: string };
      expect(extraVars.domain_name).toBe('example.com');
    });

    it('sends a failure notification when the playbook throws', async () => {
      const { svc, ansibleRunner, notifications } = makeService([
        { domainName: 'fail.com' },
      ]);
      (ansibleRunner.runPlaybook as jest.Mock).mockRejectedValue(new Error('timeout'));
      await svc.renewExpiringCertificates();
      expect(notifications.notifySslRenewalFailed).toHaveBeenCalledWith(
        expect.objectContaining({ domainName: 'fail.com', error: 'timeout' }),
      );
    });

    it('continues processing remaining certs after one failure', async () => {
      const { svc, ansibleRunner } = makeService([
        { domainName: 'fail.com' },
        { domainName: 'ok.com' },
      ]);
      (ansibleRunner.runPlaybook as jest.Mock)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(undefined);
      await svc.renewExpiringCertificates();
      expect(ansibleRunner.runPlaybook).toHaveBeenCalledTimes(2);
    });

    it('swallows notification errors (catch on notifySslRenewalFailed)', async () => {
      const { svc, ansibleRunner, notifications } = makeService([
        { domainName: 'fail.com' },
      ]);
      (ansibleRunner.runPlaybook as jest.Mock).mockRejectedValue(new Error('boom'));
      (notifications.notifySslRenewalFailed as jest.Mock).mockRejectedValue(
        new Error('slack down'),
      );
      await expect(svc.renewExpiringCertificates()).resolves.toBeUndefined();
    });
  });
});
