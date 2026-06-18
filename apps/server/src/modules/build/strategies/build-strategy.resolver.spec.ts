import { DeploymentStrategy } from '@prisma/client';
import { BuildStrategyResolver } from './build-strategy.resolver';
import type { BuildSource } from './build-strategy.interface';

describe('BuildStrategyResolver', () => {
  const resolver = new BuildStrategyResolver();

  const resolve = (buildSource: BuildSource, strategy: DeploymentStrategy = DeploymentStrategy.STANDARD, dockerImage: string | null = null) =>
    resolver.resolve({ buildSource, strategy, dockerImage });

  describe('STATIC', () => {
    it('routes to deploy-static.yml, needsDirectTrigger=true', () => {
      const r = resolve('STATIC');
      expect(r.playbook).toBe('deploy-static.yml');
      expect(r.needsDirectTrigger).toBe(true);
    });
  });

  describe('DOCKER_COMPOSE', () => {
    it('routes to deploy-compose.yml, needsDirectTrigger=true', () => {
      const r = resolve('DOCKER_COMPOSE');
      expect(r.playbook).toBe('deploy-compose.yml');
      expect(r.needsDirectTrigger).toBe(true);
    });
  });

  describe('NIXPACKS_LOCAL', () => {
    it('routes to deploy-nixpacks.yml, needsDirectTrigger=true', () => {
      const r = resolve('NIXPACKS_LOCAL');
      expect(r.playbook).toBe('deploy-nixpacks.yml');
      expect(r.needsDirectTrigger).toBe(true);
    });
  });

  describe('NIXPACKS_REGISTRY', () => {
    it('routes to deploy.yml, needsDirectTrigger=false', () => {
      const r = resolve('NIXPACKS_REGISTRY');
      expect(r.playbook).toBe('deploy.yml');
      expect(r.needsDirectTrigger).toBe(false);
    });
  });

  describe('DOCKERFILE_LOCAL', () => {
    it('routes to deploy-local-build.yml, needsDirectTrigger=true', () => {
      const r = resolve('DOCKERFILE_LOCAL');
      expect(r.playbook).toBe('deploy-local-build.yml');
      expect(r.needsDirectTrigger).toBe(true);
    });
  });

  describe('DOCKERFILE_REGISTRY', () => {
    it('routes to deploy.yml, needsDirectTrigger=false', () => {
      const r = resolve('DOCKERFILE_REGISTRY');
      expect(r.playbook).toBe('deploy.yml');
      expect(r.needsDirectTrigger).toBe(false);
    });
  });

  describe('EXTERNAL_IMAGE', () => {
    it('routes to deploy.yml, needsDirectTrigger=true', () => {
      const r = resolve('EXTERNAL_IMAGE', DeploymentStrategy.STANDARD, 'docker.io/nginx:latest');
      expect(r.playbook).toBe('deploy.yml');
      expect(r.needsDirectTrigger).toBe(true);
    });
  });

  describe('BLUE_GREEN override', () => {
    it('overrides image-based builds with deploy-blue-green.yml', () => {
      const r = resolve('DOCKERFILE_REGISTRY', DeploymentStrategy.BLUE_GREEN);
      expect(r.playbook).toBe('deploy-blue-green.yml');
      expect(r.needsDirectTrigger).toBe(false);
    });

    it('does NOT override DOCKER_COMPOSE', () => {
      const r = resolve('DOCKER_COMPOSE', DeploymentStrategy.BLUE_GREEN);
      expect(r.playbook).toBe('deploy-compose.yml');
      expect(r.needsDirectTrigger).toBe(true);
    });

    it('does NOT override STATIC', () => {
      const r = resolve('STATIC', DeploymentStrategy.BLUE_GREEN);
      expect(r.playbook).toBe('deploy-static.yml');
      expect(r.needsDirectTrigger).toBe(true);
    });
  });

  describe('exhaustive: every BuildSource has a route', () => {
    const allSources: BuildSource[] = [
      'DOCKERFILE_REGISTRY', 'DOCKERFILE_LOCAL',
      'NIXPACKS_REGISTRY', 'NIXPACKS_LOCAL',
      'DOCKER_COMPOSE', 'STATIC', 'EXTERNAL_IMAGE',
    ];
    it.each(allSources)('%s resolves to a valid route', (src) => {
      const r = resolve(src);
      expect(r.playbook).toMatch(/^deploy(-[a-z-]+)?\.yml$/);
      expect(typeof r.needsDirectTrigger).toBe('boolean');
      expect(r.reason.length).toBeGreaterThan(0);
    });
  });
});
