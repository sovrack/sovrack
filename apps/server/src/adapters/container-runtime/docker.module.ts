import { Global, Module } from '@nestjs/common';
import { DockerConnectionsService } from './docker-connections.service';
import { DockerConnectionHealthService } from './docker-connection-health.service';
import { DockerApiService } from './docker-api.service';
import { DockerSshService } from './docker-ssh.service';
import { DOCKER_RUNTIME } from './ports/docker-runtime.port';

@Global()
@Module({
  providers: [
    DockerConnectionsService,
    DockerConnectionHealthService,
    DockerApiService,
    // Port : alias du token vers l'implémentation concrète. Les consommateurs
    // injectent @Inject(DOCKER_RUNTIME) IDockerRuntime → substituable.
    { provide: DOCKER_RUNTIME, useExisting: DockerApiService },
    DockerSshService,
  ],
  exports: [
    DockerConnectionsService,
    DockerConnectionHealthService,
    DockerApiService,
    DOCKER_RUNTIME,
    DockerSshService,
  ],
})
export class DockerModule {}
