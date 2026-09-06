import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PasswordHasher } from '../security/password-hasher.service';
import { UsersService } from './users.service';

// Deterministic, fast password hashing for tests (mirrors the legacy
// `hashed:<pw>` shape the assertions rely on).
const passwordHasher = {
  hash: jest.fn((pw: string) => Promise.resolve(`hashed:${pw}`)),
  verify: jest.fn((hash: string, pw: string) =>
    Promise.resolve(hash === `hashed:${pw}`),
  ),
  needsRehash: jest.fn(() => false),
};

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'a@b.com',
  password: 'hashed:current',
  fullName: 'A B',
  role: Role.MEMBER,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('UsersService', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    teamMember: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([userRow()]),
        count: jest.fn().mockResolvedValue(1),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(userRow(data))),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(userRow(data))),
        delete: jest.fn().mockResolvedValue(userRow()),
      },
      teamMember: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      passwordHasher as unknown as PasswordHasher,
    );
  });

  it('hashes the password, defaults role to DEVELOPER, and strips the hash', async () => {
    const res = await service.create({
      email: 'new@b.com',
      password: 'pw',
      fullName: 'N',
    } as never);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: 'hashed:pw',
          role: Role.MEMBER,
        }),
      }),
    );
    expect(res).not.toHaveProperty('password');
  });

  it('rejects a duplicate email', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    await expect(
      service.create({
        email: 'a@b.com',
        password: 'x',
        fullName: 'X',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('paginates findAll when page + limit are given', async () => {
    const res = await service.findAll({ page: 1, limit: 10 } as never);
    expect(prisma.user.count).toHaveBeenCalled();
    expect(res).toHaveProperty('data');
  });

  it('forbids a non-admin from updating another user', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    await expect(
      service.update('u1', { fullName: 'X' }, { id: 'u2', role: Role.MEMBER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a non-admin from changing role/isActive (even on self)', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    await expect(
      service.update(
        'u1',
        { role: Role.OWNER },
        { id: 'u1', role: Role.MEMBER },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a password change when the current password is wrong', async () => {
    prisma.user.findUnique.mockResolvedValue(
      userRow({ password: 'hashed:other' }),
    );
    await expect(
      service.update(
        'u1',
        {
          currentPassword: 'wrong',
          newPassword: 'newpw',
          confirmNewPassword: 'newpw',
        },
        { id: 'u1', role: Role.MEMBER },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a password change when confirmation mismatches', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    await expect(
      service.changeMyPassword('u1', {
        currentPassword: 'current',
        newPassword: 'a',
        confirmNewPassword: 'b',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password when the current one matches', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    await service.changeMyPassword('u1', {
      currentPassword: 'current',
      newPassword: 'newpw',
      confirmNewPassword: 'newpw',
    } as never);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          password: 'hashed:newpw',
          sessionVersion: { increment: 1 },
        },
      }),
    );
  });

  it('404s when toggling a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.toggleActive('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
