import { DeploymentStrategy } from '@prisma/client';

/**
 * Single concept replacing the former (buildPack + buildMode) pair.
 *
 * Each value maps unambiguously to one Ansible playbook and one CI decision:
 *
 *  DOCKERFILE_REGISTRY  — Dockerfile built by CI, image pushed to registry,
 *                         pulled on the VPS.            → deploy.yml
 *  DOCKERFILE_LOCAL     — Dockerfile built by `docker build` on the VPS.
 *                         No registry needed.           → deploy-local-build.yml
 *  NIXPACKS_REGISTRY    — Nixpacks build by CI → registry → pull on VPS.
 *                                                        → deploy.yml
 *  NIXPACKS_LOCAL       — Nixpacks builds directly on the VPS.
 *                                                        → deploy-nixpacks.yml
 *  DOCKER_COMPOSE       — docker-compose.yml runs on the VPS (no image build).
 *                                                        → deploy-compose.yml
 *  STATIC               — Static files served by Nginx; no Docker image.
 *                                                        → deploy-static.yml
 *  EXTERNAL_IMAGE       — Pre-built image provided by the user (docker pull).
 *                                                        → deploy.yml
 */
export type BuildSource =
  | 'DOCKERFILE_REGISTRY'
  | 'DOCKERFILE_LOCAL'
  | 'NIXPACKS_REGISTRY'
  | 'NIXPACKS_LOCAL'
  | 'DOCKER_COMPOSE'
  | 'STATIC'
  | 'EXTERNAL_IMAGE';

/**
 * Where/how the deployable image is produced and which Ansible playbook
 * realises it. Ansible always performs the actual `docker build` / `docker run`
 * / `docker compose up` on the target VPS — a strategy only decides the route.
 */
export type DeployRoute = {
  /**
   * If true the backend must trigger the playbook directly (no external CI
   * pipeline will fire to call back). Single source of truth for the
   * "no GitLab CI" decision.
   */
  needsDirectTrigger: boolean;
  /** Human-readable reason, logged for debugging. */
  reason: string;
};

export type BuildContext = {
  buildSource: BuildSource;
  strategy: DeploymentStrategy;
  dockerImage: string | null;
};

/** One implementation per BuildSource. */
export interface IBuildStrategy {
  readonly buildSource: BuildSource;
  resolveRoute(ctx: BuildContext): DeployRoute;
}
