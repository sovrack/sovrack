import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Server, ServerConnectionMode, ServerStatus } from '@prisma/client';
import { chmod, rm, writeFile } from 'fs/promises';
import { NodeSSH } from 'node-ssh';
import { PrismaService } from '../../../prisma/prisma.service';
import { ServerConnectionModeDto } from '../dto/create-server.dto';
import { ServersCryptoService } from './servers-crypto.service';
import { ServerVerificationService } from './server-verification.service';
import { ServerExecutionOptions } from '../shared/servers.types';
import {
  assertNotAborted as assertJobNotAborted,
  assertSafeLinuxUsername,
  onAbort,
  shellQuote,
} from '../shared/servers-shell.utils';

type SshConnection = {
  target: NodeSSH;
  tempPaths: string[];
};

class JobTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`JOB_TIMEOUT_${String(timeoutMs)}`);
  }
}

@Injectable()
export class ServersSshService {
  private readonly logger = new Logger(ServersSshService.name);
  private readonly automationSudoersPath = '/etc/sudoers.d/platform-deploy';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
    private readonly verification: ServerVerificationService,
  ) {}

  mapConnectionMode(mode?: ServerConnectionModeDto): ServerConnectionMode {
    if (!mode || mode === ServerConnectionModeDto.SSH) {
      return ServerConnectionMode.SSH;
    }
    return ServerConnectionMode.SSH;
  }

  async verifyServerDirect(
    server: Server,
    options?: ServerExecutionOptions,
  ): Promise<Server> {
    const id = server.id;
    assertJobNotAborted(options);

    // 1. Marquer comme en cours de vérification
    await this.verification.startVerification(id);

    try {
      // 2. Ouvrir la connexion SSH
      const connection = await this.openConnection(server);
      let closed = false;
      const safeClose = () => {
        if (closed) {
          return;
        }
        closed = true;
        this.closeConnection(connection);
      };
      const detachAbort = onAbort(options?.signal, safeClose);

      try {
        assertJobNotAborted(options);

        // 3. Vérifier Docker
        await this.verification.addLog(
          id,
          'Vérification de Docker...',
          undefined,
          'DOCKER',
        );
        const docker = await connection.target.execCommand('docker --version');
        if (docker.code === 0) {
          await this.verification.addLog(
            id,
            `✓ Docker trouvé: ${docker.stdout.trim()}`,
            undefined,
            'DOCKER',
          );
        } else {
          await this.verification.addLog(
            id,
            'Docker non trouvé',
            undefined,
            'DOCKER',
          );
        }

        assertJobNotAborted(options);

        // 4. Vérifier Ansible
        await this.verification.addLog(
          id,
          "Vérification d'Ansible...",
          undefined,
          'ANSIBLE',
        );
        const ansible =
          await connection.target.execCommand('ansible --version');
        if (ansible.code === 0) {
          await this.verification.addLog(
            id,
            `✓ Ansible trouvé: ${ansible.stdout.split('\n')[0]}`,
            undefined,
            'ANSIBLE',
          );
        } else {
          await this.verification.addLog(
            id,
            'Ansible non trouvé',
            undefined,
            'ANSIBLE',
          );
        }

        assertJobNotAborted(options);

        // 5. Vérifier GitLab Runner
        await this.verification.addLog(
          id,
          'Vérification de GitLab Runner...',
          undefined,
          'RUNNER',
        );
        const runner = await connection.target.execCommand(
          'gitlab-runner --version',
        );
        if (runner.code === 0) {
          await this.verification.addLog(
            id,
            `✓ GitLab Runner trouvé: ${runner.stdout.trim()}`,
            undefined,
            'RUNNER',
          );
        } else {
          await this.verification.addLog(
            id,
            'GitLab Runner non trouvé',
            undefined,
            'RUNNER',
          );
        }

        // 6. Marquer comme vérifié avec succès
        const verified = await this.verification.markVerified(
          id,
          docker.code === 0,
          ansible.code === 0,
          runner.code === 0,
        );

        return verified;
      } finally {
        detachAbort();
        safeClose();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Marquer comme échoué
      await this.verification.markFailed(id, errorMessage);

      throw new BadRequestException(
        `Connexion SSH échouée ou vérification des outils impossible: ${errorMessage}`,
      );
    }
  }

  async installPublicKey(
    id: string,
    password: string,
  ): Promise<{ success: true; message: string }> {
    const server = await this.getServerById(id);

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

    let passwordlessSudoReady = this.isRootUser(server.username);
    const setupConnection = new NodeSSH();
    try {
      await setupConnection.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        password: normalizedPassword,
        readyTimeout: 30_000,
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

      const escapedPublicKey = shellQuote(publicKey);
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

      if (!passwordlessSudoReady) {
        passwordlessSudoReady = await this.tryEnablePasswordlessSudo(
          setupConnection,
          server.username,
          normalizedPassword,
        );
      }
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
      const normalizedKey = this.crypto.normalizePrivateKeyFormat(
        this.crypto.decrypt(server.sshKey),
      );

      const keyPath = `/tmp/ssh_verify_${server.id}_${Date.now()}`;
      try {
        await writeFile(keyPath, normalizedKey, { mode: 0o600 });
        await keyConnection.connect({
          host: server.host,
          port: server.port,
          username: server.username,
          privateKeyPath: keyPath,
          readyTimeout: 30_000,
        });

        if (!passwordlessSudoReady && !this.isRootUser(server.username)) {
          const sudoCheck = await keyConnection.execCommand('sudo -n true');
          passwordlessSudoReady = sudoCheck.code === 0;
        }
      } finally {
        await rm(keyPath, { force: true }).catch(() => {});
      }
    } catch (error) {
      throw new BadRequestException(
        `La clé a été installée mais la connexion SSH par clé a échoué: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      keyConnection.dispose();
    }

    await this.prisma.server.update({
      where: { id },
      data: {
        isVerified: false,
        status: ServerStatus.NEW,
        verificationError: null,
        onboardingStep: 'KEY_INSTALLED',
      },
    });

    return {
      success: true,
      message: passwordlessSudoReady
        ? 'Clé installée et accès sudo sans mot de passe prêt. Lancez la vérification puis l’installation des outils.'
        : "Clé installée et test SSH réussi. Le compte SSH n'a pas sudo sans mot de passe: installez la clé avec un utilisateur sudo ou configurez sudoers avant l’installation des outils.",
    };
  }

  async openConnection(server: Server): Promise<SshConnection> {
    const target = new NodeSSH();
    const decryptedKey = this.crypto.normalizePrivateKeyFormat(
      this.crypto.decrypt(server.sshKey),
    );

    const keyPath = `/tmp/ssh_key_${server.id}_${Date.now()}`;
    try {
      await writeFile(keyPath, decryptedKey, { mode: 0o600 });
      await chmod(keyPath, 0o600);
      await target.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKeyPath: keyPath,
        readyTimeout: 30_000,
      });
    } catch (error) {
      await rm(keyPath, { force: true }).catch(() => {});
      throw error;
    }

    return { target, tempPaths: [keyPath] };
  }

  async assertPasswordlessSudo(server: Server): Promise<void> {
    if (this.isRootUser(server.username)) {
      return;
    }

    assertSafeLinuxUsername(server.username);
    const connection = await this.openConnection(server);
    try {
      const result = await connection.target.execCommand('sudo -n true');
      if (result.code === 0) {
        return;
      }

      const details = result.stderr?.trim() || result.stdout?.trim();
      throw new BadRequestException(
        `Le compte SSH "${server.username}" ne dispose pas de sudo sans mot de passe. Réinstallez la clé SSH avec le mot de passe de ce même utilisateur (bouton "Install SSH key").${details ? ` Détail: ${details}` : ''}`,
      );
    } finally {
      this.closeConnection(connection);
    }
  }

  closeConnection(connection: SshConnection): void {
    connection.target.dispose();
    for (const tempPath of connection.tempPaths) {
      rm(tempPath, { force: true }).catch(() => {});
    }
  }

  async execOrThrow(
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

  async withTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number,
    onTimeout?: () => void,
  ): Promise<T> {
    let timeoutRef: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutRef = setTimeout(() => {
        try {
          onTimeout?.();
        } catch {
          // Ne pas masquer l'erreur de timeout.
        }
        reject(new JobTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([task(), timeoutPromise]);
    } finally {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    }
  }

  async registerRunnerAndVerify(
    server: Server,
    gitlabUrl: string,
    token: string,
    options?: ServerExecutionOptions,
  ): Promise<Server> {
    await this.registerRunnerDirect(server, gitlabUrl, token, options);
    return await this.verifyServerDirect(server, options);
  }

  async registerRunnerDirect(
    server: Server,
    gitlabUrl: string,
    token: string,
    options?: ServerExecutionOptions,
  ): Promise<void> {
    if (options?.signal.aborted) {
      throw new BadRequestException(`JOB_TIMEOUT_${String(options.timeoutMs)}`);
    }

    const connection = await this.openConnection(server);
    let closed = false;
    const safeClose = () => {
      if (closed) return;
      closed = true;
      this.closeConnection(connection);
    };
    const detachAbort = onAbort(options?.signal, safeClose);

    try {
      const escapedName = shellQuote(`Runner-${server.name}`);
      const command =
        'sudo gitlab-runner register --non-interactive ' +
        `--url ${shellQuote(gitlabUrl)} ` +
        `--registration-token ${shellQuote(token)} ` +
        '--executor shell ' +
        `--description ${escapedName}`;

      const result = await connection.target.execCommand(command);
      if (result.code !== 0) {
        throw new BadRequestException(
          `Échec enregistrement runner: ${result.stderr || 'erreur inconnue'}`,
        );
      }

      await this.prisma.server.update({
        where: { id: server.id },
        data: { hasRunner: true },
      });
    } finally {
      detachAbort();
      safeClose();
    }
  }

  private buildAutomationSudoersRule(username: string): string {
    assertSafeLinuxUsername(username);
    return `${username} ALL=(ALL) NOPASSWD: ALL`;
  }

  private async tryEnablePasswordlessSudo(
    ssh: NodeSSH,
    username: string,
    password: string,
  ): Promise<boolean> {
    if (this.isRootUser(username)) {
      return true;
    }

    const sudoersRule = this.buildAutomationSudoersRule(username);
    const escapedPassword = shellQuote(password);
    const escapedSudoersRule = shellQuote(sudoersRule);
    const writeSudoersCommand = shellQuote(
      `echo ${escapedSudoersRule} > ${this.automationSudoersPath} && chmod 0440 ${this.automationSudoersPath}`,
    );

    const result = await ssh.execCommand(
      `printf '%s\\n' ${escapedPassword} | sudo -S -p '' sh -c ${writeSudoersCommand}`,
    );

    if (result.code !== 0) {
      this.logger.warn(
        `Passwordless sudo setup skipped for ${username}: ${result.stderr || result.stdout || 'unknown error'}`,
      );
      return false;
    }

    const verify = await ssh.execCommand('sudo -n true');
    if (verify.code !== 0) {
      this.logger.warn(
        `Passwordless sudo verification failed for ${username}: ${verify.stderr || verify.stdout || 'unknown error'}`,
      );
      return false;
    }

    return true;
  }

  private async getServerById(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }
    return server;
  }

  private isRootUser(username: string): boolean {
    return username.trim().toLowerCase() === 'root';
  }
}
