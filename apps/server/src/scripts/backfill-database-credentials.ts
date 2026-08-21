import { PrismaClient, ServiceType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { CryptoService } from '../shared/crypto/crypto.service';
import { parseDbCredentials } from '../shared/utils/database-spec.util';

const prisma = new PrismaClient();
const crypto = new CryptoService();

async function main(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public."Service"') IS NOT NULL AS exists
  `;
  if (tables[0]?.exists !== true) {
    console.log(
      '[credential-backfill] Nouvelle base : aucun service à migrer.',
    );
    return;
  }

  const services = await prisma.service.findMany({
    where: { type: ServiceType.DATABASE, archivedAt: null },
    select: { id: true, databaseCredentials: true },
  });
  let changed = 0;

  for (const service of services) {
    if (
      typeof service.databaseCredentials === 'string' &&
      service.databaseCredentials.startsWith('v2:')
    ) {
      // Authenticated ciphertext already in the current format.
      crypto.decrypt(service.databaseCredentials);
      continue;
    }

    const existing = parseDbCredentials(service.databaseCredentials);
    const credentials = {
      user: existing.user?.trim() || 'app',
      password:
        existing.password?.trim() || randomBytes(24).toString('base64url'),
      dbName: existing.dbName?.trim() || 'app',
    };
    await prisma.service.update({
      where: { id: service.id },
      data: {
        databaseCredentials: crypto.encrypt(JSON.stringify(credentials)),
      },
    });
    changed += 1;
  }

  console.log(
    `[credential-backfill] ${changed}/${services.length} service(s) chiffré(s).`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error('[credential-backfill] Échec:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
