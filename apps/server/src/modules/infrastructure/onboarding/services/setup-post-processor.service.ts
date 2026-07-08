import { Injectable, Logger } from '@nestjs/common';
import { Server, ServerLogLevel } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { DockerConnectionsService } from '../../../../adapters/container-runtime/docker-connections.service';
import { ServersDetectionService } from '../../servers/services/servers-detection.service';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import { ServerSetupGateway } from '../gateways/server-setup.gateway';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import { DockerTlsMaterial } from './server-setup-ansible.service';
import { redactSecrets } from './setup-log-utils';

@Injectable()
export class SetupPostProcessorService {
  private readonly logger = new Logger(SetupPostProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dockerConnections: DockerConnectionsService,
    private readonly detection: ServersDetectionService,
    private readonly audit: ServersAuditService,
    private readonly serverRuns: ServerRunsService,
    private readonly gateway: ServerSetupGateway,
  ) {}

  async registerDockerTlsConnection(
    server: Server,
    setupId: string,
    material: DockerTlsMaterial | null,
  ): Promise<void> {
    if (!material) {
      await this.appendLog(
        setupId,
        ServerLogLevel.ERROR,
        'orchestrator',
        'docker_tls: run succeeded but client certificates were not retrieved — ' +
          'Docker connection NOT registered. Register it manually via ' +
          'POST /servers/:id/docker-connection.',
      );
      return;
    }

    const endpoint = `tcp://${server.host}:2376`;
    try {
      await this.dockerConnections.upsert({
        serverId: server.id,
        endpoint,
        tlsCaCert: material.ca,
        tlsClientCert: material.cert,
        tlsClientKey: material.key,
      });
      await this.appendLog(
        setupId,
        ServerLogLevel.INFO,
        'orchestrator',
        `Docker TLS connection registered automatically (${endpoint}).`,
      );
      await this.audit.record(
        server.id,
        'DOCKER_CONNECTION_AUTO_REGISTERED',
        null,
        {
          endpoint,
          via: 'setup:docker_tls',
        },
      );
    } catch (error) {
      await this.appendLog(
        setupId,
        ServerLogLevel.ERROR,
        'orchestrator',
        `docker_tls: automatic Docker connection registration failed: ${
          error instanceof Error ? error.message : String(error)
        }. Register it manually via POST /servers/:id/docker-connection.`,
      );
      return;
    }

    try {
      const probe = await this.dockerConnections.probeReachability(server.id);
      await this.appendLog(
        setupId,
        ServerLogLevel.INFO,
        'orchestrator',
        `Docker TLS connection verified (API v${probe.apiVersion ?? '?'}, ${String(probe.latencyMs)}ms).`,
      );
    } catch (error) {
      await this.appendLog(
        setupId,
        ServerLogLevel.WARNING,
        'orchestrator',
        `Docker TLS connection registered but probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async refreshDetectionAfterSetup(
    server: Server,
    setupId: string,
  ): Promise<void> {
    try {
      const current = await this.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      });
      await this.detection.detect(current);
    } catch (error) {
      await this.appendLog(
        setupId,
        ServerLogLevel.WARNING,
        'orchestrator',
        `Setup succeeded but post-detection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async appendLog(
    setupId: string,
    level: ServerLogLevel,
    source: string,
    message: string,
  ): Promise<void> {
    const created = await this.serverRuns.appendLog(setupId, {
      level,
      source,
      message: redactSecrets(message),
    });
    this.gateway.emitLog({
      setupId: created.runId,
      level: created.level,
      source: created.source,
      message: created.message,
      lineNumber: created.lineNumber,
      createdAt: created.createdAt,
    });
  }
}
