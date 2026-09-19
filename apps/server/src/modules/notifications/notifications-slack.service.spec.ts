import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import {
  NotificationsConfigService,
  CONFIG_KEYS,
} from './notifications-config.service';
import { NotificationsSlackService } from './notifications-slack.service';
import type { DeploymentNotificationPayload } from './notifications.service';

describe('NotificationsSlackService', () => {
  let configGet: jest.Mock;
  let httpPost: jest.Mock;
  let service: NotificationsSlackService;

  const deployPayload: DeploymentNotificationPayload = {
    deploymentId: 'd1',
    status: 'SUCCESS',
    projectName: 'Proj',
    environmentName: 'prod',
    branch: 'main',
    triggeredBy: 'ci',
  };

  beforeEach(() => {
    configGet = jest.fn().mockResolvedValue(null);
    httpPost = jest.fn().mockReturnValue(of({ data: {} }));
    const config = { get: configGet } as unknown as NotificationsConfigService;
    const http = { post: httpPost } as unknown as HttpService;
    service = new NotificationsSlackService(config, http);
  });

  describe('sendSimpleSlack', () => {
    it('is a no-op when no webhook is configured', async () => {
      await service.sendSimpleSlack('hello');
      expect(httpPost).not.toHaveBeenCalled();
    });

    it('POSTs to the configured webhook URL', async () => {
      configGet.mockResolvedValue('https://hooks.slack.com/services/test');
      await service.sendSimpleSlack('hello');
      expect(httpPost).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        { text: 'hello' },
        { timeout: 8000 },
      );
    });

    it('never throws when POST fails', async () => {
      configGet.mockResolvedValue('https://hooks.slack.com/services/test');
      httpPost.mockReturnValue(throwError(() => new Error('network down')));
      await expect(service.sendSimpleSlack('hello')).resolves.toBeUndefined();
    });
  });

  describe('sendDeploymentSlack', () => {
    it('is a no-op when no webhook is configured', async () => {
      await service.sendDeploymentSlack(deployPayload);
      expect(httpPost).not.toHaveBeenCalled();
    });

    it('includes attachment with color for SUCCESS', async () => {
      configGet.mockImplementation((k: string) =>
        Promise.resolve(
          k === CONFIG_KEYS.SLACK_WEBHOOK
            ? 'https://hooks.slack.com/services/test'
            : null,
        ),
      );
      await service.sendDeploymentSlack({
        ...deployPayload,
        status: 'SUCCESS',
      });
      expect(httpPost).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        expect.objectContaining({
          attachments: [expect.objectContaining({ color: '#36a64f' })],
        }),
        expect.anything(),
      );
    });

    it('uses red color for FAILED', async () => {
      configGet.mockImplementation((k: string) =>
        Promise.resolve(
          k === CONFIG_KEYS.SLACK_WEBHOOK
            ? 'https://hooks.slack.com/services/test'
            : null,
        ),
      );
      await service.sendDeploymentSlack({ ...deployPayload, status: 'FAILED' });
      expect(httpPost).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        expect.objectContaining({
          attachments: [expect.objectContaining({ color: '#dc2626' })],
        }),
        expect.anything(),
      );
    });

    it('includes pipeline link block when pipelineUrl is provided', async () => {
      configGet.mockResolvedValue('https://hooks.slack.com/services/test');
      await service.sendDeploymentSlack({
        ...deployPayload,
        pipelineUrl: 'https://gitlab.com/pipeline/1',
      });
      const callBody = httpPost.mock.calls[0][1] as {
        attachments: Array<{ blocks: unknown[] }>;
      };
      expect(callBody.attachments[0].blocks).toHaveLength(3);
    });

    it('never throws when POST fails', async () => {
      configGet.mockResolvedValue('https://hooks.slack.com/services/test');
      httpPost.mockReturnValue(throwError(() => new Error('timeout')));
      await expect(
        service.sendDeploymentSlack(deployPayload),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendDockerConnectionSlack', () => {
    it('sends DOWN block when recovered=false', async () => {
      configGet.mockResolvedValue('https://hooks.slack.com/services/test');
      const p = {
        serverId: 's1',
        serverName: 'srv',
        endpoint: 'tcp://10.0.0.1:2376',
        lastError: 'refused',
        failedSince: new Date(),
      };
      await service.sendDockerConnectionSlack(p, false);
      const body = httpPost.mock.calls[0][1] as {
        blocks: Array<{ text?: { text: string } }>;
      };
      expect(body.blocks[0].text?.text).toContain('INJOIGNABLE');
    });

    it('sends RECOVERED block when recovered=true', async () => {
      configGet.mockResolvedValue('https://hooks.slack.com/services/test');
      const p = { serverId: 's1', endpoint: 'tcp://x:2376' };
      await service.sendDockerConnectionSlack(p, true);
      const body = httpPost.mock.calls[0][1] as {
        blocks: Array<{ text?: { text: string } }>;
      };
      expect(body.blocks[0].text?.text).toContain('RÉCUPÉRÉ');
    });

    it('never throws when POST fails', async () => {
      configGet.mockResolvedValue('https://hooks.slack.com/services/test');
      httpPost.mockReturnValue(throwError(() => new Error('down')));
      const p = {
        serverId: 's1',
        endpoint: 'tcp://x',
        lastError: '',
        failedSince: new Date(),
      };
      await expect(
        service.sendDockerConnectionSlack(p, false),
      ).resolves.toBeUndefined();
    });
  });
});
