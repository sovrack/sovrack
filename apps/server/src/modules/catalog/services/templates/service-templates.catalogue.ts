// Pure catalogue of one-click service templates (bundles of Service records
// created together). No I/O, no `this` — the resolver only computes the
// payloads; ServicesService.createFromTemplate does the actual persistence.
//
// Cross-component wiring (e.g. pgAdmin reaching the Postgres container) needs
// no explicit reference here: any non-DATABASE service deployed alongside a
// DATABASE service in the same project/environment is already auto-wired
// with a DATABASE_URL/REDIS_URL/AMQP_URL env var by
// resolveAutoWiredDbEnv() (docker-deploy-executor.service.ts), keyed off the
// database's stable network alias.

import { randomBytes } from 'crypto';
import {
  BuildPack,
  ManagedServiceType,
  ServiceType,
  SourceType,
} from '@prisma/client';

export type ServiceTemplateComponent = {
  /** Appended to the user-chosen base name as `${baseName}-${nameSuffix}`. */
  nameSuffix: string;
  type: ServiceType;
  sourceType?: SourceType;
  repoPath?: string;
  buildPack?: BuildPack;
  port?: number;
  databaseType?: ManagedServiceType;
  databaseVersion?: string;
  env?: Record<string, string>;
  /** Generates a random secret and injects it under this env key. */
  generateSecretEnvKey?: string;
};

export type ServiceTemplate = {
  id: string;
  name: string;
  description: string;
  components: ServiceTemplateComponent[];
};

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: 'postgres-pgadmin',
    name: 'PostgreSQL + pgAdmin',
    description:
      'Managed PostgreSQL database with a pgAdmin web UI, auto-connected over the project network.',
    components: [
      {
        nameSuffix: 'db',
        type: ServiceType.DATABASE,
        databaseType: ManagedServiceType.POSTGRES,
        databaseVersion: '16',
      },
      {
        nameSuffix: 'pgadmin',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.DOCKER_IMAGE,
        repoPath: 'dpage/pgadmin4:latest',
        buildPack: BuildPack.NONE,
        port: 80,
        env: { PGADMIN_DEFAULT_EMAIL: 'admin@sovrack.local' },
        generateSecretEnvKey: 'PGADMIN_DEFAULT_PASSWORD',
      },
    ],
  },
  {
    id: 'redis-insight',
    name: 'Redis + RedisInsight',
    description:
      'In-memory key-value cache and store paired with RedisInsight visualization and management UI.',
    components: [
      {
        nameSuffix: 'cache',
        type: ServiceType.DATABASE,
        databaseType: ManagedServiceType.REDIS,
        databaseVersion: '7-alpine',
      },
      {
        nameSuffix: 'ui',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.DOCKER_IMAGE,
        repoPath: 'redis/redisinsight:latest',
        buildPack: BuildPack.NONE,
        port: 5540,
      },
    ],
  },
  {
    id: 'mysql-phpmyadmin',
    name: 'MySQL + phpMyAdmin',
    description:
      'High-performance MySQL 8 relational database with phpMyAdmin web administration dashboard.',
    components: [
      {
        nameSuffix: 'mysql',
        type: ServiceType.DATABASE,
        databaseType: ManagedServiceType.MYSQL,
        databaseVersion: '8.0',
      },
      {
        nameSuffix: 'phpmyadmin',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.DOCKER_IMAGE,
        repoPath: 'phpmyadmin:latest',
        buildPack: BuildPack.NONE,
        port: 80,
      },
    ],
  },
  {
    id: 'mongodb-express',
    name: 'MongoDB + Mongo Express',
    description:
      'Document database with Mongo Express web administrative client.',
    components: [
      {
        nameSuffix: 'mongo',
        type: ServiceType.DATABASE,
        databaseType: ManagedServiceType.MONGODB,
        databaseVersion: '7.0',
      },
      {
        nameSuffix: 'express',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.DOCKER_IMAGE,
        repoPath: 'mongo-express:latest',
        buildPack: BuildPack.NONE,
        port: 8081,
      },
    ],
  },
  {
    id: 'rabbitmq-management',
    name: 'RabbitMQ Message Broker',
    description:
      'Robust AMQP message queue and pub/sub broker with integrated management web interface.',
    components: [
      {
        nameSuffix: 'broker',
        type: ServiceType.DATABASE,
        databaseType: ManagedServiceType.RABBITMQ,
        databaseVersion: '3-management-alpine',
      },
    ],
  },
  {
    id: 'n8n',
    name: 'n8n Workflow Automation',
    description:
      'Fair-code workflow automation tool allowing flexible connections between external APIs and services.',
    components: [
      {
        nameSuffix: 'app',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.DOCKER_IMAGE,
        repoPath: 'n8nio/n8n:latest',
        buildPack: BuildPack.NONE,
        port: 5678,
        env: { N8N_PORT: '5678' },
      },
    ],
  },
  {
    id: 'minio',
    name: 'MinIO Object Storage (S3-Compatible)',
    description:
      'High-performance, S3-compatible object storage server with web browser console.',
    components: [
      {
        nameSuffix: 's3',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.DOCKER_IMAGE,
        repoPath: 'minio/minio:latest',
        buildPack: BuildPack.NONE,
        port: 9001,
        env: { MINIO_ROOT_USER: 'admin' },
        generateSecretEnvKey: 'MINIO_ROOT_PASSWORD',
      },
    ],
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description:
      'Self-hosted monitoring tool with fancy status pages and multi-protocol ping checks.',
    components: [
      {
        nameSuffix: 'monitor',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.DOCKER_IMAGE,
        repoPath: 'louislam/uptime-kuma:1',
        buildPack: BuildPack.NONE,
        port: 3001,
      },
    ],
  },
  {
    id: 'nextjs',
    name: 'Next.js 15 App Router',
    description:
      'Production-ready Next.js 15 with Standalone build, Server Components and Tailwind CSS.',
    components: [
      {
        nameSuffix: 'web',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.GIT_REPOSITORY,
        buildPack: BuildPack.NIXPACKS,
        port: 3000,
        env: { NODE_ENV: 'production', PORT: '3000' },
      },
    ],
  },
  {
    id: 'nodejs-express',
    name: 'Node.js Express API',
    description:
      'Clean TypeScript REST API with Express and automated Nixpacks containerization.',
    components: [
      {
        nameSuffix: 'api',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.GIT_REPOSITORY,
        buildPack: BuildPack.NIXPACKS,
        port: 4000,
        env: { NODE_ENV: 'production', PORT: '4000' },
      },
    ],
  },
  {
    id: 'python-fastapi',
    name: 'FastAPI Python',
    description:
      'High-performance asynchronous Python API with Uvicorn and automatic OpenAPI Swagger docs.',
    components: [
      {
        nameSuffix: 'api',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.GIT_REPOSITORY,
        buildPack: BuildPack.NIXPACKS,
        port: 8000,
        env: { PORT: '8000' },
      },
    ],
  },
  {
    id: 'golang',
    name: 'Golang Web Service',
    description:
      'Zero-dependency lightweight Go microservice container built from scratch.',
    components: [
      {
        nameSuffix: 'svc',
        type: ServiceType.APPLICATION,
        sourceType: SourceType.GIT_REPOSITORY,
        buildPack: BuildPack.NIXPACKS,
        port: 8080,
        env: { PORT: '8080' },
      },
    ],
  },
];

export function findServiceTemplate(id: string): ServiceTemplate | undefined {
  return SERVICE_TEMPLATES.find((template) => template.id === id);
}

export type ResolvedTemplateService = {
  name: string;
  type: ServiceType;
  sourceType?: SourceType;
  repoPath?: string;
  buildPack?: BuildPack;
  port?: number;
  databaseType?: ManagedServiceType;
  databaseVersion?: string;
  env?: string;
  generatedSecrets: Record<string, string>;
};

const defaultGenerateSecret = (): string =>
  randomBytes(24).toString('base64url');

/**
 * Turns a template + user-chosen base name into the concrete per-component
 * payloads ServicesService.createFromTemplate will pass to create(). The
 * secret generator is injectable so tests stay deterministic.
 */
export function resolveServiceTemplateComponents(
  template: ServiceTemplate,
  baseName: string,
  generateSecret: () => string = defaultGenerateSecret,
): ResolvedTemplateService[] {
  const trimmedBase = baseName.trim();
  return template.components.map((component) => {
    const generatedSecrets: Record<string, string> = {};
    const env: Record<string, string> = { ...(component.env ?? {}) };

    if (component.generateSecretEnvKey) {
      const secret = generateSecret();
      generatedSecrets[component.generateSecretEnvKey] = secret;
      env[component.generateSecretEnvKey] = secret;
    }

    return {
      name: `${trimmedBase}-${component.nameSuffix}`,
      type: component.type,
      sourceType: component.sourceType,
      repoPath: component.repoPath,
      buildPack: component.buildPack,
      port: component.port,
      databaseType: component.databaseType,
      databaseVersion: component.databaseVersion,
      env: Object.keys(env).length > 0 ? JSON.stringify(env) : undefined,
      generatedSecrets,
    };
  });
}
