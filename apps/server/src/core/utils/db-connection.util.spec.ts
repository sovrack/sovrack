import { buildDbConnectionEnv } from './db-connection.util';

describe('buildDbConnectionEnv', () => {
  it('Postgres → DATABASE_URL sur l’alias du service', () => {
    expect(
      buildDbConnectionEnv([
        { name: 'Postgres', databaseType: 'POSTGRES', user: 'u', password: 'p', dbName: 'app' },
      ]),
    ).toBe('DATABASE_URL=postgresql://u:p@postgres:5432/app');
  });

  it('Redis → REDIS_URL (sans creds)', () => {
    expect(buildDbConnectionEnv([{ name: 'cache', databaseType: 'REDIS' }])).toBe(
      'REDIS_URL=redis://cache:6379',
    );
  });

  it('défauts app/changeme/app si creds absents', () => {
    expect(
      buildDbConnectionEnv([{ name: 'db', databaseType: 'POSTGRES' }]),
    ).toBe('DATABASE_URL=postgresql://app:changeme@db:5432/app');
  });

  it('MongoDB + RabbitMQ', () => {
    const out = buildDbConnectionEnv([
      { name: 'mongo', databaseType: 'MONGODB', user: 'u', password: 'p', dbName: 'd' },
      { name: 'queue', databaseType: 'RABBITMQ', user: 'u', password: 'p' },
    ]);
    expect(out).toContain('DATABASE_URL=mongodb://u:p@mongo:27017/d');
    expect(out).toContain('AMQP_URL=amqp://u:p@queue:5672');
  });

  it('liste vide → chaîne vide', () => {
    expect(buildDbConnectionEnv([])).toBe('');
  });
});
