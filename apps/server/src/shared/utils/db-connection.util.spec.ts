import {
  buildDbConnectionEnv,
  buildDbConnectionUrl,
  dbConnectionEnvKey,
} from './db-connection.util';

describe('buildDbConnectionUrl', () => {
  it('assembles a Postgres URL for a given host + port', () => {
    expect(
      buildDbConnectionUrl({
        databaseType: 'POSTGRES',
        host: 'db',
        port: 5432,
        user: 'u',
        password: 'p',
        dbName: 'app',
      }),
    ).toBe('postgresql://u:p@db:5432/app');
  });

  it('Redis → pas de creds dans l’URL', () => {
    expect(
      buildDbConnectionUrl({
        databaseType: 'REDIS',
        host: 'cache',
        port: 6379,
      }),
    ).toBe('redis://cache:6379');
  });

  it('default port = engine standard port', () => {
    expect(buildDbConnectionUrl({ databaseType: 'MYSQL', host: 'sql' })).toBe(
      'mysql://app:changeme@sql:3306/app',
    );
  });

  it('dbConnectionEnvKey mappe la variable par moteur', () => {
    expect(dbConnectionEnvKey('POSTGRES')).toBe('DATABASE_URL');
    expect(dbConnectionEnvKey('REDIS')).toBe('REDIS_URL');
    expect(dbConnectionEnvKey('RABBITMQ')).toBe('AMQP_URL');
  });
});

// Contrat MAP (pas « lignes KEY=VALUE ») : le format lignes était silencieusement
// écarté par le résolveur d'env JSON strict → conteneur sans DATABASE_URL
// (crash-loop Prisma), découvert lors du déploiement réel complet.
describe('buildDbConnectionEnv', () => {
  it('Postgres → DATABASE_URL sur l’alias du service', () => {
    expect(
      buildDbConnectionEnv([
        {
          name: 'Postgres',
          databaseType: 'POSTGRES',
          user: 'u',
          password: 'p',
          dbName: 'app',
        },
      ]),
    ).toEqual({ DATABASE_URL: 'postgresql://u:p@postgres:5432/app' });
  });

  it('Redis → REDIS_URL (sans creds)', () => {
    expect(
      buildDbConnectionEnv([{ name: 'cache', databaseType: 'REDIS' }]),
    ).toEqual({ REDIS_URL: 'redis://cache:6379' });
  });

  it('defaults to app/changeme/app when creds missing', () => {
    expect(
      buildDbConnectionEnv([{ name: 'db', databaseType: 'POSTGRES' }]),
    ).toEqual({ DATABASE_URL: 'postgresql://app:changeme@db:5432/app' });
  });

  it('MongoDB + RabbitMQ', () => {
    const out = buildDbConnectionEnv([
      {
        name: 'mongo',
        databaseType: 'MONGODB',
        user: 'u',
        password: 'p',
        dbName: 'd',
      },
      { name: 'queue', databaseType: 'RABBITMQ', user: 'u', password: 'p' },
    ]);
    expect(out).toEqual({
      DATABASE_URL: 'mongodb://u:p@mongo:27017/d',
      AMQP_URL: 'amqp://u:p@queue:5672',
    });
  });

  it('Postgres + Redis together → BOTH variables (real deployment case)', () => {
    const out = buildDbConnectionEnv([
      {
        name: 'postgres',
        databaseType: 'POSTGRES',
        user: 'app',
        password: 'pw',
        dbName: 'app',
      },
      { name: 'redis', databaseType: 'REDIS' },
    ]);
    expect(Object.keys(out).sort()).toEqual(['DATABASE_URL', 'REDIS_URL']);
    // La map DOIT être sérialisable en JSON objet — format exigé par
    // resolveEnvDetailed pour un EnvLevel.env.
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('liste vide → map vide', () => {
    expect(buildDbConnectionEnv([])).toEqual({});
  });
});
