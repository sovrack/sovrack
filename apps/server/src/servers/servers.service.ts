import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Server, type Prisma } from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { NodeSSH } from 'node-ssh';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';

type ServerPublic = Omit<Server, 'sshKey'>;

type InstallToolsDto = {
  docker?: boolean;
  ansible?: boolean;
  runner?: boolean;
};

@Injectable()
export class ServersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServerDto): Promise<ServerPublic> {
    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 22,
        username: dto.username ?? 'ubuntu',
        // Chiffrement AES de la clé SSH avant stockage en base.
        sshKey: this.encrypt(dto.sshKey),
      },
    });

    // On tente la vérification automatique sans bloquer la création si SSH échoue.
    try {
      await this.verifyServer(server.id);
    } catch {
      // Ignore l'exception ici, le serveur existe déjà en base.
    }

    return this.toPublic(server);
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

  async update(id: string, dto: UpdateServerDto): Promise<ServerPublic> {
    await this.getServerById(id);

    const resetVerification =
      dto.host !== undefined ||
      dto.port !== undefined ||
      dto.username !== undefined ||
      dto.sshKey !== undefined;

    // Construction explicite pour chiffrer sshKey si elle est mise à jour.
    const data: Prisma.ServerUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.host !== undefined && { host: dto.host }),
      ...(dto.port !== undefined && { port: dto.port }),
      ...(dto.username !== undefined && { username: dto.username }),
      ...(dto.sshKey !== undefined && { sshKey: this.encrypt(dto.sshKey) }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
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

    return this.toPublic(updated);
  }

  async remove(id: string): Promise<void> {
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
  }

  async verifyServer(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        // Déchiffrement de la clé SSH stockée en AES avant connexion.
        privateKey: this.decrypt(server.sshKey),
        readyTimeout: 10000,
      });

      const docker = await ssh.execCommand('docker --version');
      const ansible = await ssh.execCommand('ansible --version');
      const runner = await ssh.execCommand('gitlab-runner --version');

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
      ssh.dispose();
    }
  }

  async installTools(
    id: string,
    tools?: InstallToolsDto,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        // Déchiffrement de la clé SSH stockée en AES avant connexion.
        privateKey: this.decrypt(server.sshKey),
        readyTimeout: 10000,
      });

      const installDocker = tools?.docker ?? true;
      const installAnsible = tools?.ansible ?? true;
      const installRunner = tools?.runner ?? true;

      if (installDocker && !server.hasDocker) {
        await ssh.execCommand('sudo apt update');
        await ssh.execCommand('sudo apt install docker.io -y');
        await ssh.execCommand(`sudo usermod -aG docker ${server.username}`);
      }

      if (installAnsible && !server.hasAnsible) {
        await ssh.execCommand('sudo apt install ansible -y');
      }

      if (installRunner && !server.hasRunner) {
        await ssh.execCommand(
          'curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash',
        );
        await ssh.execCommand('sudo apt install gitlab-runner -y');
      }
    } catch {
      throw new BadRequestException('Installation distante des outils échouée');
    } finally {
      ssh.dispose();
    }

    return await this.verifyServer(id);
  }

  async registerRunner(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        // Déchiffrement de la clé SSH stockée en AES avant connexion.
        privateKey: this.decrypt(server.sshKey),
        readyTimeout: 10000,
      });

      const escapedUrl = gitlabUrl.replace(/"/g, '\\"');
      const escapedToken = token.replace(/"/g, '\\"');
      const escapedName = `Runner-${server.name}`.replace(/"/g, '\\"');

      const command =
        `sudo gitlab-runner register --non-interactive ` +
        `--url "${escapedUrl}" ` +
        `--registration-token "${escapedToken}" ` +
        '--executor shell ' +
        `--description "${escapedName}"`;

      const result = await ssh.execCommand(command);
      if (result.code !== 0) {
        throw new BadRequestException(
          `Échec enregistrement runner: ${result.stderr || 'erreur inconnue'}`,
        );
      }

      await this.prisma.server.update({
        where: { id },
        data: { hasRunner: true },
      });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Enregistrement GitLab Runner échoué');
    } finally {
      ssh.dispose();
    }

    return await this.verifyServer(id);
  }

  private async getServerById(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }
    return server;
  }

  private toPublic(server: Server): ServerPublic {
    const { sshKey, ...publicServer } = server;
    void sshKey;
    return publicServer;
  }

  // Chiffre une valeur en AES-256 avec CONFIG_SECRET.
  private encrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }
    return CryptoJS.AES.encrypt(value, secret).toString();
  }

  // Déchiffre une valeur AES-256 avec CONFIG_SECRET.
  // Compatibilité ascendante : si le déchiffrement échoue, retourne la valeur brute.
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
}
