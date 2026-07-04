import { buildServiceAlias } from './container-spec.util';

/** Une base managée du projet à câbler automatiquement à une app. */
export type DbServiceLink = {
  /** Nom du service DB → alias DNS stable sur le réseau projet. */
  name: string;
  databaseType: 'POSTGRES' | 'MYSQL' | 'REDIS' | 'MONGODB' | 'RABBITMQ';
  user?: string | null;
  password?: string | null;
  dbName?: string | null;
};

export type DbEngine = DbServiceLink['databaseType'];

const PORTS: Record<DbEngine, number> = {
  POSTGRES: 5432,
  MYSQL: 3306,
  REDIS: 6379,
  MONGODB: 27017,
  RABBITMQ: 5672,
};

/** Nom de la variable d'env de connexion exposée par moteur. */
export function dbConnectionEnvKey(
  databaseType: DbEngine,
): 'DATABASE_URL' | 'REDIS_URL' | 'AMQP_URL' {
  if (databaseType === 'REDIS') return 'REDIS_URL';
  if (databaseType === 'RABBITMQ') return 'AMQP_URL';
  return 'DATABASE_URL';
}

/**
 * URL de connexion pour UNE base sur un hôte donné (alias interne du réseau
 * projet, ou hôte externe). Défauts façon Coolify/Dokploy : app/changeme/app.
 * `port` par défaut = port standard du moteur. Source unique de vérité pour la
 * chaîne de connexion, réutilisée par le câblage auto (buildDbConnectionEnv) et
 * par l'endpoint credentials du service DATABASE.
 */
export function buildDbConnectionUrl(params: {
  databaseType: DbEngine;
  host: string;
  port?: number;
  user?: string | null;
  password?: string | null;
  dbName?: string | null;
}): string {
  const { databaseType, host } = params;
  const port = params.port ?? PORTS[databaseType];
  const user = params.user || 'app';
  const pass = params.password || 'changeme';
  const name = params.dbName || 'app';
  switch (databaseType) {
    case 'POSTGRES':
      return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
    case 'MYSQL':
      return `mysql://${user}:${pass}@${host}:${port}/${name}`;
    case 'REDIS':
      return `redis://${host}:${port}`;
    case 'MONGODB':
      return `mongodb://${user}:${pass}@${host}:${port}/${name}`;
    case 'RABBITMQ':
      return `amqp://${user}:${pass}@${host}:${port}`;
  }
}

/**
 * Construit les variables d'environnement de connexion (DATABASE_URL / REDIS_URL
 * / AMQP_URL) pour les bases managées du projet, en pointant sur leur alias DNS
 * stable (= nom du service). Destiné au niveau de PLUS BASSE précédence : toute
 * valeur définie par l'utilisateur l'emporte. Comportement façon Coolify/Dokploy.
 *
 * Retourne une MAP clé→valeur (vide si rien à câbler). NB: l'ancien format
 * « lignes KEY=VALUE » cassait silencieusement l'auto-câblage depuis le passage
 * du résolveur d'env au JSON strict (resolveEnvDetailed) : le niveau auto-db
 * entier était écarté (warning non-fatal) et le conteneur démarrait SANS
 * DATABASE_URL/REDIS_URL → crash-loop Prisma au boot, alors que l'UI annonçait
 * SUCCESS (health-gate Traefik = simple inspection). Découvert lors du
 * déploiement réel complet ; le caller sérialise cette map en JSON.
 */
export function buildDbConnectionEnv(
  dbs: DbServiceLink[],
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const db of dbs) {
    const url = buildDbConnectionUrl({
      databaseType: db.databaseType,
      host: buildServiceAlias(db.name),
      user: db.user,
      password: db.password,
      dbName: db.dbName,
    });
    vars[dbConnectionEnvKey(db.databaseType)] = url;
  }
  return vars;
}
