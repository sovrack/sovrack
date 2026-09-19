import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PasswordHasher } from '../security/password-hasher.service';
import { UsersService } from './users.service';

const passwordHasher = {
  hash: jest.fn((password: string) => Promise.resolve(`hashed:${password}`)),
  verify: jest.fn((hash: string, password: string) =>
    Promise.resolve(hash === `hashed:${password}`),
  ),
};

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'person@example.com',
  password: 'hashed:current',
  fullName: 'Person',
  role: Role.MEMBER,
  isActive: true,
  sessionVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('UsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.update.mockImplementation(({ data }) =>
      Promise.resolve(userRow({ password: data.password, sessionVersion: 1 })),
    );
    service = new UsersService(
      prisma as unknown as PrismaService,
      passwordHasher as unknown as PasswordHasher,
    );
  });

  it('exposes identity lookup for authentication services', async () => {
    await expect(service.findByEmail('person@example.com')).resolves.toEqual(
      expect.objectContaining({ id: 'user-1' }),
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'person@example.com' },
    });
  });

  it('rejects a password change for a missing identity', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.changeMyPassword('missing', {
        currentPassword: 'current',
        newPassword: 'new-password',
        confirmNewPassword: 'new-password',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a mismatched password confirmation', async () => {
    await expect(
      service.changeMyPassword('user-1', {
        currentPassword: 'current',
        newPassword: 'new-password',
        confirmNewPassword: 'different-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid current password', async () => {
    passwordHasher.verify.mockResolvedValueOnce(false);
    await expect(
      service.changeMyPassword('user-1', {
        currentPassword: 'wrong-password',
        newPassword: 'new-password',
        confirmNewPassword: 'new-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changes the password and revokes every existing customer session', async () => {
    const result = await service.changeMyPassword('user-1', {
      currentPassword: 'current',
      newPassword: 'new-password',
      confirmNewPassword: 'new-password',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        password: 'hashed:new-password',
        sessionVersion: { increment: 1 },
      },
    });
    expect(result).not.toHaveProperty('password');
    expect(result.role).toBe(Role.MEMBER);
  });
});
