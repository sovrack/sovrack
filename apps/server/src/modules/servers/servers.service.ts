import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Server,
  ServerConnectionMode,
  ServerJob,
  ServerJobStatus,
  ServerJobType,
} from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
} from 'crypto';
import { NodeSSH } from 'node-ssh';
import type { Duplex } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateServerDto,
  ServerConnectionModeDto,
  ServerVerificationMode,
} from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';

type ServerPublic = Omit<
  Server,
  'sshKey' | 'bastionSshKey' | 'agentTokenHash' | 'connectionMode'
> & {
  connectionMode: ServerConnectionModeDto;
};
type CreateServerResult = ServerPublic & { agentBootstrapToken?: string };
type ServerJobPublic = Omit<ServerJob, 'payload'>;

type InstallToolsDto = {
  docker?: boolean;
  ansible?: boolean;
  runner?: boolean;
};

type RegisterRunnerPayload = {
  gitlabUrl: string;
};

type SshConnection = {
  target: NodeSSH;
  bastion?: NodeSSH;
};

class JobTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`JOB_TIMEOUT_${String(timeoutMs)}`);
  }
}

@Injectable()
export class ServersService {
  private readonly defaultJobTimeoutMs = 45_000;
  private readonly defaultJobMaxAttempts = 3;

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServerDto, actorUserId: string): Promise<CreateServerResult> {
    const connectionMode = this.mapConnectionMode(dto.connectionMode);
    const normalizedSshKey = dto.sshKey?.trim();
    const sshMaterial = this.resolveSshMaterial(normalizedSshKey);

    if (connectionMode === ServerConnectionMode.BASTION) {
      this.assertBastionConfig(
        dto.bastionHost,
        dto.bastionUsername,
        dto.bastionSshKey,
      );
    }

    const agentBootstrapToken =
      connectionMode === ServerConnectionMode.AGENT
        ? randomBytes(24).toString('hex')
        : undefined;

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 22,
        username: dto.username ?? 'ubuntu',
        sshKey: this.encrypt(sshMaterial.privateKey),
        sshPublicKey: sshMaterial.publicKey,
        connectionMode,
        bastionHost: dto.bastionHost,
        bastionPort: dto.bastionPort,
        bastionUsername: dto.bastionUsername,
        bastionSshKey: dto.bastionSshKey
          ? this.encrypt(dto.bastionSshKey)
          : null,
        agentTokenHash: agentBootstrapToken
          ? this.hashToken(agentBootstrapToken)
          : null,
      },
    });

    await this.recordAuditLog(actorUserId, 'SERVER_CREATE', server.id, {
      name: server.name,
      host: server.host,
      connectionMode: server.connectionMode,
    });

    const verificationMode = dto.verificationMode ?? ServerVerificationMode.SSH;

    if (
      verificationMode === ServerVerificationMode.SSH &&
      connectionMode !== ServerConnectionMode.AGENT
    ) {
      try {
        const verified = await this.verifyServer(server.id);
        return {
          ...verified,
          ...(agentBootstrapToken && { agentBootstrapToken }),
        };
      } catch {
        // La création ne doit pas échouer si la vérification auto échoue.
      }
    }

    return {
      ...this.toPublic(server),
      ...(agentBootstrapToken && { agentBootstrapToken }),
    };
  }

  async findAll(): Promise<ServerPublic[]> {
    const servers = await this.prisma.server.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return servers.map((server) => this.toPublic(server));
  }

  async findOne(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    return this.toPublic(server);
  }

  async update(
    id: string,
    dto: UpdateServerDto,
    actorUserId: string,
  ): Promise<ServerPublic> {
    const existing = await this.getServerById(id);

    const nextConnectionMode =
      dto.connectionMode !== undefined
        ? this.mapConnectionMode(dto.connectionMode)
        : existing.connectionMode;

    if (nextConnectionMode === ServerConnectionMode.BASTION) {
      this.assertBastionConfig(
        dto.bastionHost ?? existing.bastionHost ?? undefined,
        dto.bastionUsername ?? existing.bastionUsername ?? undefined,
        dto.bastionSshKey ?? existing.bastionSshKey ?? undefined,
      );
    }

    const resetVerification =
      dto.host !== undefined ||
      dto.port !== undefined ||
      dto.username !== undefined ||
      dto.sshKey !== undefined ||
      dto.connectionMode !== undefined ||
      dto.bastionHost !== undefined ||
      dto.bastionPort !== undefined ||
      dto.bastionUsername !== undefined ||
      dto.bastionSshKey !== undefined;

    const data: Prisma.ServerUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.host !== undefined && { host: dto.host }),
      ...(dto.port !== undefined && { port: dto.port }),
      ...(dto.username !== undefined && { username: dto.username }),
      ...(dto.sshKey !== undefined && { sshKey: this.encrypt(dto.sshKey) }),
      ...(dto.connectionMode !== undefined && {
        connectionMode: this.mapConnectionMode(dto.connectionMode),
      }),
      ...(dto.bastionHost !== undefined && {
        bastionHost: dto.bastionHost || null,
      }),
      ...(dto.bastionPort !== undefined && {
        bastionPort: dto.bastionPort || null,
      }),
      ...(dto.bastionUsername !== undefined && {
        bastionUsername: dto.bastionUsername || null,
      }),
      ...(dto.bastionSshKey !== undefined && {
        bastionSshKey: dto.bastionSshKey
          ? this.encrypt(dto.bastionSshKey)
          : null,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.isVerified !== undefined && { isVerified: dto.isVerified }),
      ...(dto.hasDocker !== undefined && { hasDocker: dto.hasDocker }),
      ...(dto.hasAnsible !== undefined && { hasAnsible: dto.hasAnsible }),
      ...(dto.hasRunner !== undefined && { hasRunner: dto.hasRunner }),
      ...(resetVerification && {
        isVerified: false,
        hasDocker: false,
        hasAnsible: false,
        hasRunner: false,
      }),
    };

    const updated = await this.prisma.server.update({
      where: { id },
      data,
    });

    await this.recordAuditLog(actorUserId, 'SERVER_UPDATE', updated.id, {
      changedFields: Object.keys(dto),
    });

    return this.toPublic(updated);
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    await this.getServerById(id);

    const activeEnvCount = await this.prisma.environment.count({
      where: {
        serverId: id,
        isActive: true,
      },
    });

    if (activeEnvCount > 0) {
      throw new BadRequestException(
        'Suppression impossible: ce serveur a des environnements actifs',
      );
    }

    await this.prisma.server.delete({ where: { id } });
    await this.recordAuditLog(actorUserId, 'SERVER_DELETE', id);
  }

  async listJobs(id: string): Promise<ServerJobPublic[]> {
    await this.getServerById(id);

    const jobs = await this.prisma.serverJob.findMany({
      where: { serverId: id },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job) => this.toPublicJob(job));
  }

  async retryJob(id: string, jobId: string): Promise<ServerPublic> {
    const job = await this.prisma.serverJob.findFirst({
      where: {
        id: jobId,
        serverId: id,
      },
    });

    if (!job) {
      throw new NotFoundException('Job serveur non trouvé');
    }

    if (job.type === ServerJobType.VERIFY) {
      return await this.verifyServer(id);
    }

    if (job.type === ServerJobType.INSTALL_TOOLS) {
      const payload =
        (job.payload as InstallToolsDto | null | undefined) ?? undefined;
      return await this.installTools(id, payload);
    }

    throw new BadRequestException(
      'Ce type de job nécessite des paramètres non rejouables',
    );
  }

  async verifyServer(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const job = await this.createJob(server.id, ServerJobType.VERIFY);

    if (server.connectionMode === ServerConnectionMode.AGENT) {
      await this.markJobAgentPending(
        job.id,
        'Vérification en attente de l’agent',
      );
      return this.toPublic(server);
    }

    return await this.executeJobWithRetry(job, async () => {
      return await this.verifyServerDirect(id);
    });
  }

  async installTools(
    id: string,
    tools?: InstallToolsDto,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const payload: InstallToolsDto = {
      docker: tools?.docker ?? true,
      ansible: tools?.ansible ?? true,
      runner: tools?.runner ?? true,
    };

    const job = await this.createJob(
      server.id,
      ServerJobType.INSTALL_TOOLS,
      payload,
    );

    if (server.connectionMode === ServerConnectionMode.AGENT) {
      await this.markJobAgentPending(
        job.id,
        'Installation en attente de l’agent',
      );
      return this.toPublic(server);
    }

    return await this.executeJobWithRetry(job, async () => {
      return await this.installToolsDirect(id, payload);
    });
  }

  async installPublicKey(
    id: string,
    password: string,
  ): Promise<{ success: true; message: string }> {
    const server = await this.getServerById(id);

    if (server.connectionMode !== ServerConnectionMode.SSH) {
      throw new BadRequestException(
        'Installation de clé par mot de passe disponible uniquement en mode SSH direct',
      );
    }

    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new BadRequestException(
        'Le mot de passe temporaire est obligatoire',
      );
    }

    const publicKey = server.sshPublicKey?.trim();
    if (!publicKey) {
      throw new BadRequestException(
        'Clé publique introuvable pour ce serveur. Regénérez une paire SSH.',
      );
    }

    const setupConnection = new NodeSSH();
    try {
      await setupConnection.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        password: normalizedPassword,
        readyTimeout: 10_000,
      });

      await this.execOrThrow(
        setupConnection,
        'mkdir -p ~/.ssh',
        'Échec création du dossier ~/.ssh',
      );
      await this.execOrThrow(
        setupConnection,
        'chmod 700 ~/.ssh',
        'Échec chmod 700 ~/.ssh',
      );
      await this.execOrThrow(
        setupConnection,
        'touch ~/.ssh/authorized_keys',
        'Échec création du fichier authorized_keys',
      );

      const escapedPublicKey = this.shellQuote(publicKey);
      await this.execOrThrow(
        setupConnection,
        `grep -qxF ${escapedPublicKey} ~/.ssh/authorized_keys || echo ${escapedPublicKey} >> ~/.ssh/authorized_keys`,
        'Échec ajout de la clé publique dans authorized_keys',
      );

      await this.execOrThrow(
        setupConnection,
        'chmod 600 ~/.ssh/authorized_keys',
        'Échec chmod 600 ~/.ssh/authorized_keys',
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        'Connexion SSH par mot de passe échouée. Vérifiez host/port/username/password.',
      );
    } finally {
      setupConnection.dispose();
    }

    const keyConnection = new NodeSSH();
    try {
      await keyConnection.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: this.decrypt(server.sshKey),
        readyTimeout: 10_000,
      });
    } catch {
      throw new BadRequestException(
        'La clé a été installée mais la connexion SSH par clé a échoué',
      );
    } finally {
      keyConnection.dispose();
    }

    await this.prisma.server.update({
      where: { id },
      data: { isVerified: true },
    });

    return {
      success: true,
      message: 'Clé installée et connexion SSH vérifiée',
    };
  }

  async registerRunner(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const job = await this.createJob(server.id, ServerJobType.REGISTER_RUNNER, {
      gitlabUrl,
    } satisfies RegisterRunnerPayload);

    if (server.connectionMode === ServerConnectionMode.AGENT) {
      await this.markJobAgentPending(
        job.id,
        'Enregistrement runner en attente de l’agent',
      );
      return this.toPublic(server);
    }

    return await this.executeJobWithRetry(job, async () => {
      return await this.registerRunnerDirect(id, gitlabUrl, token);
    });
  }

  private async verifyServerDirect(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const connection = await this.openConnection(server);

    try {
      const docker = await connection.target.execCommand('docker --version');
      const ansible = await connection.target.execCommand('ansible --version');
      const runner = await connection.target.execCommand(
        'gitlab-runner --version',
      );

      const updated = await this.prisma.server.update({
        where: { id },
        data: {
          isVerified: true,
          hasDocker: docker.code === 0,
          hasAnsible: ansible.code === 0,
          hasRunner: runner.code === 0,
        },
      });

      return this.toPublic(updated);
    } catch {
      await this.prisma.server.update({
        where: { id },
        data: {
          isVerified: false,
          hasDocker: false,
          hasAnsible: false,
          hasRunner: false,
        },
      });

      throw new BadRequestException(
        'Connexion SSH échouée ou vérification des outils impossible',
      );
    } finally {
      this.closeConnection(connection);
    }
  }

  private async installToolsDirect(
    id: string,
    tools: InstallToolsDto,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    this.assertSafeLinuxUsername(server.username);

    const connection = await this.openConnection(server);

    try {
      if (tools.docker && !server.hasDocker) {
        await this.execOrThrow(
          connection.target,
          'sudo apt update',
          'Échec mise à jour apt',
        );
        await this.execOrThrow(
          connection.target,
          'sudo apt install docker.io -y',
          'Échec installation Docker',
        );
        await this.execOrThrow(
          connection.target,
          `sudo usermod -aG docker ${server.username}`,
          'Échec ajout utilisateur au groupe docker',
        );
      }

      if (tools.ansible && !server.hasAnsible) {
        await this.execOrThrow(
          connection.target,
          'sudo apt install ansible -y',
          'Échec installation Ansible',
        );
      }

      if (tools.runner && !server.hasRunner) {
        await this.execOrThrow(
          connection.target,
          'curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash',
          'Échec ajout repository GitLab Runner',
        );
        await this.execOrThrow(
          connection.target,
          'sudo apt install gitlab-runner -y',
          'Échec installation GitLab Runner',
        );
      }
    } finally {
      this.closeConnection(connection);
    }

    return await this.verifyServerDirect(id);
  }

  private async registerRunnerDirect(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const connection = await this.openConnection(server);

    try {
      const escapedName = this.shellQuote(`Runner-${server.name}`);
      const command =
        'sudo gitlab-runner register --non-interactive ' +
        `--url ${this.shellQuote(gitlabUrl)} ` +
        `--registration-token ${this.shellQuote(token)} ` +
        '--executor shell ' +
        `--description ${escapedName}`;

      const result = await connection.target.execCommand(command);
      if (result.code !== 0) {
        throw new BadRequestException(
          `Échec enregistrement runner: ${result.stderr || 'erreur inconnue'}`,
        );
      }

      await this.prisma.server.update({
        where: { id },
        data: { hasRunner: true },
      });
    } finally {
      this.closeConnection(connection);
    }

    return await this.verifyServerDirect(id);
  }

  private async executeJobWithRetry(
    job: ServerJob,
    task: () => Promise<ServerPublic>,
  ): Promise<ServerPublic> {
    await this.assertJobLock(job);

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= job.maxAttempts; attempt += 1) {
      await this.prisma.serverJob.update({
        where: { id: job.id },
        data: {
          status: ServerJobStatus.RUNNING,
          attempts: attempt,
          ...(attempt === 1 && { startedAt: new Date() }),
          error: null,
        },
      });

      try {
        const result = await this.withTimeout(task(), job.timeoutMs);

        await this.prisma.serverJob.update({
          where: { id: job.id },
          data: {
            status: ServerJobStatus.SUCCESS,
            output: 'Exécution terminée avec succès',
            finishedAt: new Date(),
          },
        });

        return result;
      } catch (error: unknown) {
        lastError = error;
        const isLastAttempt = attempt === job.maxAttempts;

        if (!isLastAttempt) {
          continue;
        }

        await this.prisma.serverJob.update({
          where: { id: job.id },
          data: {
            status:
              error instanceof JobTimeoutError
                ? ServerJobStatus.TIMEOUT
                : ServerJobStatus.FAILED,
            error: this.toErrorMessage(error),
            finishedAt: new Date(),
          },
        });
      }
    }

    throw new BadRequestException(this.toErrorMessage(lastError));
  }

  private async assertJobLock(job: ServerJob): Promise<void> {
    const runningCount = await this.prisma.serverJob.count({
      where: {
        serverId: job.serverId,
        status: ServerJobStatus.RUNNING,
        id: {
          not: job.id,
        },
      },
    });

    if (runningCount === 0) {
      return;
    }

    await this.prisma.serverJob.update({
      where: { id: job.id },
      data: {
        status: ServerJobStatus.BLOCKED,
        error: 'Un autre job est déjà en cours sur ce serveur',
        finishedAt: new Date(),
      },
    });

    throw new BadRequestException(
      'Un autre job est déjà en cours sur ce serveur, réessayez plus tard.',
    );
  }

  private async createJob(
    serverId: string,
    type: ServerJobType,
    payload?: object,
  ): Promise<ServerJob> {
    return await this.prisma.serverJob.create({
      data: {
        serverId,
        type,
        maxAttempts: this.defaultJobMaxAttempts,
        timeoutMs: this.defaultJobTimeoutMs,
        ...(payload && { payload: payload as Prisma.InputJsonValue }),
      },
    });
  }

  private async markJobAgentPending(
    jobId: string,
    output: string,
  ): Promise<void> {
    await this.prisma.serverJob.update({
      where: { id: jobId },
      data: {
        status: ServerJobStatus.AGENT_PENDING,
        output,
      },
    });
  }

  private async openConnection(server: Server): Promise<SshConnection> {
    if (server.connectionMode === ServerConnectionMode.AGENT) {
      throw new BadRequestException(
        'Serveur en mode agent: pas de session SSH directe disponible',
      );
    }

    if (server.connectionMode === ServerConnectionMode.SSH) {
      const target = new NodeSSH();
      await target.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: this.decrypt(server.sshKey),
        readyTimeout: 10_000,
      });
      return { target };
    }

    this.assertBastionConfig(
      server.bastionHost ?? undefined,
      server.bastionUsername ?? undefined,
      server.bastionSshKey ?? undefined,
    );

    const bastion = new NodeSSH();
    await bastion.connect({
      host: server.bastionHost!,
      port: server.bastionPort ?? 22,
      username: server.bastionUsername!,
      privateKey: this.decrypt(server.bastionSshKey!),
      readyTimeout: 10_000,
    });

    const sock = await this.forwardThroughBastion(
      bastion,
      server.host,
      server.port,
    );

    const target = new NodeSSH();
    await target.connect({
      sock,
      username: server.username,
      privateKey: this.decrypt(server.sshKey),
      readyTimeout: 10_000,
    });

    return { target, bastion };
  }

  private closeConnection(connection: SshConnection): void {
    connection.target.dispose();
    if (connection.bastion) {
      connection.bastion.dispose();
    }
  }

  private async forwardThroughBastion(
    bastion: NodeSSH,
    targetHost: string,
    targetPort: number,
  ): Promise<Duplex> {
    const sshConnection = (
      bastion as unknown as {
        connection?: {
          forwardOut: (
            srcIP: string,
            srcPort: number,
            dstIP: string,
            dstPort: number,
            callback: (error: Error | undefined, stream: Duplex) => void,
          ) => void;
        };
      }
    ).connection;

    if (!sshConnection) {
      throw new BadRequestException('Tunnel bastion indisponible');
    }

    return await new Promise<Duplex>((resolve, reject) => {
      sshConnection.forwardOut(
        '127.0.0.1',
        0,
        targetHost,
        targetPort,
        (error, stream) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stream);
        },
      );
    });
  }

  private async execOrThrow(
    ssh: NodeSSH,
    command: string,
    failureMessage: string,
  ): Promise<void> {
    const result = await ssh.execCommand(command);
    if (result.code === 0) {
      return;
    }

    throw new BadRequestException(
      `${failureMessage}: ${result.stderr || result.stdout || 'erreur inconnue'}`,
    );
  }

  private assertSafeLinuxUsername(username: string): void {
    const safePattern = /^[a-z_][a-z0-9_-]{0,30}$/i;
    if (safePattern.test(username)) {
      return;
    }

    throw new BadRequestException(
      'Username SSH invalide: caractères non autorisés',
    );
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutRef: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutRef = setTimeout(() => {
        reject(new JobTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }
      return error.message;
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Exécution distante échouée';
  }

  private mapConnectionMode(
    mode?: ServerConnectionModeDto,
  ): ServerConnectionMode {
    if (!mode || mode === ServerConnectionModeDto.SSH) {
      return ServerConnectionMode.SSH;
    }

    if (mode === ServerConnectionModeDto.BASTION) {
      return ServerConnectionMode.BASTION;
    }

    return ServerConnectionMode.AGENT;
  }

  private toConnectionModeDto(
    mode: ServerConnectionMode,
  ): ServerConnectionModeDto {
    if (mode === ServerConnectionMode.SSH) {
      return ServerConnectionModeDto.SSH;
    }

    if (mode === ServerConnectionMode.BASTION) {
      return ServerConnectionModeDto.BASTION;
    }

    return ServerConnectionModeDto.AGENT;
  }

  private assertBastionConfig(
    host?: string,
    username?: string,
    privateKey?: string,
  ): void {
    if (host && username && privateKey) {
      return;
    }

    throw new BadRequestException(
      'Mode bastion invalide: bastionHost, bastionUsername et bastionSshKey sont requis',
    );
  }

  private hashToken(token: string): string {
    return CryptoJS.SHA256(token).toString();
  }

  private async getServerById(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }
    return server;
  }

  private toPublic(server: Server): ServerPublic {
    const { sshKey, bastionSshKey, agentTokenHash, ...publicServer } = server;
    void sshKey;
    void bastionSshKey;
    void agentTokenHash;
    return {
      ...publicServer,
      connectionMode: this.toConnectionModeDto(server.connectionMode),
    };
  }

  private toPublicJob(job: ServerJob): ServerJobPublic {
    const { payload, ...publicJob } = job;
    void payload;
    return publicJob;
  }

  // Retourne une paire SSH exploitable:
  // - clé privée PEM (PKCS8) pour la connexion SSH
  // - clé publique OpenSSH pour authorized_keys
  private resolveSshMaterial(providedPrivateKey?: string): {
    privateKey: string;
    publicKey: string;
  } {
    if (providedPrivateKey) {
      return {
        privateKey: providedPrivateKey,
        publicKey: this.deriveOpenSshPublicKey(providedPrivateKey),
      };
    }

    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      privateKey,
      publicKey: this.convertPublicKeyPemToOpenSsh(publicKey),
    };
  }

  private deriveOpenSshPublicKey(privateKeyPem: string): string {
    try {
      const privateKeyObject = createPrivateKey(privateKeyPem);
      const publicKeyObject = createPublicKey(privateKeyObject);
      const publicKeyDer = publicKeyObject.export({
        type: 'spki',
        format: 'der',
      }) as Buffer;

      return this.convertSpkiDerToOpenSsh(publicKeyDer);
    } catch {
      throw new BadRequestException(
        'Clé privée SSH invalide: impossible de dériver la clé publique',
      );
    }
  }

  private convertPublicKeyPemToOpenSsh(publicKeyPem: string): string {
    const publicKeyObject = createPublicKey(publicKeyPem);
    const publicKeyDer = publicKeyObject.export({
      type: 'spki',
      format: 'der',
    }) as Buffer;

    return this.convertSpkiDerToOpenSsh(publicKeyDer);
  }

  // Convertit une clé publique Ed25519 SPKI DER en format authorized_keys.
  private convertSpkiDerToOpenSsh(publicKeyDer: Buffer): string {
    const ed25519SpkiPrefix = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ]);

    if (
      publicKeyDer.length !== 44 ||
      !publicKeyDer
        .subarray(0, ed25519SpkiPrefix.length)
        .equals(ed25519SpkiPrefix)
    ) {
      throw new BadRequestException(
        'Format de clé publique Ed25519 non supporté',
      );
    }

    const rawPublicKey = publicKeyDer.subarray(ed25519SpkiPrefix.length);
    const keyType = Buffer.from('ssh-ed25519', 'utf8');
    const keyBlob = Buffer.concat([
      this.encodeSshField(keyType),
      this.encodeSshField(rawPublicKey),
    ]);

    return `ssh-ed25519 ${keyBlob.toString('base64')}`;
  }

  private encodeSshField(value: Buffer): Buffer {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(value.length, 0);
    return Buffer.concat([size, value]);
  }

  private encrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }
    return CryptoJS.AES.encrypt(value, secret).toString();
  }

  private decrypt(encryptedValue: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }
    const decrypted = CryptoJS.AES.decrypt(encryptedValue, secret).toString(
      CryptoJS.enc.Utf8,
    );
    return decrypted || encryptedValue;
  }

  private async recordAuditLog(
    userId: string,
    action: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resourceType: 'Server',
          resourceId,
          ...(metadata
            ? { metadata: metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch {
      // Le journal d'audit reste non bloquant.
    }
  }
}
