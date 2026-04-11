import * as bcrypt from 'bcrypt';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

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

  await prisma.platformConfig.upsert({
    where: { key: 'GITLAB_URL' },
    update: {
      value: '',
      isSecret: false,
    },
    create: {
      key: 'GITLAB_URL',
      value: '',
      isSecret: false,
    },
  });

  await prisma.platformConfig.upsert({
    where: { key: 'GITLAB_TOKEN' },
    update: {
      value: '',
      isSecret: true,
    },
    create: {
      key: 'GITLAB_TOKEN',
      value: '',
      isSecret: true,
    },
  });

  await prisma.platformConfig.upsert({
    where: { key: 'PLATFORM_NAME' },
    update: {
      value: 'Deploy Automation',
      isSecret: false,
    },
    create: {
      key: 'PLATFORM_NAME',
      value: 'Deploy Automation',
      isSecret: false,
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
