import * as bcrypt from 'bcrypt';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = 'admin@deployautomation.local';
  const developerEmail = 'dev@deployautomation.local';
  const platformKeys = ['GITLAB_URL', 'GITLAB_TOKEN', 'PLATFORM_NAME', 'WEBHOOK_BASE_URL'];

  // Nettoyage global: on supprime les données de test/projet/serveur
  // pour repartir d'une base minimale et stable.
  await prisma.$transaction([
    prisma.deployment.deleteMany(),
    prisma.pipelineRun.deleteMany(),
    prisma.build.deleteMany(),
    prisma.environment.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.server.deleteMany(),
    prisma.platformConfig.deleteMany(),
    prisma.user.deleteMany({
      where: {
        email: {
          notIn: [adminEmail, developerEmail],
        },
      },
    }),
  ]);

  const adminPassword = await bcrypt.hash('CHANGE_MOI_ADMIN_PASSWORD', 10);
  const developerPassword = await bcrypt.hash('CHANGE_MOI_DEV_PASSWORD', 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: adminPassword,
      fullName: 'Administrator',
      role: Role.OWNER,
      isActive: true,
    },
    create: {
      email: adminEmail,
      password: adminPassword,
      fullName: 'Administrator',
      role: Role.OWNER,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: developerEmail },
    update: {
      password: developerPassword,
      fullName: 'John Developer',
      role: Role.MEMBER,
      isActive: true,
    },
    create: {
      email: developerEmail,
      password: developerPassword,
      fullName: 'John Developer',
      role: Role.MEMBER,
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

  // WEBHOOK_BASE_URL: URL publique du backend, utilisée par les providers Git
  // pour enregistrer les webhooks. À configurer dans l'UI Réglages → Plateforme
  // ou via la variable d'environnement WEBHOOK_URL (transient fallback).
  await prisma.platformConfig.upsert({
    where: { key: 'WEBHOOK_BASE_URL' },
    update: {
      value: '',
      isSecret: false,
    },
    create: {
      key: 'WEBHOOK_BASE_URL',
      value: '',
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
