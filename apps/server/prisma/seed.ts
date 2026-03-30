import * as bcrypt from 'bcrypt';
import { PrismaClient, ProjectMemberRole, Role } from '@prisma/client';

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

  const developer = await prisma.user.findUnique({
    where: { email: 'dev@devops.com' },
  });

  if (!developer) {
    throw new Error('Utilisateur développeur de seed introuvable');
  }

  // Projet 1: App E-commerce
  const ecommerceProject = await upsertProjectByGitlabUrl({
    name: 'App E-commerce',
    description: 'Projet e-commerce interne',
    gitlabUrl: 'https://gitlab.com/test/ecommerce',
    branch: 'main',
  });

  await ensureProjectOwner(ecommerceProject.id, developer.id);

  // Projet 2: API Backend
  const apiProject = await upsertProjectByGitlabUrl({
    name: 'API Backend',
    description: 'Projet API backend interne',
    gitlabUrl: 'https://gitlab.com/test/api-backend',
    branch: 'develop',
  });

  await ensureProjectOwner(apiProject.id, developer.id);

  await upsertServerByName({
    name: 'Local VM Staging',
    host: '192.168.1.100',
    port: 22,
    username: 'ubuntu',
    sshKey: 'REPLACE_WITH_REAL_KEY',
    isActive: true,
  });
}

/**
 * Crée ou met à jour un projet à partir de son URL GitLab.
 */
async function upsertProjectByGitlabUrl(input: {
  name: string;
  description: string;
  gitlabUrl: string;
  branch: string;
}) {
  const existingProject = await prisma.project.findFirst({
    where: { gitlabUrl: input.gitlabUrl },
  });

  if (existingProject) {
    return await prisma.project.update({
      where: { id: existingProject.id },
      data: {
        name: input.name,
        description: input.description,
        branch: input.branch,
      },
    });
  }

  return await prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      gitlabUrl: input.gitlabUrl,
      branch: input.branch,
    },
  });
}

/**
 * Garantit qu'un utilisateur est OWNER du projet.
 */
async function ensureProjectOwner(
  projectId: string,
  userId: string,
): Promise<void> {
  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
  });

  if (!membership) {
    await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        role: ProjectMemberRole.OWNER,
      },
    });
    return;
  }

  if (membership.role !== ProjectMemberRole.OWNER) {
    await prisma.projectMember.update({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      data: {
        role: ProjectMemberRole.OWNER,
      },
    });
  }
}

/**
 * Crée ou met à jour un serveur de test pour les environnements.
 */
async function upsertServerByName(input: {
  name: string;
  host: string;
  port: number;
  username: string;
  sshKey: string;
  isActive: boolean;
}) {
  const existingServer = await prisma.server.findFirst({
    where: { name: input.name },
  });

  if (existingServer) {
    return await prisma.server.update({
      where: { id: existingServer.id },
      data: {
        host: input.host,
        port: input.port,
        username: input.username,
        sshKey: input.sshKey,
        isActive: input.isActive,
      },
    });
  }

  return await prisma.server.create({
    data: {
      name: input.name,
      host: input.host,
      port: input.port,
      username: input.username,
      sshKey: input.sshKey,
      isActive: input.isActive,
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
