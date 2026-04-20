import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Server, ServerConnectionMode } from '@prisma/client';
import { chmod, rm, writeFile } from 'fs/promises';
import { NodeSSH } from 'node-ssh';
import type { Duplex } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { ServerConnectionModeDto } from './dto/create-server.dto';
import { ServersCryptoService } from './servers-crypto.service';

type SshConnection = {
  target: NodeSSH;
  bastion?: NodeSSH;
  tempPaths: string[];
};

class JobTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`JOB_TIMEOUT_${String(timeoutMs)}`);
  }
}

@Injectable()
export class ServersSshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
  ) {}

  mapConnectionMode(mode?: ServerConnectionModeDto): ServerConnectionMode {
    if (!mode || mode === ServerConnectionModeDto.AGENT) {
      return ServerConnectionMode.AGENT;
    }

    if (mode === ServerConnectionModeDto.SSH) {
      return ServerConnectionMode.SSH;
    }

    if (mode === ServerConnectionModeDto.BASTION) {
      return ServerConnectionMode.BASTION;
    }

    return ServerConnectionMode.SSH;
  }

  assertBastionConfig(
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

  async verifyServerDirect(id: string): Promise<Server> {
    const server = await this.getServerById(id);

    try {
      const connection = await this.openConnection(server);

      try {
        const docker = await connection.target.execCommand('docker --version');
        const ansible = await connection.target.execCommand('ansible --version');
        const runner = await connection.target.execCommand(
          'gitlab-runner --version',
        );

        return await this.prisma.server.update({
          where: { id },
          data: {
            isVerified: true,
            hasDocker: docker.code === 0,
            hasAnsible: ansible.code === 0,
            hasRunner: runner.code === 0,
          },
        });
      } finally {
        this.closeConnection(connection);
      }
    } catch (error) {
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
        `Connexion SSH échouée ou vérification des outils impossible: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
      const normalizedKey = this.crypto.decrypt(server.sshKey);
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
      data: { isVerified: true },
    });

    return {
      success: true,
      message: 'Clé installée et connexion SSH vérifiée',
    };
  }

  async openConnection(server: Server): Promise<SshConnection> {
    if (server.connectionMode === ServerConnectionMode.AGENT) {
      throw new BadRequestException(
        'Serveur en mode agent: pas de session SSH directe disponible',
      );
    }

    if (server.connectionMode === ServerConnectionMode.SSH) {
      const target = new NodeSSH();
      const decryptedKey = this.crypto.decrypt(server.sshKey);
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

    this.assertBastionConfig(
      server.bastionHost ?? undefined,
      server.bastionUsername ?? undefined,
      server.bastionSshKey ?? undefined,
    );

    const bastion = new NodeSSH();
    const bastionKey = this.crypto.decrypt(server.bastionSshKey!);
    const bastionKeyPath = `/tmp/ssh_bastion_${server.id}_${Date.now()}`;

    try {
      await writeFile(bastionKeyPath, bastionKey, { mode: 0o600 });
      await chmod(bastionKeyPath, 0o600);
      await bastion.connect({
        host: server.bastionHost!,
        port: server.bastionPort ?? 22,
        username: server.bastionUsername!,
        privateKeyPath: bastionKeyPath,
        readyTimeout: 30_000,
      });
    } catch (error) {
      await rm(bastionKeyPath, { force: true }).catch(() => {});
      throw error;
    }

    const sock = await this.forwardThroughBastion(
      bastion,
      server.host,
      server.port,
    );

    const target = new NodeSSH();
    const targetKey = this.crypto.decrypt(server.sshKey);
    const targetKeyPath = `/tmp/ssh_target_${server.id}_${Date.now()}`;

    try {
      await writeFile(targetKeyPath, targetKey, { mode: 0o600 });
      await chmod(targetKeyPath, 0o600);
      await target.connect({
        sock,
        username: server.username,
        privateKeyPath: targetKeyPath,
        readyTimeout: 30_000,
      });
    } catch (error) {
      await rm(targetKeyPath, { force: true }).catch(() => {});
      throw error;
    }

    return { target, bastion, tempPaths: [targetKeyPath, bastionKeyPath] };
  }

  closeConnection(connection: SshConnection): void {
    connection.target.dispose();
    if (connection.bastion) {
      connection.bastion.dispose();
    }
    for (const tempPath of connection.tempPaths) {
      rm(tempPath, { force: true }).catch(() => {});
    }
  }

  async forwardThroughBastion(
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

  execCommand(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process') as typeof import('child_process');
      const proc = spawn('bash', ['-c', cmd]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Command failed with code ${String(code)}: ${cmd}`));
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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

  private async getServerById(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }
    return server;
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `"'"'`)}'`;
  }
}
