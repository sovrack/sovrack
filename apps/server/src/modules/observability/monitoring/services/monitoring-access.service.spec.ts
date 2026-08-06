import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { MonitoringAccessService } from './monitoring-access.service';

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
    projectMember: {
      findUnique: jest.fn().mockResolvedValue(overrides.member ?? null),
    },
    serviceEnvironment: {
      findUnique: jest.fn().mockResolvedValue(overrides.serviceEnv ?? null),
    },
    deployment: {
      findUnique: jest.fn().mockResolvedValue(overrides.deployment ?? null),
    },
  };
  return {
    svc: new MonitoringAccessService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('MonitoringAccessService', () => {
  it('rejects a SUPER_ADMIN who is not a project member (403)', async () => {
    const { svc } = makeService({});
    await expect(
      svc.assertProject('p1', 'u1', Role.SUPER_ADMIN),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a DEVELOPER who is a project member', async () => {
    const { svc } = makeService({ member: { role: 'DEVELOPER' } });
    await expect(
      svc.assertProject('p1', 'u1', Role.MEMBER),
    ).resolves.toBeUndefined();
  });

  it('rejects a DEVELOPER who is NOT a member (403)', async () => {
    const { svc } = makeService({ member: null });
    await expect(svc.assertProject('p1', 'u1', Role.MEMBER)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('resolves the project through the service-environment', async () => {
    const { svc, prisma } = makeService({
      serviceEnv: { service: { projectId: 'p9' } },
      member: { role: 'DEVELOPER' },
    });
    await svc.assertServiceEnv('se1', 'u1', Role.MEMBER);
    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_userId: { projectId: 'p9', userId: 'u1' } },
      }),
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
      ForbiddenException,
    );
  });
});
