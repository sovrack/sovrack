/**
 * Seed idempotent pour le back-office (staff) en PRODUCTION.
 * Crée le premier compte ROOT s'il n'existe pas.
 *
 * Fichier JS pur (pas de ts-node requis) : exécuté dans l'image de prod où
 * seules les dépendances de runtime existent. Le client Prisma compilé est
 * résolu via node_modules.
 *
 * Variables d'environnement :
 *   STAFF_ROOT_EMAIL     (défaut: admin@sovrack.tn)
 *   STAFF_ROOT_PASSWORD  (défaut: CHANGE_MOI_ROOT_PASSWORD — à définir en prod !)
 *
 * Usage : node prisma/seed-staff.js
 */
const path = require('path');

function resolveFromApp(pkg) {
  // Démarre depuis le dossier du script puis remonte jusqu'à trouver node_modules.
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

const { PrismaClient, PlatformRole, StaffStatus } = resolveFromApp('@prisma/client');
const argon2 = resolveFromApp('argon2');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.STAFF_ROOT_EMAIL ?? 'admin@sovrack.tn').toLowerCase();
  const password = process.env.STAFF_ROOT_PASSWORD ?? 'CHANGE_MOI_ROOT_PASSWORD';

  const existing = await prisma.staff.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed-staff] ROOT déjà présent: ${email} (${existing.role})`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const hash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.staff.create({
    data: {
      email,
      fullName: user?.fullName ?? 'Root Admin',
      role: PlatformRole.ROOT,
      status: StaffStatus.ACTIVE,
      password: hash,
      createdBy: 'seed',
    },
  });
  console.log(`[seed-staff] ROOT créé: ${email}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });