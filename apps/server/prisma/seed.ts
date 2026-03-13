import * as bcrypt from 'bcrypt';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed initial des utilisateurs de la plateforme.
 */
async function main(): Promise<void> {
  const adminPassword = await bcrypt.hash('Admin@2025!', 10);
  const developerPassword = await bcrypt.hash('Dev@2025!', 10);

  await prisma.user.upsert({
    where: { email: 'admin@devops.com' },
    update: {
      fullName: 'Administrator',
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      email: 'admin@devops.com',
      password: adminPassword,
      fullName: 'Administrator',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'dev@devops.com' },
    update: {
      fullName: 'John Developer',
      role: Role.DEVELOPER,
      isActive: true,
    },
    create: {
      email: 'dev@devops.com',
      password: developerPassword,
      fullName: 'John Developer',
      role: Role.DEVELOPER,
      isActive: true,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
