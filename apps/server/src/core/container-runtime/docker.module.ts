import { Global, Module } from '@nestjs/common';
import { DockerConnectionsService } from './docker-connections.service';
import { DockerConnectionHealthService } from './docker-connection-health.service';
import { DockerApiService } from './docker-api.service';
import { DockerSshService } from './docker-ssh.service';

@Global()
@Module({
  providers: [
    DockerConnectionsService,
    DockerConnectionHealthService,
    DockerApiService,
    DockerSshService,
  ],
  exports: [
    DockerConnectionsService,
    DockerConnectionHealthService,
    DockerApiService,
    DockerSshService,
  ],
})
export class DockerModule {}
