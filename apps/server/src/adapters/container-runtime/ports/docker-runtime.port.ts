import type { DockerApiService } from '../docker-api.service';

/**
 * Port (contrat) du runtime de conteneurs (Docker Engine API sur TLS).
 *
 * Les modules métier (deployments, observability…) dépendent de cette
 * abstraction via le token {@link DOCKER_RUNTIME}, jamais de l'implémentation
 * concrète. Permet de substituer l'implémentation (ex. futur agent serveur Go,
 * ou un runtime alternatif) et de tester sans Docker réel.
 *
 * Le contrat est dérivé (`Pick`) de l'implémentation de référence : il reste
 * automatiquement synchronisé avec les signatures, sans duplication manuelle
 * de 20 méthodes (source d'erreurs).
 */
export type IDockerRuntime = Pick<
  DockerApiService,
  | 'getClient'
  | 'inspectImage'
  | 'inspectContainer'
  | 'streamContainerLogs'
  | 'getContainerStats'
  | 'listContainers'
  | 'createContainer'
  | 'startContainer'
  | 'connectNetwork'
  | 'stopContainer'
  | 'restartContainer'
  | 'removeContainer'
  | 'execCapture'
  | 'execWithInput'
  | 'buildImage'
  | 'pullImage'
  | 'pruneDanglingImages'
  | 'createVolume'
  | 'removeVolume'
  | 'createNetwork'
>;

/** Token DI pour injecter {@link IDockerRuntime}. */
export const DOCKER_RUNTIME = Symbol('DOCKER_RUNTIME');
