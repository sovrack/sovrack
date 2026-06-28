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
        env: { PGADMIN_DEFAULT_EMAIL: 'admin@platform.local' },
        generateSecretEnvKey: 'PGADMIN_DEFAULT_PASSWORD',
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
