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

const PORTS: Record<DbServiceLink['databaseType'], number> = {
  POSTGRES: 5432,
  MYSQL: 3306,
  REDIS: 6379,
  MONGODB: 27017,
  RABBITMQ: 5672,
};

/**
 * Construit les variables d'environnement de connexion (DATABASE_URL / REDIS_URL
 * / AMQP_URL) pour les bases managées du projet, en pointant sur leur alias DNS
 * stable (= nom du service). Destiné au niveau de PLUS BASSE précédence : toute
 * valeur définie par l'utilisateur l'emporte. Comportement façon Coolify/Dokploy.
 * Retourne des lignes `KEY=VALUE` (vide si rien à câbler).
 */
export function buildDbConnectionEnv(dbs: DbServiceLink[]): string {
  const lines: string[] = [];
  for (const db of dbs) {
    const host = buildServiceAlias(db.name);
    const port = PORTS[db.databaseType];
    const user = db.user || 'app';
    const pass = db.password || 'changeme';
    const name = db.dbName || 'app';
    switch (db.databaseType) {
      case 'POSTGRES':
        lines.push(`DATABASE_URL=postgresql://${user}:${pass}@${host}:${port}/${name}`);
        break;
      case 'MYSQL':
        lines.push(`DATABASE_URL=mysql://${user}:${pass}@${host}:${port}/${name}`);
        break;
      case 'REDIS':
        lines.push(`REDIS_URL=redis://${host}:${port}`);
        break;
      case 'MONGODB':
        lines.push(`DATABASE_URL=mongodb://${user}:${pass}@${host}:${port}/${name}`);
        break;
      case 'RABBITMQ':
        lines.push(`AMQP_URL=amqp://${user}:${pass}@${host}:${port}`);
        break;
    }
  }
  return lines.join('\n');
}
