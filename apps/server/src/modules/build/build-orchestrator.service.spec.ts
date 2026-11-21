import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { BuildDetectorService } from './detection/build-detector.service';
import { CiGeneratorFactory } from './generation/ci/ci-generator.factory';
import { SourceProvidersService } from '../source-providers/source-providers.service';
import { BuildOrchestratorService } from './build-orchestrator.service';
import { WorkspaceAccessService } from '../iam/authorization/workspace-access.service';
import { ProjectActions } from '../iam/authorization/workspace-policy.types';

describe('BuildOrchestratorService', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    service: { findFirst: jest.Mock; update: jest.Mock };
    pipelineRun: { findFirst: jest.Mock };
  };
  let detector: { detectProjectType: jest.Mock };
  let dockerfileGen: { generate: jest.Mock };
  let dockerignoreGen: { generate: jest.Mock };
  let ciFactory: { forProject: jest.Mock };
  let providers: { forProject: jest.Mock; forService: jest.Mock };
  let provider: { writeFiles: jest.Mock };
  let workspaceAccess: { assertProjectAction: jest.Mock };
  let service: BuildOrchestratorService;

  beforeEach(() => {
    provider = {
      writeFiles: jest
        .fn()
        .mockResolvedValue({ fileStatuses: { Dockerfile: 'CREATED' } }),
    };
    prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', name: 'P' }),
      },
      service: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'svc1', name: 'api', branch: 'main' }),
        update: jest.fn().mockResolvedValue({}),
      },
      pipelineRun: {
        findFirst: jest.fn().mockResolvedValue({ webUrl: 'http://ci' }),
      },
    };
    detector = {
      detectProjectType: jest.fn().mockResolvedValue({
        type: 'NODE',
        recommendedBuildType: 'NODE',
        recommendedPort: 3000,
        recommendedStartCommand: 'node dist/main',
        confidence: 0.9,
        reasons: [],
      }),
    };
    dockerfileGen = { generate: jest.fn().mockReturnValue('FROM node:20') };
    dockerignoreGen = { generate: jest.fn().mockReturnValue('node_modules') };
    ciFactory = {
      forProject: jest.fn().mockResolvedValue({
        generate: jest.fn().mockReturnValue('ci: yaml'),
        getFilePath: jest.fn().mockReturnValue('.gitlab-ci.yml'),
      }),
    };
    providers = {
      forProject: jest.fn().mockResolvedValue(provider),
      forService: jest.fn().mockResolvedValue(provider),
    };
    workspaceAccess = {
      assertProjectAction: jest.fn().mockResolvedValue({}),
    };
    service = new BuildOrchestratorService(
      prisma as unknown as PrismaService,
      detector as unknown as BuildDetectorService,
      dockerfileGen,
      dockerignoreGen,
      ciFactory as unknown as CiGeneratorFactory,
      providers as unknown as SourceProvidersService,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  describe('assertCanConfigureBuild', () => {
    it('allows a project member authorized by the central policy', async () => {
      await expect(
        service.assertCanConfigureBuild('p1', 'u1', Role.MEMBER, 'workspace-1'),
      ).resolves.toBeUndefined();
      expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
        'p1',
        'u1',
        ProjectActions.UPDATE,
        'workspace-1',
      );
    });

    it('hides the project from a non-member', async () => {
      workspaceAccess.assertProjectAction.mockRejectedValueOnce(
        new NotFoundException('Projet introuvable'),
      );
      await expect(
        service.assertCanConfigureBuild('p1', 'u2', Role.MEMBER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a VIEWER', async () => {
      workspaceAccess.assertProjectAction.mockRejectedValueOnce(
        new ForbiddenException('Action projet interdite'),
      );
      await expect(
        service.assertCanConfigureBuild('p1', 'u2', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a DEVELOPER member', async () => {
      await expect(
        service.assertCanConfigureBuild('p1', 'u2', Role.MEMBER),
      ).resolves.toBeUndefined();
    });
  });

  it('generates build files as PREVIEW (no repo write) and persists buildType on the service', async () => {
    const res = await service.generateBuildFiles(
      'p1',
      'u1',
      Role.MEMBER,
      'svc1',
    );
    expect(detector.detectProjectType).toHaveBeenCalledWith('p1', 'svc1');
    expect(res.dockerfileContent).toBe('FROM node:20');
    expect(res.ciConfigContent).toBe('ci: yaml');
    expect(prisma.service.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'svc1' } }),
    );
    // PREVIEW must NEVER write to the user's repo (no overwrite/conflict).
    // Repo writes only happen via the explicit /build/push-files action.
    expect(provider.writeFiles).not.toHaveBeenCalled();
  });

  it('404s prepareServiceInternal when the service is missing', async () => {
    prisma.service.findFirst.mockResolvedValue(null);
    await expect(
      service.generateBuildFiles('p1', 'u1', Role.MEMBER, 'ghost'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pushFiles 404s when the project is missing', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(
      service.pushFiles('nope', 'u1', Role.MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
