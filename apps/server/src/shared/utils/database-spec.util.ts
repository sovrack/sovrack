import type { ManagedServiceType, Prisma } from '@prisma/client';

/** Credentials d'une base managée, extraits du blob JSON stocké. */
export type DbCredentials = {
  user?: string;
  password?: string;
  dbName?: string;
};

/** Parse {user,password,dbName} depuis un blob JSON (string ou objet Prisma). */
export function parseDbCredentials(
  raw: Prisma.JsonValue | null | undefined,
): DbCredentials {
  let creds: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      creds = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    creds = raw as Record<string, unknown>;
  }
  return {
    user: typeof creds.user === 'string' ? creds.user : undefined,
    password: typeof creds.password === 'string' ? creds.password : undefined,
    dbName: typeof creds.dbName === 'string' ? creds.dbName : undefined,
  };
}

/** Port + chemin du volume de données par moteur de base. */
export function getDatabaseContainerConfig(databaseType: ManagedServiceType): {
  port: number;
  dataPath: string;
} {
  switch (databaseType) {
    case 'POSTGRES':
      return { port: 5432, dataPath: '/var/lib/postgresql/data' };
    case 'MYSQL':
      return { port: 3306, dataPath: '/var/lib/mysql' };
    case 'REDIS':
      return { port: 6379, dataPath: '/data' };
    case 'MONGODB':
      return { port: 27017, dataPath: '/data/db' };
    case 'RABBITMQ':
      return { port: 5672, dataPath: '/var/lib/rabbitmq' };
  }
}

/**
 * Variables d'environnement d'INITIALISATION du conteneur de base (POSTGRES_USER,
 * MYSQL_DATABASE…) à partir des credentials. Défauts : app / changeme / app.
 */
export function buildDatabaseEnvVars(
  databaseType: ManagedServiceType,
  rawCredentials: Prisma.JsonValue | null | undefined,
): Record<string, string> {
  const { user, password, dbName } = parseDbCredentials(rawCredentials);
  const u = user ?? 'app';
  const p = password ?? 'changeme';
  const db = dbName ?? 'app';
  const result: Record<string, string> = {};
  switch (databaseType) {
    case 'POSTGRES':
      result.POSTGRES_USER = u;
      result.POSTGRES_PASSWORD = p;
      result.POSTGRES_DB = db;
      break;
    case 'MYSQL':
      result.MYSQL_ROOT_PASSWORD = p;
      result.MYSQL_DATABASE = db;
      result.MYSQL_USER = u;
      result.MYSQL_PASSWORD = p;
      break;
    case 'REDIS':
      break;
    case 'MONGODB':
      result.MONGO_INITDB_ROOT_USERNAME = u;
      result.MONGO_INITDB_ROOT_PASSWORD = p;
      result.MONGO_INITDB_DATABASE = db;
      break;
    case 'RABBITMQ':
      result.RABBITMQ_DEFAULT_USER = u;
      result.RABBITMQ_DEFAULT_PASS = p;
      break;
  }
  return result;
}
