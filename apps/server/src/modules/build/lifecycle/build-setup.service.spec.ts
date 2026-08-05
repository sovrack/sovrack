import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BuildOrchestratorService } from '../build-orchestrator.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { NixpacksService } from '../engines/nixpacks/nixpacks.service';
import { BuildSetupService } from './build-setup.service';

describe('BuildSetupService', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    service: { findMany: jest.Mock; updateMany: jest.Mock };
    gitProviderRepo: { findFirst: jest.Mock };
  };
  let buildService: {
    assertCanConfigureBuild: jest.Mock;
    prepareServiceInternal: jest.Mock;
  };
  let service: BuildSetupService;

  beforeEach(() => {
    prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', name: 'P' }),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([{ id: 'svc1', name: 'api' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      gitProviderRepo: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    buildService = {
      assertCanConfigureBuild: jest.fn().mockResolvedValue(undefined),
      prepareServiceInternal: jest.fn().mockResolvedValue({
        serviceResult: { serviceId: 'svc1', status: 'SUCCESS' },
      }),
    };
    service = new BuildSetupService(
      prisma as unknown as PrismaService,
      buildService as unknown as BuildOrchestratorService,
      {} as unknown as SourceProvidersService,
      {} as unknown as NixpacksService,
    );
  });

  it('returns the supported template types after an auth check', async () => {
    const res = await service.getTemplates('p1', 'admin', Role.OWNER);
    expect(buildService.assertCanConfigureBuild).toHaveBeenCalled();
    expect(res.types).toContain('nestjs');
    expect(res.types).toContain('static');
  });

  it('updateBuildConfig 404s when the project is missing', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(
      service.updateBuildConfig(
        'nope',
        { projectType: 'nodejs' } as never,
        'admin',
        Role.OWNER,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateBuildConfig maps DTO fields and updates the project services', async () => {
    await service.updateBuildConfig(
      'p1',
      { projectType: 'nodejs', buildPort: 4000 } as never,
      'admin',
      Role.OWNER,
    );
    expect(prisma.service.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ buildType: 'nodejs', port: 4000 }),
      }),
    );
  });

  it('generateAll rejects a project with neither services nor a provider', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    prisma.gitProviderRepo.findFirst.mockResolvedValue(null);
    await expect(
      service.generateAll('p1', 'admin', Role.OWNER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generateAll prepares each service and returns its result', async () => {
    const res = await service.generateAll('p1', 'admin', Role.OWNER);
    expect(buildService.prepareServiceInternal).toHaveBeenCalledWith(
      'p1',
      'svc1',
    );
    expect(res.results[0].status).toBe('SUCCESS');
  });

  it('generateAll captures a per-service FAILED result on error', async () => {
    buildService.prepareServiceInternal.mockRejectedValue(new Error('boom'));
    const res = await service.generateAll('p1', 'admin', Role.OWNER);
    expect(res.results[0].status).toBe('FAILED');
    expect(res.results[0].message).toBe('boom');
  });
});
