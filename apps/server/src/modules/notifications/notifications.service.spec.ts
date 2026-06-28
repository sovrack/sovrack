import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import {
  NotificationsService,
  type DeploymentNotificationPayload,
} from './notifications.service';

type ConfigMap = Record<string, { value: string; isSecret: boolean }>;

describe('NotificationsService', () => {
  let prisma: {
    platformConfig: { findUnique: jest.Mock };
    project: { findUnique: jest.Mock };
  };
  let http: { post: jest.Mock };
  let crypto: { decrypt: jest.Mock };
  let service: NotificationsService;
  let config: ConfigMap;

  const payload: DeploymentNotificationPayload = {
    deploymentId: 'd1',
    status: 'SUCCESS',
    projectName: 'P',
    environmentName: 'prod',
    branch: 'main',
    triggeredBy: 'admin',
  };

  beforeEach(() => {
    config = {};
    prisma = {
      platformConfig: {
        findUnique: jest.fn(({ where: { key } }: { where: { key: string } }) =>
          Promise.resolve(config[key] ? { key, ...config[key] } : null),
        ),
      },
      project: { findUnique: jest.fn().mockResolvedValue({ name: 'P' }) },
    };
    http = { post: jest.fn().mockReturnValue(of({ data: {} })) };
    crypto = { decrypt: jest.fn((v: string) => `dec:${v}`) };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      http as unknown as HttpService,
      crypto as unknown as CryptoService,
    );
  });

  describe('getConfig', () => {
    const get = (key: string) =>
      (
        service as unknown as {
          getConfig: (k: string) => Promise<string | null>;
        }
      ).getConfig(key);

    it('returns plaintext for a non-secret value', async () => {
      config.X = { value: 'plain', isSecret: false };
      await expect(get('X')).resolves.toBe('plain');
    });

    it('decrypts a secret value', async () => {
      config.X = { value: 'enc', isSecret: true };
      await expect(get('X')).resolves.toBe('dec:enc');
    });

    it('returns null when the key is missing', async () => {
      await expect(get('NOPE')).resolves.toBeNull();
    });

    it('returns null when decryption throws', async () => {
      config.X = { value: 'bad', isSecret: true };
      crypto.decrypt.mockImplementation(() => {
        throw new Error('bad key');
      });
      await expect(get('X')).resolves.toBeNull();
    });
  });

  describe('notifyDeploymentFinished gating', () => {
    it('skips SUCCESS notifications when NOTIFY_ON_SUCCESS=false', async () => {
      config.NOTIFY_ON_SUCCESS = { value: 'false', isSecret: false };
      const slack = jest.spyOn(
        service as unknown as { sendSlackNotification: () => Promise<void> },
        'sendSlackNotification',
      );
      await service.notifyDeploymentFinished({ ...payload, status: 'SUCCESS' });
      expect(slack).not.toHaveBeenCalled();
    });

    it('skips FAILED notifications when NOTIFY_ON_FAILURE=false', async () => {
      config.NOTIFY_ON_FAILURE = { value: 'false', isSecret: false };
      const slack = jest.spyOn(
        service as unknown as { sendSlackNotification: () => Promise<void> },
        'sendSlackNotification',
      );
      await service.notifyDeploymentFinished({ ...payload, status: 'FAILED' });
      expect(slack).not.toHaveBeenCalled();
    });

    it('attempts to notify on SUCCESS by default (notifications enabled)', async () => {
      const slack = jest.spyOn(
        service as unknown as { sendSlackNotification: () => Promise<void> },
        'sendSlackNotification',
      );
      await service.notifyDeploymentFinished({ ...payload, status: 'SUCCESS' });
      expect(slack).toHaveBeenCalled();
    });
  });

  describe('channel no-ops & resilience', () => {
    it('does not POST to Slack when no webhook is configured', async () => {
      await service.notifyAutoHeal({
        serviceEnvId: 'se1',
        containerName: 'c1',
        reason: 'exited',
      });
      expect(http.post).not.toHaveBeenCalled();
    });

    it('POSTs to Slack when a webhook is configured', async () => {
      config.SLACK_WEBHOOK_URL = { value: 'https://hooks/x', isSecret: false };
      await service.notifyAutoHeal({
        serviceEnvId: 'se1',
        containerName: 'c1',
        reason: 'exited',
      });
      expect(http.post).toHaveBeenCalledWith(
        'https://hooks/x',
        expect.objectContaining({ text: expect.stringContaining('Auto-heal') }),
        expect.anything(),
      );
    });

    it('never throws when a Slack post fails', async () => {
      config.SLACK_WEBHOOK_URL = { value: 'https://hooks/x', isSecret: false };
      http.post.mockImplementation(() => {
        throw new Error('network down');
      });
      await expect(
        service.notifyAutoHeal({
          serviceEnvId: 'se1',
          containerName: 'c1',
          reason: 'exited',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
