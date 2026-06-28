import { inferType } from './build-type-inference.util';
import type { ParsedProjectSignals } from './project-detection.util';

const emptySignals: ParsedProjectSignals = {
  packageJson: null,
  requirementsTxt: null,
  pyprojectToml: null,
  composerJson: null,
  goMod: null,
  pomXml: null,
  buildGradle: null,
  dockerfile: null,
  dockerCompose: null,
};

describe('BuildDetectorService.inferType (legacy — delegates to inferType util)', () => {
  const infer = (files: string[], signals: Partial<ParsedProjectSignals>) =>
    inferType(files, { ...emptySignals, ...signals });

  it('detects NestJS from @nestjs/core', () => {
    const res = infer(['package.json'], {
      packageJson: { dependencies: { '@nestjs/core': '^11' } },
    });
    expect(res.type).toBe('nestjs');
  });

  it('detects a PostgreSQL service from docker-compose', () => {
    const res = infer(['docker-compose.yml'], {
      dockerCompose: 'services:\n  db:\n    image: postgres:16',
    });
    expect(res.type).toBe('postgres-service');
    expect(res.recommendedPort).toBe(5432);
  });

  it('detects a Redis service from docker-compose', () => {
    const res = infer(['docker-compose.yml'], {
      dockerCompose: 'services:\n  cache:\n    image: redis:7',
    });
    expect(res.type).toBe('redis-service');
    expect(res.recommendedPort).toBe(6379);
  });

  it('detects Go from go.mod', () => {
    const res = infer(['go.mod', 'main.go'], {
      goMod: 'module example.com/app',
    });
    expect(res.framework ?? res.type).toMatch(/go/i);
  });

  it('flags the presence of a Dockerfile and CI config', () => {
    const res = infer(['Dockerfile', '.gitlab-ci.yml'], {});
    expect(res.hasDockerfile).toBe(true);
  });

  it('falls back to a result for an unrecognised project', () => {
    const res = infer(['README.md'], {});
    expect(res.type).toBeTruthy();
  });
});
