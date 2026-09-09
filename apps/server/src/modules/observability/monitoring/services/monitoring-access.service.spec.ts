import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { MonitoringAccessService } from './monitoring-access.service';
import { ProjectActions } from '../../../iam/authorization/workspace-policy.types';

/**
 * LOT1a : les routes monitoring scopées projet sont ouvertes aux DEVELOPER —
 * mais UNIQUEMENT membres du projet. Régression du bug « 403 sur tout
 * l'onglet Monitoring pour un développeur » sans ouvrir les données
 * cross-projet.
 */
function makeService(overrides: {
  member?: unknown;
  serviceEnv?: unknown;
  deployment?: unknown;
}) {
  const prisma = {
    serviceEnvironment: {
      findUnique: jest.fn().mockResolvedValue(overrides.serviceEnv ?? null),
    },
    deployment: {
      findUnique: jest.fn().mockResolvedValue(overrides.deployment ?? null),
    },
  };
  const workspaceAccess = {
    assertProjectAction:
      overrides.member === null || overrides.member === undefined
        ? jest
            .fn()
            .mockRejectedValue(new NotFoundException('Projet introuvable'))
        : jest.fn().mockResolvedValue({ effectiveProjectRole: 'DEVELOPER' }),
  };
  return {
    svc: new MonitoringAccessService(
      prisma as unknown as PrismaService,
      workspaceAccess as never,
    ),
    prisma,
    workspaceAccess,
  };
}

describe('MonitoringAccessService', () => {
  it('hides a project from an identity without workspace/project access', async () => {
    const { svc } = makeService({});
    await expect(svc.assertProject('p1', 'u1', Role.OWNER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('allows a DEVELOPER who is a project member', async () => {
    const { svc } = makeService({ member: { role: 'DEVELOPER' } });
    await expect(
      svc.assertProject('p1', 'u1', Role.MEMBER),
    ).resolves.toBeUndefined();
  });

  it('hides a project from a workspace member without project membership', async () => {
    const { svc } = makeService({ member: null });
    await expect(svc.assertProject('p1', 'u1', Role.MEMBER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolves the project through the service-environment', async () => {
    const { svc, workspaceAccess } = makeService({
      serviceEnv: { service: { projectId: 'p9' } },
      member: { role: 'DEVELOPER' },
    });
    await svc.assertServiceEnv('se1', 'u1', Role.MEMBER);
    expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
      'p9',
      'u1',
      ProjectActions.READ,
      undefined,
    );
  });

  it('404s on unknown service-environment / deployment', async () => {
    const { svc } = makeService({});
    await expect(
      svc.assertServiceEnv('ghost', 'u1', Role.MEMBER),
    ).rejects.toThrow(NotFoundException);
    await expect(
      svc.assertDeployment('ghost', 'u1', Role.MEMBER),
    ).rejects.toThrow(NotFoundException);
  });

  it('resolves the project through the deployment', async () => {
    const { svc } = makeService({
      deployment: { projectId: 'p2' },
      member: null,
    });
    await expect(svc.assertDeployment('d1', 'u1', Role.MEMBER)).rejects.toThrow(
      NotFoundException,
    );
  });
});
