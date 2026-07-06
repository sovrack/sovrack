import type { BuildSource } from '../../build/strategies/build-strategy.interface';

/**
 * B-3 fix: single source of truth for BuildSource resolution.
 *
 * Previously duplicated in:
 *  - `deployments-validation.service.ts` (backend, inline inside validate())
 *  - `deploy-dialog.tsx` (frontend, resolveBuildSource())
 *
 * The backend now calls this utility; the frontend derives buildSource from the
 * validation API response (which returns `effectiveBuildSource`) so it no longer
 * needs its own copy.
 */
export function resolveBuildSource(opts: {
  buildPack: string | null;
  buildMode: string | null;
  sourceType: string | null;
}): BuildSource {
  const { buildPack, buildMode, sourceType } = opts;

  if (sourceType === 'DOCKER_IMAGE') return 'EXTERNAL_IMAGE';
  if (buildPack === 'NIXPACKS') {
    return buildMode === 'REGISTRY' ? 'NIXPACKS_REGISTRY' : 'NIXPACKS_LOCAL';
  }
  if (buildPack === 'STATIC') return 'STATIC';
  if (buildPack === 'DOCKER_COMPOSE') return 'DOCKER_COMPOSE';
  if (buildPack === 'NONE') return 'EXTERNAL_IMAGE';

  // Default: Dockerfile
  return buildMode === 'REGISTRY' ? 'DOCKERFILE_REGISTRY' : 'DOCKERFILE_LOCAL';
}

/**
 * Whether a BuildSource is built on the target VPS (true) or pulled from a
 * registry (false). Single source of truth — must be derived from BuildSource
 * (buildPack + buildMode combined), never from buildPack alone, or e.g.
 * DOCKERFILE_LOCAL and DOCKERFILE_REGISTRY become indistinguishable.
 */
export function isLocalBuildSource(src: BuildSource): boolean {
  return (
    src === 'DOCKERFILE_LOCAL' ||
    src === 'NIXPACKS_LOCAL' ||
    src === 'STATIC' ||
    src === 'DOCKER_COMPOSE'
  );
}
