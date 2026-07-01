import {
  NotificationsConfigService,
  CONFIG_KEYS,
} from './notifications-config.service';
import { NotificationsSmtpService } from './notifications-smtp.service';
import type { DeploymentNotificationPayload } from './notifications.service';

const mockSendMail = jest.fn().mockResolvedValue({});
const mockCreateTransport = jest
  .fn()
  .mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

describe('NotificationsSmtpService', () => {
  let configGet: jest.Mock;
  let service: NotificationsSmtpService;

  const deployPayload: DeploymentNotificationPayload = {
    deploymentId: 'd1',
    status: 'SUCCESS',
    projectName: 'Proj',
    environmentName: 'prod',
    branch: 'main',
    triggeredBy: 'ci',
  };

  const withSmtp = (overrides: Record<string, string> = {}) => {
    const defaults: Record<string, string> = {
      [CONFIG_KEYS.SMTP_HOST]: 'smtp.local',
      [CONFIG_KEYS.SMTP_TO]: 'to@test.com',
    };
    const map = { ...defaults, ...overrides };
    configGet.mockImplementation((k: string) =>
      Promise.resolve(map[k] ?? null),
    );
  };

  beforeEach(() => {
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
    mockSendMail.mockResolvedValue({});
    configGet = jest.fn().mockResolvedValue(null);
    const config = { get: configGet } as unknown as NotificationsConfigService;
    service = new NotificationsSmtpService(config);
  });

  describe('sendSimpleEmail', () => {
    it('is a no-op when SMTP_HOST is not configured', async () => {
      await service.sendSimpleEmail('Subject', 'body', 'ctx');
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('is a no-op when SMTP_TO is missing (host configured)', async () => {
      configGet.mockImplementation((k: string) =>
        Promise.resolve(k === CONFIG_KEYS.SMTP_HOST ? 'smtp.local' : null),
      );
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
    it('reuses the transporter when SMTP config is unchanged', async () => {
      withSmtp();
      await service.sendDeploymentEmail(deployPayload);
      await service.sendDeploymentEmail(deployPayload);
      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    });
  });
});
