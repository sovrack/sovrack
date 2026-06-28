import { inferType, fallbackUnknownResult } from './build-type-inference.util';
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

const sig = (
  overrides: Partial<ParsedProjectSignals>,
): ParsedProjectSignals => ({
  ...emptySignals,
  ...overrides,
});

describe('inferType', () => {
  it('detects NestJS from @nestjs/core dependency', () => {
    const res = inferType(
      ['package.json'],
      sig({ packageJson: { dependencies: { '@nestjs/core': '^11' } } }),
    );
    expect(res.type).toBe('nestjs');
    expect(res.confidence).toBe('high');
    expect(res.language).toBe('typescript');
  });

  it('detects NestJS from nest-cli.json file', () => {
    const res = inferType(
      ['nest-cli.json', 'package.json'],
      sig({ packageJson: {} }),
    );
    expect(res.type).toBe('nestjs');
  });

  it('detects Next.js from next dependency', () => {
    const res = inferType(
      ['package.json'],
      sig({ packageJson: { dependencies: { next: '^14' } } }),
    );
    expect(res.type).toBe('nextjs');
    expect(res.recommendedPort).toBe(3000);
  });

  it('detects Next.js from next.config.js file', () => {
    const res = inferType(
      ['next.config.js', 'package.json'],
      sig({ packageJson: {} }),
    );
    expect(res.type).toBe('nextjs');
  });

  it('detects React from react + react-dom', () => {
    const res = inferType(
      ['package.json'],
      sig({
        packageJson: { dependencies: { react: '^18', 'react-dom': '^18' } },
      }),
    );
    expect(res.type).toBe('react');
    expect(res.recommendedPort).toBe(80);
  });

  it('detects generic Node.js from package.json alone', () => {
    const res = inferType(['package.json'], sig({ packageJson: {} }));
    expect(res.type).toBe('nodejs');
    expect(res.confidence).toBe('medium');
  });

  it('detects a PostgreSQL service from docker-compose content', () => {
    const res = inferType(
      ['docker-compose.yml'],
      sig({ dockerCompose: 'services:\n  db:\n    image: postgres:16' }),
    );
    expect(res.type).toBe('postgres-service');
    expect(res.recommendedPort).toBe(5432);
    expect(res.recommendedStrategy).toBe('service-container');
  });

  it('detects a Redis service from docker-compose content', () => {
    const res = inferType(
      ['docker-compose.yml'],
      sig({ dockerCompose: 'services:\n  cache:\n    image: redis:7' }),
    );
    expect(res.type).toBe('redis-service');
    expect(res.recommendedPort).toBe(6379);
  });

  it('detects Django from manage.py', () => {
    const res = inferType(
      ['manage.py', 'requirements.txt'],
      sig({ requirementsTxt: 'django\ngunicorn\n' }),
    );
    expect(res.type).toBe('django');
    expect(res.language).toBe('python');
  });

  it('detects generic Python from requirements.txt', () => {
    const res = inferType(
      ['requirements.txt'],
      sig({ requirementsTxt: 'flask\n' }),
    );
    expect(res.type).toBe('python');
  });

  it('detects Laravel from artisan file', () => {
    const res = inferType(
      ['artisan', 'composer.json'],
      sig({ composerJson: '{}' }),
    );
    expect(res.type).toBe('laravel');
    expect(res.language).toBe('php');
  });

  it('detects PHP from composer.json alone', () => {
    const res = inferType(
      ['composer.json'],
      sig({ composerJson: '{"require":{}}' }),
    );
    expect(res.type).toBe('php');
  });

  it('detects Go from go.mod signal', () => {
    const res = inferType(
      ['go.mod', 'main.go'],
      sig({ goMod: 'module example.com/app' }),
    );
    expect(res.type).toBe('go');
    expect(res.packageManager).toBe('go-modules');
  });

  it('detects Spring Boot from pom.xml signal', () => {
    const res = inferType(
      ['pom.xml'],
      sig({ pomXml: '<artifactId>spring-boot-starter</artifactId>' }),
    );
    expect(res.type).toBe('spring-boot');
    expect(res.packageManager).toBe('maven');
  });

  it('detects generic Java from pom.xml without Spring Boot', () => {
    const res = inferType(
      ['pom.xml'],
      sig({ pomXml: '<artifactId>my-app</artifactId>' }),
    );
    expect(res.type).toBe('java');
  });

  it('detects Dockerfile-based project', () => {
    const res = inferType(['Dockerfile'], emptySignals);
    expect(res.type).toBe('dockerized');
    expect(res.hasDockerfile).toBe(true);
  });

  it('uses docker-multi-stage strategy for multi-stage Dockerfiles', () => {
    const dockerfile =
      'FROM node:18 AS build\nRUN npm ci\nFROM node:18-slim\nCOPY --from=build /app .';
    const res = inferType(['Dockerfile'], sig({ dockerfile }));
    expect(res.recommendedStrategy).toBe('docker-multi-stage');
  });

  it('detects static frontend from index.html', () => {
    const res = inferType(['index.html', 'style.css'], emptySignals);
    expect(res.type).toBe('static-frontend');
    expect(res.recommendedStrategy).toBe('static-build');
  });

  it('falls back to unknown for unrecognised project', () => {
    const res = inferType(['README.md'], emptySignals);
    expect(res.type).toBe('unknown');
    expect(res.confidence).toBe('low');
  });

  it('sets hasDockerfile and hasCiConfig flags correctly', () => {
    const res = inferType(['Dockerfile', '.gitlab-ci.yml'], emptySignals);
    expect(res.hasDockerfile).toBe(true);
    expect(res.hasCiConfig).toBe(true);
  });

  it('detects GitHub Actions CI from .github/workflows path', () => {
    const res = inferType(
      ['.github/workflows/ci.yml', 'package.json'],
      sig({ packageJson: {} }),
    );
    expect(res.hasCiConfig).toBe(true);
  });

  it('detects pnpm package manager from lockfile', () => {
    const res = inferType(
      ['pnpm-lock.yaml', 'package.json'],
      sig({ packageJson: {} }),
    );
    expect(res.packageManager).toBe('pnpm');
  });
});

describe('fallbackUnknownResult', () => {
  it('returns unknown type with provided reasons', () => {
    const res = fallbackUnknownResult('reason A', 'reason B');
    expect(res.type).toBe('unknown');
    expect(res.reasons).toEqual(['reason A', 'reason B']);
  });
});
