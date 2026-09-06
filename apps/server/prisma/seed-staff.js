/**
 * Seed idempotent pour le back-office (staff) en PRODUCTION.
 * Crée le premier compte ROOT s'il n'existe pas.
 *
 * Fichier JS pur (pas de ts-node requis) : exécuté dans l'image de prod où
 * seules les dépendances de runtime existent. Le client Prisma compilé est
 * résolu via node_modules.
 *
 * Variables d'environnement :
 *   STAFF_ROOT_EMAIL   (OBLIGATOIRE)
 *   STAFF_OTP_SECRET   (OBLIGATOIRE, clé HMAC dédiée aux codes)
 *   SMTP_*             (OBLIGATOIRE pour remettre le code)
 *   FRONTEND_URL       (lien vers /staff/activate)
 *
 * Usage : node prisma/seed-staff.js
 */
const path = require('path');
const { createHmac, randomBytes, randomInt } = require('crypto');

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
const nodemailer = resolveFromApp('nodemailer');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.STAFF_ROOT_EMAIL ?? '').trim().toLowerCase();
  const staffOtpSecret = process.env.STAFF_OTP_SECRET ?? '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('[seed-staff] STAFF_ROOT_EMAIL manquant ou invalide.');
    process.exitCode = 1;
    return;
  }

  if (staffOtpSecret.length < 32) {
    console.error('[seed-staff] STAFF_OTP_SECRET manquant ou trop court.');
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.staff.findUnique({ where: { email } });
  if (existing?.status === StaffStatus.ACTIVE && existing.role === PlatformRole.ROOT) {
    console.log(`[seed-staff] ROOT déjà présent: ${email} (${existing.role})`);
    return;
  }
  if (
    existing &&
    (existing.deletedAt ||
      existing.role !== PlatformRole.ROOT ||
      existing.status !== StaffStatus.INVITED)
  ) {
    console.error(
      '[seed-staff] Le compte existe dans un état incompatible avec le bootstrap.',
    );
    process.exitCode = 1;
    return;
  }

  const smtpEnabled = String(process.env.SMTP_ENABLED ?? '').toLowerCase() === 'true';
  const smtpHost = (process.env.SMTP_HOST ?? '').trim().toLowerCase();
  const smtpPort = Number(process.env.SMTP_PORT ?? '587');
  const smtpSecurity = (process.env.SMTP_SECURITY ?? 'starttls').trim().toLowerCase();
  const smtpUser = process.env.SMTP_USER ?? '';
  const smtpPass = process.env.SMTP_PASS ?? '';
  const smtpFrom = process.env.SMTP_FROM || smtpUser;
  const allowedHosts = (process.env.SMTP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    !smtpEnabled ||
    !smtpHost ||
    !Number.isInteger(smtpPort) ||
    smtpPort < 1 ||
    smtpPort > 65535 ||
    !['tls', 'starttls', 'none'].includes(smtpSecurity) ||
    !smtpUser ||
    !smtpPass ||
    !smtpFrom ||
    (allowedHosts.length > 0 && !allowedHosts.includes(smtpHost))
  ) {
    console.error(
      '[seed-staff] Configuration SMTP incomplète ou fournisseur non autorisé.',
    );
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const root =
    existing ??
    (await prisma.staff.create({
      data: {
        email,
        fullName: user?.fullName ?? 'Root Admin',
        role: PlatformRole.ROOT,
        status: StaffStatus.INVITED,
        password: await argon2.hash(randomBytes(48).toString('base64url'), {
          type: argon2.argon2id,
        }),
        createdBy: 'bootstrap',
      },
    }));

  const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
  const codeHash = createHmac('sha256', staffOtpSecret)
    .update(`staff-activation-v1\u0000${root.id}\u0000${code}`)
    .digest('hex');
  const invitation = await prisma.staffInvitation.upsert({
    where: { staffId: root.id },
    create: {
      staffId: root.id,
      tokenHash: codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    update: {
      tokenHash: codeHash,
      attempts: 0,
      deliveredAt: null,
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const frontendUrl = (process.env.FRONTEND_URL || 'https://sovrack.tech').replace(/\/$/, '');
  const activationUrl = `${frontendUrl}/staff/activate?email=${encodeURIComponent(email)}`;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecurity === 'tls',
    requireTLS: smtpSecurity === 'starttls',
    ignoreTLS: smtpSecurity === 'none',
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    auth: { user: smtpUser, pass: smtpPass },
  });
  try {
    await transporter.verify();
    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: "[Sovrack] Code d'activation du compte ROOT",
      html:
        '<p>Votre compte ROOT Sovrack est prêt.</p>' +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>` +
        '<p>Ce code expire dans 10 minutes et ne peut être utilisé qu’une seule fois.</p>' +
        `<p><a href="${activationUrl}">Choisir mon premier mot de passe</a></p>`,
    });
    await prisma.staffInvitation.updateMany({
      where: { id: invitation.id, usedAt: null },
      data: { deliveredAt: new Date() },
    });
  } catch (error) {
    await prisma.staffInvitation.updateMany({
      where: { id: invitation.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    throw new Error(
      `[seed-staff] Envoi SMTP impossible: ${error instanceof Error ? error.message : 'erreur inconnue'}`,
    );
  } finally {
    transporter.close();
  }
  console.log(`[seed-staff] ROOT invité et code remis par email: ${email}`);
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
