import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import {
  SshExecutorService,
  type SshConnection,
} from '../../core/ssh/ssh-executor.service';
import { randomBytes } from 'crypto';

export type DatabaseType = 'postgresql' | 'mysql' | 'redis' | 'mongodb';

export type DatabaseProvisionRequest = {
  name: string;
  type: DatabaseType;
  version?: string;
  serverId: string;
  projectId: string;
  port?: number;
};

export type DatabaseInstance = {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  username: string;
  connectionUrl: string;
};

const DATABASE_DEFAULTS: Record<DatabaseType, { image: string; defaultPort: number; defaultVersion: string }> = {
  postgresql: { image: 'postgres', defaultPort: 5432, defaultVersion: '15' },
  mysql: { image: 'mysql', defaultPort: 3306, defaultVersion: '8' },
  redis: { image: 'redis', defaultPort: 6379, defaultVersion: '7-alpine' },
  mongodb: { image: 'mongo', defaultPort: 27017, defaultVersion: '7' },
};

/**
 * Provisions managed databases as Docker containers on VPS.
 * Inspired by Coolify database management — creates containers,
 * stores encrypted credentials, and generates connection URLs.
 */
@Injectable()
export class DatabaseProvisioningService {
  private readonly logger = new Logger(DatabaseProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly ssh: SshExecutorService,
  ) {}

  async provision(
    request: DatabaseProvisionRequest,
    serverSshKey: string,
    serverHost: string,
    serverUsername: string,
    serverPort = 22,
  ): Promise<DatabaseInstance> {
    this.logger.log(`Provisioning ${request.type} database: ${request.name}`);

    const defaults = DATABASE_DEFAULTS[request.type];
    const version = request.version ?? defaults.defaultVersion;
    const port = request.port ?? defaults.defaultPort;
    const password = randomBytes(24).toString('hex');
    const username = request.type === 'redis' ? '' : `${request.name}_user`;

    const dockerRunCommand = this.buildDockerCommand(
      request.name,
      request.type,
      `${defaults.image}:${version}`,
      port,
      username,
      password,
    );

    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: serverHost,
        port: serverPort,
        username: serverUsername,
        privateKey: serverSshKey,
        readyTimeoutMs: 10_000,
      });

      await conn.client.execCommand(dockerRunCommand);
      this.logger.log(`Database container started: ${request.name}`);
    } finally {
      if (conn) await conn.dispose();
    }

    const connectionUrl = this.buildConnectionUrl(
      request.type,
      serverHost,
      port,
      username,
      password,
      request.name,
    );

    return {
      id: `db-${request.name}-${Date.now()}`,
      name: request.name,
      type: request.type,
      host: serverHost,
      port,
      username,
      connectionUrl: this.crypto.encrypt(connectionUrl),
    };
  }

  async stop(containerName: string, serverSshKey: string, serverHost: string, serverUsername: string, serverPort = 22): Promise<void> {
    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: serverHost,
        port: serverPort,
        username: serverUsername,
        privateKey: serverSshKey,
        readyTimeoutMs: 10_000,
      });
      await conn.client.execCommand(`docker stop ${containerName} && docker rm ${containerName}`);
    } finally {
      if (conn) await conn.dispose();
    }
  }

  private buildDockerCommand(
    name: string,
    type: DatabaseType,
    image: string,
    port: number,
    username: string,
    password: string,
  ): string {
    const envVars: Record<string, string> = {
      postgresql: `POSTGRES_USER=${username} POSTGRES_PASSWORD=${password} POSTGRES_DB=${name}`,
      mysql: `MYSQL_ROOT_PASSWORD=${password} MYSQL_DATABASE=${name} MYSQL_USER=${username} MYSQL_PASSWORD=${password}`,
      redis: password ? `REDIS_PASSWORD=${password}` : '',
      mongodb: `MONGO_INITDB_ROOT_USERNAME=${username} MONGO_INITDB_ROOT_PASSWORD=${password}`,
    };

    const envStr = (envVars[type] ?? '')
      .split(' ')
      .filter(Boolean)
      .map((e) => `-e ${e}`)
      .join(' ');

    return [
      'docker run -d',
      `--name ${name}`,
      `-p ${port}:${port}`,
      envStr,
      `-v ${name}_data:/var/lib/${type === 'postgresql' ? 'postgresql/data' : type}`,
      '--restart unless-stopped',
      image,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildConnectionUrl(
    type: DatabaseType,
    host: string,
    port: number,
    username: string,
    password: string,
    dbName: string,
  ): string {
    switch (type) {
      case 'postgresql':
        return `postgresql://${username}:${password}@${host}:${port}/${dbName}`;
      case 'mysql':
        return `mysql://${username}:${password}@${host}:${port}/${dbName}`;
      case 'redis':
        return password
          ? `redis://:${password}@${host}:${port}`
          : `redis://${host}:${port}`;
      case 'mongodb':
        return `mongodb://${username}:${password}@${host}:${port}/${dbName}`;
      default:
        throw new BadRequestException(`Type de base de données non supporté: ${String(type)}`);
    }
  }
}
