import {
  buildDatabaseEnvVars,
  getDatabaseContainerConfig,
  parseDbCredentials,
} from './database-spec.util';

describe('database-spec.util', () => {
  describe('parseDbCredentials', () => {
    it('parse un objet', () => {
      expect(
        parseDbCredentials({ user: 'u', password: 'p', dbName: 'd' }),
      ).toEqual({
        user: 'u',
        password: 'p',
        dbName: 'd',
      });
    });
    it('parse une string JSON', () => {
      expect(parseDbCredentials('{"user":"u"}')).toEqual({
        user: 'u',
        password: undefined,
        dbName: undefined,
      });
    });
    it('JSON invalide → {}', () => {
      expect(parseDbCredentials('not json')).toEqual({});
    });
    it('null → {}', () => {
      expect(parseDbCredentials(null)).toEqual({});
    });
  });

  describe('getDatabaseContainerConfig', () => {
    it('Postgres', () => {
      expect(getDatabaseContainerConfig('POSTGRES')).toEqual({
        port: 5432,
        dataPath: '/var/lib/postgresql/data',
      });
    });
    it('Redis', () => {
      expect(getDatabaseContainerConfig('REDIS')).toEqual({
        port: 6379,
        dataPath: '/data',
      });
    });
  });

  describe('buildDatabaseEnvVars', () => {
    it('Postgres avec creds', () => {
      expect(
        buildDatabaseEnvVars('POSTGRES', {
          user: 'u',
          password: 'p',
          dbName: 'd',
        }),
      ).toEqual({
        POSTGRES_USER: 'u',
        POSTGRES_PASSWORD: 'p',
        POSTGRES_DB: 'd',
      });
    });
    it('Postgres défauts', () => {
      expect(buildDatabaseEnvVars('POSTGRES', null)).toEqual({
        POSTGRES_USER: 'app',
        POSTGRES_PASSWORD: 'changeme',
        POSTGRES_DB: 'app',
      });
    });
    it('Redis → {} (pas de var d’init)', () => {
      expect(buildDatabaseEnvVars('REDIS', null)).toEqual({});
    });
    it('RabbitMQ', () => {
      expect(
        buildDatabaseEnvVars('RABBITMQ', { user: 'u', password: 'p' }),
      ).toEqual({
        RABBITMQ_DEFAULT_USER: 'u',
        RABBITMQ_DEFAULT_PASS: 'p',
      });
    });
  });
});
