/**
 * Script manuel : crée le compte dédié SUPER_ADMIN (propriétaire plateforme).
 * Usage :
 *   npx ts-node --transpile-only src/scripts/create-super-admin.ts <email> <fullName>
 * Le mot de passe temporaire est demandé en entrée standard (jamais en argument CLI,
 * pour éviter de le laisser dans l'historique du shell).
 *
 * ATTENTION : réservé au propriétaire ; génère un compte admin avec accès back-office.
 */
import * as argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  const email = process.argv[2];
  const fullName = process.argv[3] ?? 'Plateforme';
  if (!email) {
    console.error(
      'Usage: npx ts-node --transpile-only src/scripts/create-super-admin.ts <email> <fullName>',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.error(
        `Un compte existe déjà pour "${email}". Si c'est votre compte, utilisez plutôt ` +
          'promote-super-admin.ts ; sinon choisissez un autre email.',
      );
      process.exit(1);
    }

    const password1 = await ask('Mot de passe : ');
    const password2 = await ask('Confirmation : ');
    if (password1 !== password2) {
      console.error('Les mots de passe ne correspondent pas.');
      process.exit(1);
    }
    if (!password1 || password1.length < 8) {
      console.error('Le mot de passe doit faire au moins 8 caractères.');
      process.exit(1);
    }
    rl.close();

    const hash = await argon2.hash(password1, { type: argon2.argon2id });
    await prisma.user.create({
      data: {
        email,
        password: hash,
        fullName,
        role: Role.SUPER_ADMIN,
        isActive: true,
      },
    });
    console.log(
      `\n✓ Compte SUPER_ADMIN créé pour ${email}. Accédez au back-office via /super_admin/login.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
