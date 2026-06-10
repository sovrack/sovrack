import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Deployment, DeploymentStatus, Prisma } from '@prisma/client';
import { rm } from 'fs/promises';
import {
  SshExecutorService,
  type SshConnection,
} from '../../../core/ssh/ssh-executor.service';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  ServerHostKeyService,
  ServersCryptoService,
} from '../../servers/services';
import { AnsibleRunnerService } from '../../../core/ansible/ansible-runner.service';
import { BuildImageService } from '../../build/services/build-image.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from './deployments-healthcheck.service';
import { DeploymentEnvResolverService } from './deployment-env-resolver.service';
import { DeploymentContainerInspectorService } from './deployment-container-inspector.service';

type DeploymentLogLevel = 'info' | 'error' | 'success';

@Injectable()
export class DeploymentsExecutorService {
  private readonly logger = new Logger(DeploymentsExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serversCryptoService: ServersCryptoService,
    private readonly serverHostKeyService: ServerHostKeyService,
    private readonly ssh: SshExecutorService,
    private readonly dockerService: BuildImageService,
    private readonly ansibleRunner: AnsibleRunnerService,
    private readonly gateway: DeploymentsGateway,
    private readonly healthcheckService: DeploymentsHealthcheckService,
    private readonly envResolver: DeploymentEnvResolverService,
    private readonly containerInspector: DeploymentContainerInspectorService,
  ) {}

  /**
   * Builds a K8s-style condition set for the immutable Release status, so the
   * deployment carries a structured, machine-readable reconciliation status
   * (Progressing / Ready / Degraded with reason + message) alongside the plain
   * status enum. This is the observability primitive the future reconciler reads.
   */
  private buildConditions(
    type: 'Progressing' | 'Ready' | 'Degraded',
    reason: string,
    message: string,
  ): Prisma.InputJsonValue {
    return [
      {
        type,
        status: type === 'Degraded' ? 'False' : 'True',
        reason,
        message,
        lastTransitionAt: new Date().toISOString(),
      },
    ];
  }

  async deployWithAnsible(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<Deployment> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: true,
        service: true,
        environment: {
          include: {
            server: true,
            serviceTargets: { include: { server: true } },
          },
        },
        user: true,
        build: true,
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement non trouvé');

    const serviceTarget = deployment.serviceId
      ? deployment.environment.serviceTargets.find(
          (t) => t.serviceId === deployment.serviceId,
        )
      : null;
    const server = serviceTarget?.server ?? deployment.environment.server;
    if (!server) throw new BadRequestException('Aucun serveur cible trouvé');
    const decryptedSshKey = this.decryptSshKey(server.sshKey);

    if (!server.isVerified) throw new BadRequestException('Serveur non vérifié');

    await this.runSshPreflight(server, decryptedSshKey);

    const allConfigs = await this.envResolver.resolveEnvConfigs(deployment);
    const { route, isLocalBuild } = this.envResolver.resolveRoute(deployment);
    const isComposeDeployment = (deployment.dockerImage ?? '').startsWith('compose://');
    const playbookRoot = this.envResolver.resolvePlaybookRoot();
    const serviceName = deployment.service?.name;

    this.logger.log(
      `[Deployment ${deployment.id}] Using playbook: ${route.playbook} (strategy=${deployment.strategy}, isLocalBuild=${String(isLocalBuild)}) — ${route.reason}`,
    );

    const dockerImage = isComposeDeployment
      ? (deployment.dockerImage ?? `compose://${deployment.project.name}`)
      : (overrideImage ??
          deployment.dockerImage ??
          (await this.dockerService.buildDockerImage({
            projectId: deployment.project.id,
            projectName: serviceName
              ? `${deployment.project.name}-${serviceName}`
              : deployment.project.name,
            branch: deployment.branch,
            serviceId: deployment.serviceId ?? undefined,
          })));

    const registryAuth = await this.envResolver.resolveRegistryAuth(deployment.project.id);
    const imageShaOverride = deployment.build?.imageSha ?? deployment.imageSha ?? null;

    const { tmpPath, inventoryPath, varsPath, privateKeyPath, playbookPath } =
      await this.envResolver.writeTmpFiles(
        deployment,
        server,
        decryptedSshKey,
        dockerImage,
        allConfigs,
        playbookRoot,
        isComposeDeployment,
        isLocalBuild,
        route.playbook,
        serviceTarget?.port,
        serviceTarget?.domain ?? deployment.environment.domain,
        registryAuth,
        imageShaOverride,
      );

    const currentLogs = deployment.logs ?? '';
    await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        conditions: this.buildConditions('Progressing', 'AnsibleRunning', 'Exécution Ansible en cours.'),
        logs: `${currentLogs}\nExécution Ansible en cours...`.trim(),
      },
    });

    let commandLogs = '';
    try {
      commandLogs = await this.runAnsible(inventoryPath, varsPath, privateKeyPath, playbookPath, deployment.id);

      const healthCheckLogs = await this.healthcheckService.runPostDeployHealthChecks({
        deploymentId: deployment.id,
        environmentDomain: deployment.environment.domain,
        serviceDomain: serviceTarget?.domain,
        serverHost: server.host,
        appPort: serviceTarget?.port ?? deployment.project.port,
      });

      const imageSha = await this.containerInspector.resolveImageDigest(
        server.id,
        server,
        decryptedSshKey,
        dockerImage,
      );

      const finished = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.SUCCESS,
          dockerImage,
          imageSha,
          conditions: this.buildConditions('Ready', 'DeploySucceeded', 'Déploiement réussi et sain.'),
          observedGeneration: 1,
          finishedAt: new Date(),
          logs: `${currentLogs}\n${commandLogs}\n${healthCheckLogs}`.trim(),
        },
      });

      this.gateway.emitStatus({ deploymentId: finished.id, status: finished.status });
      this.gateway.emitFinished({ deploymentId: finished.id, status: finished.status, finishedAt: finished.finishedAt });

      return finished;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec lors de l'exécution du playbook Ansible";

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          conditions: this.buildConditions('Degraded', 'DeployFailed', message),
          observedGeneration: 1,
          finishedAt: new Date(),
          logs: `${currentLogs}\n${commandLogs}\n${message}`.trim(),
        },
      });

      this.gateway.emitStatus({ deploymentId: failed.id, status: failed.status });
      this.gateway.emitFinished({ deploymentId: failed.id, status: failed.status, finishedAt: failed.finishedAt });

      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Déploiement Ansible échoué');
    } finally {
      try {
        await Promise.all([
          rm(tmpPath, { recursive: true, force: true }),
          rm(privateKeyPath, { force: true }),
        ]);
      } catch (cleanupErr) {
        this.logger.warn(`Cleanup failed for ${deploymentId}: ${cleanupErr instanceof Error ? cleanupErr.message : 'unknown error'}`);
      }
    }
  }

  async runAnsible(
    inventoryPath: string,
    varsPath: string,
    privateKeyPath: string,
    playbookPath: string,
    deploymentId: string,
  ): Promise<string> {
    const timeoutMs = this.envResolver.resolveDeploymentTimeoutMs();
    const controller = new AbortController();
    const args = [
      playbookPath,
      '-i', inventoryPath,
      '--private-key', privateKeyPath,
      '--ssh-common-args', this.serverHostKeyService.resolveSshCommonArgs(),
      '--extra-vars', `@${varsPath}`,
    ];

    return this.ansibleRunner.runPlaybook(
      args,
      { cwd: this.envResolver.resolvePlaybookRoot(), extraEnv: { ANSIBLE_HOST_KEY_CHECKING: 'True' } },
      { signal: controller.signal, timeoutMs },
      { onLog: (event) => this.emitGatewayLog(deploymentId, event.message, event.source === 'stderr' ? 'error' : 'info') },
    );
  }

  async getContainerLogs(deploymentId: string, tail = 300): Promise<string> {
    return this.containerInspector.getContainerLogs(deploymentId, tail);
  }

  decryptSshKey(encryptedValue: string): string {
    return this.serversCryptoService.decrypt(encryptedValue);
  }

  emitGatewayLog(deploymentId: string, rawMessage: string, fallbackLevel: 'info' | 'error'): void {
    const lines = rawMessage.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
      this.gateway.emitLog({
        deploymentId,
        message: line,
        level: this.inferLogLevel(line, fallbackLevel),
        timestamp: new Date().toISOString(),
      });
    }
  }

  inferLogLevel(message: string, fallbackLevel: 'info' | 'error'): DeploymentLogLevel {
    if (/error|fail|fatal|exception/i.test(message)) return 'error';
    if (/success|ok|done|completed|ready/i.test(message)) return 'success';
    return fallbackLevel;
  }

  private async runSshPreflight(
    server: { host: string; port: number; username: string },
    privateKey: string,
  ): Promise<void> {
    const pinnedHost = await this.serverHostKeyService.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey,
        expectedHostKey: pinnedHost.keyBase64,
        readyTimeoutMs: 10_000,
      });
    } catch {
      throw new BadRequestException('Connexion SSH échouée vers le serveur cible');
    } finally {
      if (conn) await conn.dispose();
    }
  }
}
