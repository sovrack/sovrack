/**
 * Script manuel : promeut un utilisateur existant au rôle SUPER_ADMIN.
 * Usage : npx ts-node --transpile-only src/scripts/promote-super-admin.ts <email>
 * Le rôle SUPER_ADMIN est RÉSERVÉ au propriétaire de la plateforme (back-office).
 * Les clients s'inscrivent en ADMIN ; ce script est le seul moyen de promouvoir.
 */
import { PrismaClient, Role } from '@prisma/client';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error(
      'Usage: npx ts-node --transpile-only src/scripts/promote-super-admin.ts <email>',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Aucun utilisateur avec l'email "${email}".`);
      process.exit(1);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role: Role.SUPER_ADMIN },
    });
    console.log(
      `✓ ${user.email} (${user.id}) promu SUPER_ADMIN. Accédez au back-office via /super_admin/login.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
