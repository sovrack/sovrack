import { ManagedServiceType } from '@prisma/client';

export type DumpSpec = { cmd: string[]; ext: string };
export type RestoreSpec = { cmd: string[] };

/**
 * Commande de dump logique natif par moteur, exécutée dans le conteneur de la
 * base. REDIS / RABBITMQ n'ont pas de dump logique portable → null.
 */
export function dumpSpec(type: ManagedServiceType): DumpSpec | null {
  switch (type) {
    case ManagedServiceType.POSTGRES:
      return {
        cmd: [
          'sh',
          '-c',
          'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"',
        ],
        ext: 'sql',
      };
    case ManagedServiceType.MYSQL:
      return {
        cmd: [
          'sh',
          '-c',
          'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --databases "${MYSQL_DATABASE:-app}"',
        ],
        ext: 'sql',
      };
    case ManagedServiceType.MONGODB:
      return {
        cmd: [
          'sh',
          '-c',
          'mongodump --archive --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin',
        ],
        ext: 'archive',
      };
    // REDIS / RABBITMQ have no portable logical dump.
    default:
      return null;
  }
}

/**
 * Commande de restauration native par moteur, alimentée par le dump sur STDIN.
 * Miroir de {@link dumpSpec} : psql pour le SQL pg_dump, mysql pour le SQL
 * mysqldump, mongorestore --archive --drop pour l'archive mongodump (drop =
 * remplacement propre).
 */
export function restoreSpec(type: ManagedServiceType): RestoreSpec | null {
  switch (type) {
    case ManagedServiceType.POSTGRES:
      return {
        cmd: [
          'sh',
          '-c',
          'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"',
        ],
      };
    case ManagedServiceType.MYSQL:
      return {
        cmd: ['sh', '-c', 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'],
      };
    case ManagedServiceType.MONGODB:
      return {
        cmd: [
          'sh',
          '-c',
          'mongorestore --archive --drop --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin',
        ],
      };
    default:
      return null;
  }
}
