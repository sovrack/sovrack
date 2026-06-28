import {
  BuildPack,
  ManagedServiceType,
  ServiceType,
  SourceType,
} from '@prisma/client';
import {
  findServiceTemplate,
  resolveServiceTemplateComponents,
  SERVICE_TEMPLATES,
  type ServiceTemplate,
} from './service-templates.catalogue';

describe('findServiceTemplate', () => {
  it('finds the postgres-pgadmin template by id', () => {
    expect(findServiceTemplate('postgres-pgadmin')?.name).toBe(
      'PostgreSQL + pgAdmin',
    );
  });

  it('returns undefined for an unknown id', () => {
    expect(findServiceTemplate('does-not-exist')).toBeUndefined();
  });
});

describe('SERVICE_TEMPLATES', () => {
  it('every template has at least one component', () => {
    for (const template of SERVICE_TEMPLATES) {
      expect(template.components.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveServiceTemplateComponents', () => {
  const template = findServiceTemplate('postgres-pgadmin') as ServiceTemplate;
  const generateSecret = () => 'fixed-secret';

  it('suffixes each component name with the base name', () => {
    const resolved = resolveServiceTemplateComponents(
      template,
      'my-stack',
      generateSecret,
    );
    expect(resolved.map((r) => r.name)).toEqual([
      'my-stack-db',
      'my-stack-pgadmin',
    ]);
  });

  it('trims the base name before suffixing', () => {
    const resolved = resolveServiceTemplateComponents(
      template,
      '  my-stack  ',
      generateSecret,
    );
    expect(resolved[0].name).toBe('my-stack-db');
  });

  it('builds the database component as a DATABASE service with no env', () => {
    const [db] = resolveServiceTemplateComponents(
      template,
      'my-stack',
      generateSecret,
    );
    expect(db.type).toBe(ServiceType.DATABASE);
    expect(db.databaseType).toBe(ManagedServiceType.POSTGRES);
    expect(db.databaseVersion).toBe('16');
    expect(db.env).toBeUndefined();
    expect(db.generatedSecrets).toEqual({});
  });

  it('builds the pgadmin component as a DOCKER_IMAGE application', () => {
    const [, pgadmin] = resolveServiceTemplateComponents(
      template,
      'my-stack',
      generateSecret,
    );
    expect(pgadmin.type).toBe(ServiceType.APPLICATION);
    expect(pgadmin.sourceType).toBe(SourceType.DOCKER_IMAGE);
    expect(pgadmin.repoPath).toBe('dpage/pgadmin4:latest');
    expect(pgadmin.buildPack).toBe(BuildPack.NONE);
    expect(pgadmin.port).toBe(80);
  });

  it('injects a generated secret into the pgadmin env and reports it', () => {
    const [, pgadmin] = resolveServiceTemplateComponents(
      template,
      'my-stack',
      generateSecret,
    );
    expect(pgadmin.generatedSecrets).toEqual({
      PGADMIN_DEFAULT_PASSWORD: 'fixed-secret',
    });
    const env = JSON.parse(pgadmin.env as string) as Record<string, string>;
    expect(env.PGADMIN_DEFAULT_PASSWORD).toBe('fixed-secret');
    expect(env.PGADMIN_DEFAULT_EMAIL).toBe('admin@platform.local');
  });

  it('uses a fresh random secret per call when no generator is injected', () => {
    const first = resolveServiceTemplateComponents(template, 'a');
    const second = resolveServiceTemplateComponents(template, 'a');
    const firstSecret = first[1].generatedSecrets.PGADMIN_DEFAULT_PASSWORD;
    const secondSecret = second[1].generatedSecrets.PGADMIN_DEFAULT_PASSWORD;
    expect(firstSecret).toHaveLength(32);
    expect(firstSecret).not.toBe(secondSecret);
  });

  it('omits env entirely for a component with no env and no secret', () => {
    const bareTemplate: ServiceTemplate = {
      id: 'bare',
      name: 'Bare',
      description: 'no env component',
      components: [{ nameSuffix: 'svc', type: ServiceType.APPLICATION }],
    };
    const [resolved] = resolveServiceTemplateComponents(bareTemplate, 'x');
    expect(resolved.env).toBeUndefined();
  });
});
