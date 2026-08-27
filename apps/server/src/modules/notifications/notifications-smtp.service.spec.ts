import { NotificationsConfigService } from './notifications-config.service';
import type { SmtpRuntimeConfig } from './notifications-config.service';
import { NotificationsSmtpService } from './notifications-smtp.service';
import type { DeploymentNotificationPayload } from './notifications.service';

const mockSendMail = jest.fn().mockResolvedValue({});
const mockVerify = jest.fn().mockResolvedValue(true);
const mockCreateTransport = jest
  .fn()
  .mockReturnValue({ sendMail: mockSendMail, verify: mockVerify });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

describe('NotificationsSmtpService', () => {
  let getSmtpRuntimeConfig: jest.Mock;
  let service: NotificationsSmtpService;

  const disabledSmtp: SmtpRuntimeConfig = {
    enabled: false,
    source: 'none',
    host: '',
    port: 587,
    security: 'starttls',
    user: '',
    pass: '',
    from: '',
    to: '',
  };

  const deployPayload: DeploymentNotificationPayload = {
    deploymentId: 'd1',
    status: 'SUCCESS',
    projectName: 'Proj',
    environmentName: 'prod',
    branch: 'main',
    triggeredBy: 'ci',
  };

  const withSmtp = (overrides: Partial<SmtpRuntimeConfig> = {}) => {
    getSmtpRuntimeConfig.mockResolvedValue({
      ...disabledSmtp,
      enabled: true,
      source: 'database',
      host: 'smtp.local',
      to: 'to@test.com',
      ...overrides,
    });
  };

  beforeEach(() => {
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
    mockSendMail.mockResolvedValue({});
    mockVerify.mockClear();
    mockVerify.mockResolvedValue(true);
    getSmtpRuntimeConfig = jest.fn().mockResolvedValue(disabledSmtp);
    const config = {
      getSmtpRuntimeConfig,
    } as unknown as NotificationsConfigService;
    service = new NotificationsSmtpService(config);
  });

  describe('sendSimpleEmail', () => {
    it('is a no-op when SMTP_HOST is not configured', async () => {
      await service.sendSimpleEmail('Subject', 'body', 'ctx');
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('is a no-op when SMTP_TO is missing (host configured)', async () => {
      withSmtp({ to: '' });
      await service.sendSimpleEmail('Subject', 'body', 'ctx');
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sends mail when SMTP is configured', async () => {
      withSmtp();
      await service.sendSimpleEmail('Alert', 'body text', 'myapp');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('Alert') }),
      );
    });

    it('never throws on transporter error', async () => {
      withSmtp();
      mockSendMail.mockRejectedValue(new Error('connection refused'));
      await expect(
        service.sendSimpleEmail('Subject', 'body', 'ctx'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendTransactionalEmail', () => {
    it('fails explicitly when SMTP is not configured', async () => {
      await expect(
        service.sendTransactionalEmail(
          'client@example.test',
          'Verify',
          '<p>123456</p>',
        ),
      ).rejects.toThrow("service d'envoi d'email");
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sends to the requested recipient when SMTP is configured', async () => {
      withSmtp({ from: 'noreply@example.test' });
      await service.sendTransactionalEmail(
        'client@example.test',
        'Verify',
        '<p>123456</p>',
      );
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@example.test',
        to: 'client@example.test',
        subject: '[Sovrack] Verify',
        html: '<p>123456</p>',
      });
    });

    it('does not report success when the SMTP server rejects the message', async () => {
      withSmtp();
      mockSendMail.mockRejectedValue(new Error('connection refused'));
      await expect(
        service.sendTransactionalEmail(
          'client@example.test',
          'Verify',
          '<p>123456</p>',
        ),
      ).rejects.toThrow("service d'envoi d'email");
    });
  });

  describe('testConfiguration', () => {
    it('verifies the transport and sends an actual test message', async () => {
      withSmtp({ from: 'noreply@example.test' });

      await service.testConfiguration('staff@example.test');

      expect(mockVerify).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'staff@example.test' }),
      );
    });

    it('does not expose provider errors to the API caller', async () => {
      withSmtp();
      mockVerify.mockRejectedValue(new Error('535 invalid password'));

      await expect(
        service.testConfiguration('staff@example.test'),
      ).rejects.toThrow('test SMTP a échoué');
    });
  });

  describe('sendDeploymentEmail', () => {
    it('is a no-op when SMTP not configured', async () => {
      await service.sendDeploymentEmail(deployPayload);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sends a deploy email with correct subject', async () => {
      withSmtp();
      await service.sendDeploymentEmail({
        ...deployPayload,
        status: 'SUCCESS',
      });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('SUCCESS'),
        }),
      );
    });

    it('never throws on failure', async () => {
      withSmtp();
      mockSendMail.mockRejectedValue(new Error('auth failure'));
      await expect(
        service.sendDeploymentEmail(deployPayload),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendDockerConnectionEmail', () => {
    it('sends DOWN email when recovered=false', async () => {
      withSmtp();
      const p = {
        serverId: 's1',
        serverName: 'prod-server',
        endpoint: 'tcp://10.0.0.1:2376',
        lastError: 'connection refused',
        failedSince: new Date(),
      };
      await service.sendDockerConnectionEmail(p, false);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('INJOIGNABLE'),
        }),
      );
    });

    it('sends RECOVERED email when recovered=true', async () => {
      withSmtp();
      const p = { serverId: 's1', endpoint: 'tcp://x:2376' };
      await service.sendDockerConnectionEmail(p, true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('RÉCUPÉRÉ'),
        }),
      );
    });

    it('never throws on failure', async () => {
      mockSendMail.mockRejectedValue(new Error('smtp error'));
      const p = {
        serverId: 's1',
        endpoint: 'tcp://x',
        lastError: '',
        failedSince: new Date(),
      };
      await expect(
        service.sendDockerConnectionEmail(p, false),
      ).resolves.toBeUndefined();
    });
  });

  describe('transporter caching', () => {
    it('configures bounded SMTP network timeouts', async () => {
      withSmtp();
      await service.sendDeploymentEmail(deployPayload);
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionTimeout: 5_000,
          greetingTimeout: 5_000,
          socketTimeout: 10_000,
        }),
      );
    });

    it('uses explicit STARTTLS without implicit TLS', async () => {
      withSmtp({ security: 'starttls' });
      await service.sendDeploymentEmail(deployPayload);
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false, requireTLS: true }),
      );
    });

    it('reuses the transporter when SMTP config is unchanged', async () => {
      withSmtp();
      await service.sendDeploymentEmail(deployPayload);
      await service.sendDeploymentEmail(deployPayload);
      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    });
  });
});
