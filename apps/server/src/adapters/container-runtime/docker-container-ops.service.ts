import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';

@Injectable()
export class DockerContainerOpsService {
  private readonly logger = new Logger(DockerContainerOpsService.name);

  async inspectContainer(
    client: Docker,
    containerName: string,
  ): Promise<Docker.ContainerInspectInfo> {
    return client.getContainer(containerName).inspect();
  }

  async listContainers(
    client: Docker,
    all = false,
  ): Promise<Docker.ContainerInfo[]> {
    return client.listContainers({ all });
  }

  async createContainer(
    client: Docker,
    spec: Docker.ContainerCreateOptions,
  ): Promise<Docker.Container> {
    const container = await client.createContainer(spec);
    this.logger.log(
      `Container created: ${spec.Image} → ${container.id.slice(0, 12)}`,
    );
    return container;
  }

  async startContainer(client: Docker, containerName: string): Promise<void> {
    await client.getContainer(containerName).start();
  }

  async stopContainer(
    client: Docker,
    containerName: string,
    timeoutSec = 10,
  ): Promise<void> {
    await client.getContainer(containerName).stop({ t: timeoutSec });
  }

  async restartContainer(
    client: Docker,
    containerName: string,
    timeoutSec = 10,
  ): Promise<void> {
    await client.getContainer(containerName).restart({ t: timeoutSec });
  }

  async removeContainer(
    client: Docker,
    containerName: string,
    force = false,
  ): Promise<void> {
    await client.getContainer(containerName).remove({ force });
  }

  async connectNetwork(
    client: Docker,
    network: string,
    containerName: string,
  ): Promise<void> {
    try {
      await client.getNetwork(network).connect({ Container: containerName });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        !/already exists|already in (the )?network|endpoint with name/i.test(
          msg,
        )
      ) {
        throw error;
      }
    }
  }
}
