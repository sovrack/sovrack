import { Injectable } from '@nestjs/common';
import { DeploymentStrategy } from '@prisma/client';
import type { BuildContext, BuildSource, DeployRoute } from './build-strategy.interface';

/**
 * Single source of truth for which Ansible playbook realises a deployment.
 *
 * Direct map: one {@link BuildSource} value → one {@link DeployRoute}.
 * No more (buildPack + isLocalBuild) crossing — the caller passes a single
 * `buildSource` that already encodes both the tool and the build location.
 *
 * Adding a new source = add one entry to ROUTES + one value to BuildSource.
 */
const ROUTES: Record<BuildSource, Omit<DeployRoute, 'reason'> & { reason: string }> = {
  DOCKERFILE_REGISTRY: {
    playbook: 'deploy.yml',
    needsDirectTrigger: false,
    reason: 'Dockerfile built by CI → pushed to registry → pulled on VPS',
  },
  DOCKERFILE_LOCAL: {
    playbook: 'deploy-local-build.yml',
    needsDirectTrigger: true,
    reason: 'Dockerfile built directly on the VPS (no registry needed)',
  },
  NIXPACKS_REGISTRY: {
    playbook: 'deploy.yml',
    needsDirectTrigger: false,
    reason: 'Nixpacks image built by CI → registry → pulled on VPS',
  },
  NIXPACKS_LOCAL: {
    playbook: 'deploy-nixpacks.yml',
    needsDirectTrigger: true,
    reason: 'Nixpacks builds the image directly on the VPS',
  },
  DOCKER_COMPOSE: {
    playbook: 'deploy-compose.yml',
    needsDirectTrigger: true,
    reason: 'docker-compose.yml runs on the VPS (no image build)',
  },
  STATIC: {
    playbook: 'deploy-static.yml',
    needsDirectTrigger: true,
    reason: 'Static files served by Nginx on the VPS',
  },
  EXTERNAL_IMAGE: {
    playbook: 'deploy.yml',
    needsDirectTrigger: true,
    reason: 'Pre-built external image pulled as-is on the VPS',
  },
};

@Injectable()
export class BuildStrategyResolver {
  resolve(ctx: BuildContext): DeployRoute {
    // Blue-green wraps any image-based deployment (STATIC / COMPOSE excepted).
    if (
      ctx.strategy === DeploymentStrategy.BLUE_GREEN &&
      ctx.buildSource !== 'STATIC' &&
      ctx.buildSource !== 'DOCKER_COMPOSE'
    ) {
      return {
        playbook: 'deploy-blue-green.yml',
        needsDirectTrigger: false,
        reason: 'Blue-green strategy wraps image-based deployments',
      };
    }

    const route = ROUTES[ctx.buildSource];
    if (!route) {
      throw new Error(`No route registered for buildSource: ${String(ctx.buildSource)}`);
    }
    return route;
  }
}
