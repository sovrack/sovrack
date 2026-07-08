import { Global, Module } from '@nestjs/common';
import { DockerClientFactory } from './docker-client.factory';
import { DockerConnectionsService } from './docker-connections.service';
import { DockerConnectionHealthService } from './docker-connection-health.service';
import { DockerApiService } from './docker-api.service';
import { DockerContainerOpsService } from './docker-container-ops.service';
import { DockerImageService } from './docker-image.service';
import { DockerSshService } from './docker-ssh.service';
import { DOCKER_RUNTIME } from './ports/docker-runtime.port';

@Global()
@Module({
  providers: [
    DockerClientFactory,
    DockerConnectionsService,
    DockerConnectionHealthService,
    DockerApiService,
    DockerContainerOpsService,
    DockerImageService,
    // Port : alias du token vers l'implémentation concrète. Les consommateurs
    // injectent @Inject(DOCKER_RUNTIME) IDockerRuntime → substituable.
    { provide: DOCKER_RUNTIME, useExisting: DockerApiService },
    DockerSshService,
  ],
  exports: [
    DockerClientFactory,
    DockerConnectionsService,
    DockerConnectionHealthService,
    DockerApiService,
    DockerContainerOpsService,
    DockerImageService,
    DOCKER_RUNTIME,
    DockerSshService,
  ],
})
export class DockerModule {}
