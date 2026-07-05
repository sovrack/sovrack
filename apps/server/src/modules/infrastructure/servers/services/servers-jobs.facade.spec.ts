import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServerJobType, ServerOnboardingStep } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersJobsService } from './servers-jobs.service';
import { ServersConnectionService } from './servers-connection.service';
import { ServersDetectionService } from './servers-detection.service';
import { ServerSetupService } from '../../onboarding/services/infra-setup.service';
import { ServersAuditService } from './servers-audit.service';
import { ServersVerificationService } from './servers-verification.service';
import { ServersJobsFacade } from './servers-jobs.facade';

describe('ServersJobsFacade', () => {
  function build(
    server: Record<string, unknown> | null = { id: 'srv-1', name: 'web' },
  ) {
    const prisma = {
      server: { findUnique: jest.fn().mockResolvedValue(server) },
      serverJob: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const jobs = {
      listJobs: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      forceFailJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      retryJob: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      createJobAtomic: jest.fn().mockResolvedValue({ id: 'job-1' }),
      executeJobWithRetry: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServersJobsService;
    const ssh = {
      verifyServerDirect: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      registerRunnerAndVerify: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      installPublicKey: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'installed' }),
    } as unknown as ServersConnectionService;
    const detection = {
      detect: jest.fn().mockResolvedValue({ id: 'srv-1' }),
    } as unknown as ServersDetectionService;
    const preparation = {
      startPreparation: jest.fn().mockResolvedValue({ id: 'prep-1' }),
    } as unknown as ServerSetupService;
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServersAuditService;
    const verification = {
      startVerification: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServersVerificationService;
    const facade = new ServersJobsFacade(
      prisma,
      jobs,
      ssh,
      detection,
      preparation,
      audit,
      verification,
    );
    return {
      facade,
      prisma,
      jobs,
      ssh,
      detection,
      preparation,
      audit,
      verification,
    };
  }

  describe('loadActiveJobs', () => {
    it('returns an empty map for no server ids (no DB query)', async () => {
      const { facade, prisma } = build();
      const map = await facade.loadActiveJobs([]);
      expect(map.size).toBe(0);
      expect(prisma.serverJob.findMany).not.toHaveBeenCalled();
    });

    it('keeps only the latest active job per server', async () => {
      const { facade, prisma } = build();
      (prisma.serverJob.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'j1',
          serverId: 'srv-1',
          type: 'VERIFY',
          status: 'RUNNING',
          startedAt: null,
          createdAt: new Date(),
          error: null,
        },
        {
          id: 'j2',
          serverId: 'srv-1',
          type: 'VERIFY',
          status: 'PENDING',
          startedAt: null,
          createdAt: new Date(),
          error: null,
        },
        {
          id: 'j3',
          serverId: 'srv-2',
          type: 'PREPARE_SERVER',
          status: 'RUNNING',
          startedAt: null,
          createdAt: new Date(),
          error: null,
        },
      ]);
      const map = await facade.loadActiveJobs(['srv-1', 'srv-2']);
      expect(map.size).toBe(2);
      expect(map.get('srv-1')?.id).toBe('j1');
      expect(map.get('srv-2')?.id).toBe('j3');
    });
  });

  describe('delegation', () => {
    it('listJobs / cancelJob / retryJob delegate to the jobs service', async () => {
      const { facade, jobs } = build();
      await facade.listJobs('srv-1');
      await facade.cancelJob('srv-1', 'job-1');
      await facade.retryJob('srv-1', 'job-1');
      expect(jobs.listJobs).toHaveBeenCalledWith('srv-1', undefined);
      expect(jobs.forceFailJob).toHaveBeenCalledWith('srv-1', 'job-1');
      expect(jobs.retryJob).toHaveBeenCalledWith(
        'srv-1',
        'job-1',
        expect.objectContaining({
          verify: expect.any(Function),
          install: expect.any(Function),
          prepare: expect.any(Function),
        }),
      );
    });
  });

  describe('verifyServer', () => {
    it('rejects verification when the SSH key is not yet installed', async () => {
      const { facade } = build({
        id: 'srv-1',
        onboardingStep: ServerOnboardingStep.PENDING,
        isVerified: false,
      });
      await expect(facade.verifyServer('srv-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('creates a VERIFY job and records an audit event', async () => {
      const { facade, jobs, audit } = build({
        id: 'srv-1',
        onboardingStep: ServerOnboardingStep.READY,
        isVerified: true,
      });
      await facade.verifyServer('srv-1', 'user-1');
      expect(jobs.createJobAtomic).toHaveBeenCalledWith(
        'srv-1',
        ServerJobType.VERIFY,
      );
      expect(audit.record).toHaveBeenCalledWith(
        'srv-1',
        'SERVER_VALIDATE_SSH',
        'user-1',
        { jobId: 'job-1' },
      );
    });

    it('throws NotFound when the server does not exist', async () => {
      const { facade } = build(null);
      await expect(facade.verifyServer('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('installTools / prepareServer', () => {
    it('installTools maps to a preparation payload and delegates', async () => {
      const { facade, preparation } = build();
      await facade.installTools('srv-1', {
        docker: true,
        runner: true,
      } as never);
      expect(preparation.startPreparation).toHaveBeenCalledWith(
        'srv-1',
        expect.objectContaining({
          docker: true,
          gitlabRunner: true,
          systemUpdate: true,
        }),
        undefined,
      );
    });

    it('prepareServer delegates to the preparation service', async () => {
      const { facade, preparation } = build();
      await facade.prepareServer(
        'srv-1',
        { profile: 'BASIC' } as never,
        'user-1',
      );
      expect(preparation.startPreparation).toHaveBeenCalledWith(
        'srv-1',
        { profile: 'BASIC' },
        'user-1',
      );
    });
  });

  describe('installPublicKey', () => {
    it('installs the key and records an audit event', async () => {
      const { facade, ssh, audit } = build();
      const result = await facade.installPublicKey('srv-1', 'pw', 'user-1');
      expect(ssh.installPublicKey).toHaveBeenCalledWith('srv-1', 'pw');
      expect(audit.record).toHaveBeenCalledWith(
        'srv-1',
        'SERVER_INSTALL_SSH_KEY',
        'user-1',
        { success: true },
      );
      expect(result.success).toBe(true);
    });
  });

  describe('pingServer', () => {
    it('throws NotFound when the server is missing', async () => {
      const { facade } = build(null);
      await expect(facade.pingServer('ghost', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns ok=false with a message when verification throws', async () => {
      const { facade, verification } = build({
        id: 'srv-1',
        onboardingStep: ServerOnboardingStep.READY,
        isVerified: true,
      });
      (verification.startVerification as jest.Mock).mockRejectedValueOnce(
        new Error('ssh refused'),
      );
      const result = await facade.pingServer('srv-1', 'user-1');
      expect(result).toEqual({ ok: false, message: 'ssh refused' });
    });
  });

  describe('toErrorMessage', () => {
    it('extracts a string response from a BadRequestException', () => {
      const { facade } = build();
      expect(facade.toErrorMessage(new BadRequestException('boom'))).toBe(
        'boom',
      );
    });

    it('extracts the message field from an object response', () => {
      const { facade } = build();
      const err = new BadRequestException({
        message: 'detailed',
        statusCode: 400,
      });
      expect(facade.toErrorMessage(err)).toBe('detailed');
    });

    it('returns the message of a plain Error', () => {
      const { facade } = build();
      expect(facade.toErrorMessage(new Error('plain'))).toBe('plain');
    });

    it('falls back to a default message for unknown values', () => {
      const { facade } = build();
      expect(facade.toErrorMessage(42)).toBe('Exécution distante échouée');
    });
  });
});
