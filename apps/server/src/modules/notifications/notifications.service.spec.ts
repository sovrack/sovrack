import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsConfigService } from './notifications-config.service';
import { NotificationsSmtpService } from './notifications-smtp.service';
import { NotificationsSlackService } from './notifications-slack.service';
import { NotificationsDiscordService } from './notifications-discord.service';
import {
  NotificationsService,
  type DeploymentNotificationPayload,
} from './notifications.service';

describe('NotificationsService (dispatcher)', () => {
  let service: NotificationsService;
  let config: { get: jest.Mock };
  let smtp: {
    sendDeploymentEmail: jest.Mock;
    sendSimpleEmail: jest.Mock;
    sendDockerConnectionEmail: jest.Mock;
  };
  let slack: {
    sendDeploymentSlack: jest.Mock;
    sendSimpleSlack: jest.Mock;
    sendDockerConnectionSlack: jest.Mock;
  };
  let prisma: { project: { findUnique: jest.Mock } };

  const payload: DeploymentNotificationPayload = {
    deploymentId: 'd1',
    status: 'SUCCESS',
    projectName: 'P',
    environmentName: 'prod',
    branch: 'main',
    triggeredBy: 'admin',
  };

  beforeEach(() => {
    config = { get: jest.fn().mockResolvedValue(null) };
    smtp = {
      sendDeploymentEmail: jest.fn().mockResolvedValue(undefined),
      sendSimpleEmail: jest.fn().mockResolvedValue(undefined),
      sendDockerConnectionEmail: jest.fn().mockResolvedValue(undefined),
    };
    slack = {
      sendDeploymentSlack: jest.fn().mockResolvedValue(undefined),
      sendSimpleSlack: jest.fn().mockResolvedValue(undefined),
      sendDockerConnectionSlack: jest.fn().mockResolvedValue(undefined),
    };
    const discord = {
      sendDeploymentDiscord: jest.fn().mockResolvedValue(undefined),
      sendSimpleDiscord: jest.fn().mockResolvedValue(undefined),
      sendDockerConnectionDiscord: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ name: 'P' }) },
    };

    service = new NotificationsService(
      config as unknown as NotificationsConfigService,
      smtp as unknown as NotificationsSmtpService,
      slack as unknown as NotificationsSlackService,
      discord as unknown as NotificationsDiscordService,
      prisma as unknown as PrismaService,
    );
  });

  describe('notifyDeploymentFinished gating', () => {
    it('skips SUCCESS when NOTIFY_ON_SUCCESS=false', async () => {
      config.get.mockImplementation((k: string) =>
        Promise.resolve(k === 'NOTIFY_ON_SUCCESS' ? 'false' : null),
      );
      await service.notifyDeploymentFinished({ ...payload, status: 'SUCCESS' });
      expect(slack.sendDeploymentSlack).not.toHaveBeenCalled();
      expect(smtp.sendDeploymentEmail).not.toHaveBeenCalled();
    });

    it('skips FAILED when NOTIFY_ON_FAILURE=false', async () => {
      config.get.mockImplementation((k: string) =>
        Promise.resolve(k === 'NOTIFY_ON_FAILURE' ? 'false' : null),
      );
      await service.notifyDeploymentFinished({ ...payload, status: 'FAILED' });
      expect(slack.sendDeploymentSlack).not.toHaveBeenCalled();
    });

    it('dispatches both channels for SUCCESS by default', async () => {
      await service.notifyDeploymentFinished({ ...payload, status: 'SUCCESS' });
      expect(slack.sendDeploymentSlack).toHaveBeenCalledWith(payload);
      expect(smtp.sendDeploymentEmail).toHaveBeenCalledWith(payload);
    });
  });

  describe('event dispatchers', () => {
    it('notifyAutoHeal dispatches slack + email', async () => {
      await service.notifyAutoHeal({
        serviceEnvId: 'se1',
        containerName: 'c1',
        reason: 'exited',
      });
      expect(slack.sendSimpleSlack).toHaveBeenCalledWith(
        expect.stringContaining('Auto-heal'),
      );
      expect(smtp.sendSimpleEmail).toHaveBeenCalled();
    });

    it('notifyConfigDrift dispatches both channels', async () => {
      await service.notifyConfigDrift({
        serviceEnvId: 'se1',
        desiredGeneration: 2,
        deployedGeneration: 1,
      });
      expect(slack.sendSimpleSlack).toHaveBeenCalledWith(
        expect.stringContaining('Config drift'),
      );
    });

    it('notifyWebhookDeadLetter resolves project name from DB', async () => {
      const event = {
        id: 'ev1',
        externalDeliveryId: null,
        attempts: 3,
      } as never;
      const endpoint = { id: 'ep1', projectId: 'proj1' };
      await service.notifyWebhookDeadLetter(event, endpoint);
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'proj1' },
        select: { name: true },
      });
      expect(slack.sendSimpleSlack).toHaveBeenCalledWith(
        expect.stringContaining('P'),
      );
    });

    it('notifyDockerConnectionDown forwards to slack + smtp', async () => {
      const p = {
        serverId: 's1',
        endpoint: 'tcp://x:2376',
        lastError: 'refused',
        failedSince: new Date(),
      };
      await service.notifyDockerConnectionDown(p);
      expect(slack.sendDockerConnectionSlack).toHaveBeenCalledWith(p, false);
      expect(smtp.sendDockerConnectionEmail).toHaveBeenCalledWith(p, false);
    });

    it('notifyDockerConnectionRecovered passes recovered=true', async () => {
      const p = { serverId: 's1', endpoint: 'tcp://x:2376' };
      await service.notifyDockerConnectionRecovered(p);
      expect(slack.sendDockerConnectionSlack).toHaveBeenCalledWith(p, true);
    });

    it('notifySslRenewalFailed includes domain in message', async () => {
      await service.notifySslRenewalFailed({
        domainName: 'example.com',
        error: 'timeout',
      });
      expect(slack.sendSimpleSlack).toHaveBeenCalledWith(
        expect.stringContaining('example.com'),
      );
    });
  });

  describe('settings delegation', () => {
    it('getSettings delegates to configService', async () => {
      const mockSettings = { slackWebhookUrl: '' } as never;
      (config as unknown as { getSettings: jest.Mock }).getSettings = jest
        .fn()
        .mockResolvedValue(mockSettings);
      const result = await service.getSettings();
      expect(result).toBe(mockSettings);
    });
  });
});
