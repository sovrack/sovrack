import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { ServiceEnvironmentsService } from './service-environments.service';
import { ProjectAccessService } from '../authorization/project-access.service';

describe('ServiceEnvironmentsService', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
    service: { findFirst: jest.Mock };
    environment: { findFirst: jest.Mock; findMany: jest.Mock };
    serviceEnvironment: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    domain: { count: jest.Mock };
  };
  let crypto: { encryptOptional: jest.Mock };
  let service: ServiceEnvironmentsService;

  const dto = { serviceId: 'svc1', environmentId: 'env1' };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      projectMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ role: ProjectRole.MAINTAINER }),
      },
      service: { findFirst: jest.fn().mockResolvedValue({ id: 'svc1' }) },
      environment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'env1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceEnvironment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'se1' }),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'se1', ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'se1', ...data }),
          ),
      },
      domain: { count: jest.fn().mockResolvedValue(0) },
    };
    crypto = {
      encryptOptional: jest.fn((v?: string | null) => (v ? `enc:${v}` : null)),
    };
    service = new ServiceEnvironmentsService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      new ProjectAccessService(
        prisma as unknown as PrismaService,
        {
          assertProjectAction: jest.fn().mockImplementation(async () => {
            const member = await prisma.projectMember.findUnique();
            if (!member) throw new NotFoundException('Projet introuvable');
            if (member.role !== ProjectRole.MAINTAINER) {
              throw new ForbiddenException('Action projet interdite');
            }
          }),
        } as never,
      ),
    );
  });

  it('creates a fresh link and encrypts secretsEnv', async () => {
    await service.link(
      'p1',
      { ...dto, secretsEnv: 'K=v' } as never,
      'admin',
      Role.OWNER,
    );
    expect(crypto.encryptOptional).toHaveBeenCalledWith('K=v');
    expect(prisma.serviceEnvironment.create).toHaveBeenCalled();
  });

  // A9 harmonization (see EXPLORATION_BACKEND_DEPENDANCES.md): overrides now
  // use encryptOptional like ServicesService, so an explicit '' clears the
  // secret (→ null) instead of persisting an encrypted empty string.
  it('clears secretsEnv (→ null) when an empty string is submitted', async () => {
    await service.link(
      'p1',
      { ...dto, secretsEnv: '' } as never,
      'admin',
      Role.OWNER,
    );
    expect(crypto.encryptOptional).toHaveBeenCalledWith('');
    expect(prisma.serviceEnvironment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secretsEnv: null }),
      }),
    );
  });

  it('rejects linking when the service is not in the project', async () => {
    prisma.service.findFirst.mockResolvedValue(null);
    await expect(
      service.link('p1', dto as never, 'admin', Role.OWNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conflicts when an active link already exists', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      id: 'se1',
      archivedAt: null,
    });
    await expect(
      service.link('p1', dto as never, 'admin', Role.OWNER),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivates an archived link instead of creating a new row', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      id: 'se1',
      archivedAt: new Date(),
    });
    await service.link('p1', dto as never, 'admin', Role.OWNER);
    expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archivedAt: null }),
      }),
    );
    expect(prisma.serviceEnvironment.create).not.toHaveBeenCalled();
  });

  it('bumps generation on update', async () => {
    await service.update(
      'p1',
      'se1',
      { port: 8080 } as never,
      'admin',
      Role.OWNER,
    );
    expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ generation: { increment: 1 } }),
      }),
    );
  });

  // C6: the 5 per-environment overrides must accept an explicit null to
  // clear back to "inherit from the parent Service" — verified end to end
  // here since it depends on IsOptional's null-vs-undefined distinction at
  // the DTO layer, not just this service's own logic.
  describe('update — the 5 override fields (C6)', () => {
    it.each([
      ['branch', 'develop'],
      ['port', 4000],
      ['startCommand', 'npm run start:staging'],
      ['healthcheckPath', '/health'],
      ['buildPack', 'NIXPACKS'],
    ])('sets %s when a real value is submitted', async (field, value) => {
      await service.update(
        'p1',
        'se1',
        { [field]: value } as never,
        'admin',
        Role.OWNER,
      );
      expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ [field]: value }),
        }),
      );
    });

    it.each(['branch', 'port', 'startCommand', 'healthcheckPath', 'buildPack'])(
      'clears %s to null when explicitly submitted as null',
      async (field) => {
        await service.update(
          'p1',
          'se1',
          { [field]: null } as never,
          'admin',
          Role.OWNER,
        );
        expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ [field]: null }),
          }),
        );
      },
    );

    it('leaves the 5 overrides untouched when omitted from the payload', async () => {
      await service.update(
        'p1',
        'se1',
        { env: '{}' } as never,
        'admin',
        Role.OWNER,
      );
      const data = (
        prisma.serviceEnvironment.update.mock.calls[0][0] as {
          data: Record<string, unknown>;
        }
      ).data;
      for (const field of [
        'branch',
        'port',
        'startCommand',
        'healthcheckPath',
        'buildPack',
      ]) {
        expect(field in data).toBe(false);
      }
    });
  });

  it('blocks unlink while domains still point to the link', async () => {
    prisma.domain.count.mockResolvedValue(2);
    await expect(
      service.unlink('p1', 'se1', 'admin', Role.OWNER),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-deletes on unlink when no domains are attached', async () => {
    prisma.domain.count.mockResolvedValue(0);
    await service.unlink('p1', 'se1', 'admin', Role.OWNER);
    expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );
  });

  it('forbids a non-owner member from managing (link)', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(
      service.link('p1', dto as never, 'u2', Role.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
