import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AutomationRunnerService } from './automation-runner.service';

describe('AutomationRunnerService — pure helpers', () => {
  let configGet: jest.Mock;
  let service: AutomationRunnerService;

  const priv = <T>(name: string, ...args: unknown[]): T =>
    (service as unknown as Record<string, (...a: unknown[]) => T>)[name](
      ...args,
    );

  beforeEach(() => {
    configGet = jest.fn((_k: string, def?: string) => def);
    service = new AutomationRunnerService(
      {} as unknown as PrismaService,
      {} as never,
      {} as never,
      { get: configGet } as unknown as ConfigService,
      {} as never,
      {} as never,
    );
  });

  describe('resolveRunConfig', () => {
    it('parses string roles and keeps a custom executor', () => {
      const cfg = priv<{ roles: string[]; gitlabRunnerExecutor: string }>(
        'resolveRunConfig',
        {
          selected_roles: ['docker', ' nginx '],
          gitlabRunnerExecutor: 'shell',
        },
      );
      expect(cfg.roles).toEqual(['docker', 'nginx']);
      expect(cfg.gitlabRunnerExecutor).toBe('shell');
    });

    it('defaults executor to docker and roles to [] for junk input', () => {
      expect(priv('resolveRunConfig', null)).toEqual({
        roles: [],
        gitlabRunnerExecutor: 'docker',
      });
      const cfg = priv<{ roles: string[] }>('resolveRunConfig', {
        selected_roles: [1, '', 'docker'],
      });
      expect(cfg.roles).toEqual(['docker']); // non-strings/empties filtered
    });
  });

  describe('resolveTargetTimeoutMs', () => {
    it('uses a valid configured timeout (>=60s)', () => {
      configGet.mockReturnValue('120000');
      expect(priv<number>('resolveTargetTimeoutMs')).toBe(120000);
    });
    it('falls back to 600000 for too-small or invalid values', () => {
      configGet.mockReturnValue('5000');
      expect(priv<number>('resolveTargetTimeoutMs')).toBe(600000);
      configGet.mockReturnValue('not-a-number');
      expect(priv<number>('resolveTargetTimeoutMs')).toBe(600000);
    });
  });

  describe('redactSecrets', () => {
    it('redacts private keys, tokens and passwords', () => {
      const out = priv<string>(
        'redactSecrets',
        'ansible --private-key /tmp/id_rsa register --registration-token GLRT-abc token=xyz password=hunter2',
      );
      expect(out).toContain('--private-key [redacted]');
      expect(out).toContain('registration-token [redacted]');
      expect(out).toContain('token=[redacted]');
      expect(out).toContain('password=[redacted]');
      expect(out).not.toContain('hunter2');
      expect(out).not.toContain('GLRT-abc');
    });
  });
});
