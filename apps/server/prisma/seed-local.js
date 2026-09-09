/**
 * Idempotent local-only RBAC fixtures.
 *
 * This script never deletes rows and refuses production or a non-local database
 * host. It is copied into the runtime image so the disposable Compose stack can
 * seed itself without ts-node.
 */
const path = require('path');

function resolveFromApp(pkg) {
  let dir = __dirname;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', pkg);
    try {
      return require(candidate);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return require(pkg);
}

const {
  PrismaClient,
  Role,
  WorkspaceRole,
  WorkspaceType,
  WorkspaceStatus,
  MembershipStatus,
  ProjectRole,
  PlatformRole,
  StaffStatus,
  Plan,
  BillingStatus,
} = resolveFromApp('@prisma/client');
const argon2 = resolveFromApp('argon2');

const prisma = new PrismaClient();

const IDS = {
  owner: '10000000-0000-4000-8000-000000000001',
  admin: '10000000-0000-4000-8000-000000000002',
  maintainer: '10000000-0000-4000-8000-000000000003',
  developer: '10000000-0000-4000-8000-000000000004',
  viewer: '10000000-0000-4000-8000-000000000005',
  outsider: '10000000-0000-4000-8000-000000000006',
  suspended: '10000000-0000-4000-8000-000000000007',
  billing: '10000000-0000-4000-8000-000000000008',
  personal: '10000000-0000-4000-8000-000000000009',
  workspace: '20000000-0000-4000-8000-000000000001',
  outsiderWorkspace: '20000000-0000-4000-8000-000000000002',
  personalWorkspace: '20000000-0000-4000-8000-000000000003',
  project: '30000000-0000-4000-8000-000000000001',
  staffRoot: '40000000-0000-4000-8000-000000000001',
  staffAdmin: '40000000-0000-4000-8000-000000000002',
  staffOperator: '40000000-0000-4000-8000-000000000003',
};

const CLIENT_PASSWORD =
  process.env.LOCAL_CLIENT_PASSWORD || 'Local-Client-2026!';
const STAFF_PASSWORDS = {
  ROOT: process.env.LOCAL_STAFF_ROOT_PASSWORD || 'Local-Root-2026!',
  ADMIN: process.env.LOCAL_STAFF_ADMIN_PASSWORD || 'Local-Admin-2026!',
  OPERATOR: process.env.LOCAL_STAFF_OPERATOR_PASSWORD || 'Local-Operator-2026!',
};

function assertLocalOnly() {
  if (process.env.ALLOW_LOCAL_SEED !== 'true') {
    throw new Error(
      'ALLOW_LOCAL_SEED=true est obligatoire pour le seed local.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Le seed local est interdit avec NODE_ENV=production.');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  const allowedHosts = new Set([
    'localhost',
    '127.0.0.1',
    'postgres',
    'database',
  ]);
  if (!allowedHosts.has(databaseUrl.hostname)) {
    throw new Error(
      `Le seed local refuse la base distante ${databaseUrl.hostname || '<vide>'}.`,
    );
  }
}

async function upsertUser(id, email, fullName, passwordHash) {
  const data = {
    email,
    password: passwordHash,
    fullName,
    provider: 'email',
    role: Role.MEMBER,
    isActive: true,
    emailVerifiedAt: new Date(),
    emailVerificationCode: null,
    emailVerificationExpiresAt: null,
    emailVerificationAttemptId: null,
    pendingWorkspaceName: null,
    pendingWorkspaceType: null,
  };
  return prisma.user.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

async function upsertStaff(id, email, fullName, role, password) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const data = {
    email,
    password: passwordHash,
    fullName,
    role,
    status: StaffStatus.ACTIVE,
    deletedAt: null,
    createdBy: 'local-seed',
  };
  return prisma.staff.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

async function main() {
  assertLocalOnly();
  const clientHash = await argon2.hash(CLIENT_PASSWORD, {
    type: argon2.argon2id,
  });

  const users = [
    [IDS.owner, 'owner@sovrack.test', 'Local Workspace Owner'],
    [IDS.admin, 'admin@sovrack.test', 'Local Workspace Admin'],
    [IDS.maintainer, 'maintainer@sovrack.test', 'Local Project Maintainer'],
    [IDS.developer, 'developer@sovrack.test', 'Local Project Developer'],
    [IDS.viewer, 'viewer@sovrack.test', 'Local Project Viewer'],
    [IDS.outsider, 'outsider@sovrack.test', 'Local Other Workspace Owner'],
    [IDS.suspended, 'suspended@sovrack.test', 'Local Suspended Member'],
    [IDS.billing, 'billing@sovrack.test', 'Local Billing Member'],
    [IDS.personal, 'personal@sovrack.test', 'Local Personal Owner'],
  ];
  for (const [id, email, fullName] of users) {
    await upsertUser(id, email, fullName, clientHash);
  }

  await prisma.team.upsert({
    where: { id: IDS.workspace },
    create: {
      id: IDS.workspace,
      name: 'Sovrack Local Workspace',
      slug: 'sovrack-local-workspace',
      description: 'Local-only RBAC acceptance workspace',
      type: WorkspaceType.ORGANIZATION,
      status: WorkspaceStatus.ACTIVE,
    },
    update: {
      name: 'Sovrack Local Workspace',
      slug: 'sovrack-local-workspace',
      description: 'Local-only RBAC acceptance workspace',
      type: WorkspaceType.ORGANIZATION,
      status: WorkspaceStatus.ACTIVE,
    },
  });
  await prisma.team.upsert({
    where: { id: IDS.outsiderWorkspace },
    create: {
      id: IDS.outsiderWorkspace,
      name: 'Other Local Workspace',
      slug: 'other-local-workspace',
      type: WorkspaceType.ORGANIZATION,
      status: WorkspaceStatus.ACTIVE,
    },
    update: {
      name: 'Other Local Workspace',
      slug: 'other-local-workspace',
      type: WorkspaceType.ORGANIZATION,
      status: WorkspaceStatus.ACTIVE,
    },
  });
  await prisma.team.upsert({
    where: { id: IDS.personalWorkspace },
    create: {
      id: IDS.personalWorkspace,
      name: 'Personal Local Workspace',
      slug: 'personal-local-workspace',
      type: WorkspaceType.PERSONAL,
      status: WorkspaceStatus.ACTIVE,
      personalOwnerId: IDS.personal,
    },
    update: {
      name: 'Personal Local Workspace',
      slug: 'personal-local-workspace',
      type: WorkspaceType.PERSONAL,
      status: WorkspaceStatus.ACTIVE,
      personalOwnerId: IDS.personal,
    },
  });

  const memberships = [
    [IDS.owner, WorkspaceRole.OWNER, MembershipStatus.ACTIVE],
    [IDS.admin, WorkspaceRole.ADMIN, MembershipStatus.ACTIVE],
    [IDS.maintainer, WorkspaceRole.MEMBER, MembershipStatus.ACTIVE],
    [IDS.developer, WorkspaceRole.MEMBER, MembershipStatus.ACTIVE],
    [IDS.viewer, WorkspaceRole.MEMBER, MembershipStatus.ACTIVE],
    [IDS.suspended, WorkspaceRole.MEMBER, MembershipStatus.SUSPENDED],
    [IDS.billing, WorkspaceRole.BILLING, MembershipStatus.ACTIVE],
  ];
  for (const [userId, role, status] of memberships) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: IDS.workspace, userId } },
      create: { teamId: IDS.workspace, userId, role, status },
      update: { role, status },
    });
  }
  await prisma.teamMember.upsert({
    where: {
      teamId_userId: { teamId: IDS.outsiderWorkspace, userId: IDS.outsider },
    },
    create: {
      teamId: IDS.outsiderWorkspace,
      userId: IDS.outsider,
      role: WorkspaceRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    update: { role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE },
  });
  await prisma.teamMember.upsert({
    where: {
      teamId_userId: { teamId: IDS.personalWorkspace, userId: IDS.personal },
    },
    create: {
      teamId: IDS.personalWorkspace,
      userId: IDS.personal,
      role: WorkspaceRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    update: { role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE },
  });

  await prisma.project.upsert({
    where: { id: IDS.project },
    create: {
      id: IDS.project,
      teamId: IDS.workspace,
      name: 'Local RBAC Project',
      description: 'Safe project used by local authorization tests',
    },
    update: {
      teamId: IDS.workspace,
      name: 'Local RBAC Project',
      description: 'Safe project used by local authorization tests',
    },
  });
  const projectRoles = [
    [IDS.maintainer, ProjectRole.MAINTAINER],
    [IDS.developer, ProjectRole.DEVELOPER],
    [IDS.viewer, ProjectRole.VIEWER],
  ];
  for (const [userId, role] of projectRoles) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: IDS.project, userId } },
      create: { projectId: IDS.project, teamId: IDS.workspace, userId, role },
      update: { role },
    });
  }

  for (const teamId of [
    IDS.workspace,
    IDS.outsiderWorkspace,
    IDS.personalWorkspace,
  ]) {
    await prisma.subscription.upsert({
      where: { teamId },
      create: { teamId, plan: Plan.PRO, status: BillingStatus.ACTIVE },
      update: { plan: Plan.PRO, status: BillingStatus.ACTIVE },
    });
  }

  await upsertStaff(
    IDS.staffRoot,
    'root.staff@sovrack.test',
    'Local Staff Root',
    PlatformRole.ROOT,
    STAFF_PASSWORDS.ROOT,
  );
  await upsertStaff(
    IDS.staffAdmin,
    'admin.staff@sovrack.test',
    'Local Staff Admin',
    PlatformRole.ADMIN,
    STAFF_PASSWORDS.ADMIN,
  );
  await upsertStaff(
    IDS.staffOperator,
    'operator.staff@sovrack.test',
    'Local Staff Operator',
    PlatformRole.OPERATOR,
    STAFF_PASSWORDS.OPERATOR,
  );

  console.log(
    '[seed-local] Local RBAC fixtures are ready. No rows were deleted.',
  );
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
