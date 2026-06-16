import { Injectable } from '@nestjs/common';
import { DeploymentStrategy } from '@prisma/client';
import type {
  BuildContext,
  BuildSource,
  DeployRoute,
} from './build-strategy.interface';

/**
 * Single source of truth for how a deployment is realised.
 *
 * Direct map: one {@link BuildSource} value → one {@link DeployRoute}.
 * No more (buildPack + isLocalBuild) crossing — the caller passes a single
 * `buildSource` that already encodes both the tool and the build location.
 *
 * Adding a new source = add one entry to ROUTES + one value to BuildSource.
 */
const ROUTES: Record<BuildSource, DeployRoute> = {
  DOCKERFILE_REGISTRY: {
    needsDirectTrigger: false,
    reason: 'Dockerfile built by CI → pushed to registry → pulled on VPS',
  },
  DOCKERFILE_LOCAL: {
    needsDirectTrigger: true,
    reason: 'Dockerfile built directly on the VPS (no registry needed)',
  },
  NIXPACKS_REGISTRY: {
    needsDirectTrigger: false,
    reason: 'Nixpacks image built by CI → registry → pulled on VPS',
  },
  NIXPACKS_LOCAL: {
    needsDirectTrigger: true,
    reason: 'Nixpacks builds the image directly on the VPS',
  },
  DOCKER_COMPOSE: {
    needsDirectTrigger: true,
    reason: 'docker-compose.yml runs on the VPS (no image build)',
  },
  STATIC: {
    needsDirectTrigger: true,
    reason: 'Static files served by Nginx on the VPS',
  },
  EXTERNAL_IMAGE: {
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
        needsDirectTrigger: false,
        reason: 'Blue-green strategy wraps image-based deployments',
      };
    }

    const route = ROUTES[ctx.buildSource];
    if (!route) {
      throw new Error(
        `No route registered for buildSource: ${String(ctx.buildSource)}`,
      );
    }
    return route;
  }
}
