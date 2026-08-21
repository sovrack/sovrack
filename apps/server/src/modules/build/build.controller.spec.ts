import { Role } from '@prisma/client';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { BuildDetectorService } from './detection/build-detector.service';
import { BuildOrchestratorService } from './build-orchestrator.service';
import { BuildSetupService } from './lifecycle/build-setup.service';
import { BuildLifecycleService } from './lifecycle/build-lifecycle.service';
import { BuildController } from './build.controller';

describe('BuildController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;
  const workspaceId = 'workspace-1';

  function build() {
    const buildService = {
      generateBuildFiles: jest.fn().mockResolvedValue({ ok: true }),
      assertCanConfigureBuild: jest.fn().mockResolvedValue(undefined),
      pushFiles: jest.fn().mockResolvedValue(undefined),
    } as unknown as BuildOrchestratorService;
    const setupService = {
      updateBuildConfig: jest.fn().mockResolvedValue(undefined),
      getTemplates: jest.fn().mockResolvedValue([]),
      generateAll: jest.fn().mockResolvedValue([]),
      getBuildStatus: jest.fn().mockResolvedValue({ ready: true }),
      extractComposeFile: jest.fn().mockResolvedValue({ content: 'x' }),
      getAvailableEngines: jest.fn().mockResolvedValue(['DOCKERFILE']),
    } as unknown as BuildSetupService;
    const detector = {
      detectProjectType: jest.fn().mockResolvedValue({ type: 'NODE' }),
    } as unknown as BuildDetectorService;
    const buildsService = {
      listForProject: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'b1', projectId: 'p1' }),
    } as unknown as BuildLifecycleService;
    const workspaceAccess = {
      assertProjectAction: jest.fn().mockResolvedValue({
        effectiveProjectRole: 'VIEWER',
      }),
    };
    const ctrl = new BuildController(
      buildService,
      setupService,
      detector,
      buildsService,
      workspaceAccess as never,
    );
    return {
      ctrl,
      buildService,
      setupService,
      detector,
      buildsService,
      workspaceAccess,
    };
  }

  it('generateBuildFiles forwards overwrite flags', async () => {
    const { ctrl, buildService } = build();
    await ctrl.generateBuildFiles(
      'p1',
      user,
      's1',
      {
        overwriteDockerfile: true,
        overwriteGitlabCi: false,
      } as never,
      workspaceId,
    );
    expect(buildService.generateBuildFiles).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      's1',
      true,
      false,
      workspaceId,
    );
  });

  it('detect asserts access then delegates to the detector', async () => {
    const { ctrl, buildService, detector } = build();
    await ctrl.detect('p1', user, 's1', workspaceId);
    expect(buildService.assertCanConfigureBuild).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      workspaceId,
    );
    expect(detector.detectProjectType).toHaveBeenCalledWith('p1', 's1');
  });

  it('updateConfig delegates and returns a message', async () => {
    const { ctrl, setupService } = build();
    const res = await ctrl.updateConfig(
      'p1',
      user,
      { buildPack: 'NIXPACKS' } as never,
      's1',
      workspaceId,
    );
    expect(setupService.updateBuildConfig).toHaveBeenCalledWith(
      'p1',
      { buildPack: 'NIXPACKS' },
      'user-1',
      Role.OWNER,
      's1',
      workspaceId,
    );
    expect(res).toEqual({ message: 'Configuration mise à jour' });
  });

  it('pushFiles delegates and returns a message', async () => {
    const { ctrl, buildService } = build();
    const res = await ctrl.pushFiles('p1', user, 's1', workspaceId);
    expect(buildService.pushFiles).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      's1',
      workspaceId,
    );
    expect(res).toEqual({ message: 'Fichiers poussés avec succès' });
  });

  it('templates / generateAll / engines delegate', async () => {
    const { ctrl, setupService } = build();
    await ctrl.getTemplates('p1', user, workspaceId);
    await ctrl.generateAll('p1', user, workspaceId);
    await ctrl.getAvailableEngines('p1', user, workspaceId);
    expect(setupService.getTemplates).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      workspaceId,
    );
    expect(setupService.generateAll).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      workspaceId,
    );
    expect(setupService.getAvailableEngines).toHaveBeenCalled();
  });

  it('getBuildStatus / extractComposeFile assert access first', async () => {
    const { ctrl, buildService, setupService } = build();
    await ctrl.getBuildStatus('p1', user, workspaceId);
    await ctrl.extractComposeFile('p1', user, 's1', workspaceId);
    expect(buildService.assertCanConfigureBuild).toHaveBeenCalledTimes(2);
    expect(setupService.getBuildStatus).toHaveBeenCalledWith('p1');
    expect(setupService.extractComposeFile).toHaveBeenCalledWith('p1', 's1');
  });

  it('listBuilds clamps the limit and forwards filters', async () => {
    const { ctrl, buildsService } = build();
    await ctrl.listBuilds(
      'p1',
      user,
      'SUCCESS' as never,
      'main',
      '999',
      workspaceId,
    );
    expect(buildsService.listForProject).toHaveBeenCalledWith('p1', {
      status: 'SUCCESS',
      branch: 'main',
      limit: 200,
    });
    await ctrl.listBuilds(
      'p1',
      user,
      undefined,
      undefined,
      undefined,
      workspaceId,
    );
    expect(buildsService.listForProject).toHaveBeenCalledWith('p1', {
      limit: 50,
    });
  });

  it('getBuild delegates to the lifecycle service', async () => {
    const { ctrl, buildsService } = build();
    await ctrl.getBuild('b1', user, workspaceId);
    expect(buildsService.findOne).toHaveBeenCalledWith('b1');
  });
});
