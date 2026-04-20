import { BadRequestException, Injectable } from '@nestjs/common';
import { Server } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ServersSshService } from './servers-ssh.service';

@Injectable()
export class ServersRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: ServersSshService,
  ) {}

  async registerRunner(
    server: Server,
    gitlabUrl: string,
    token: string,
  ): Promise<Server> {
    await this.registerRunnerDirect(server, gitlabUrl, token);
    return await this.ssh.verifyServerDirect(server.id);
  }

  async registerRunnerDirect(
    server: Server,
    gitlabUrl: string,
    token: string,
  ): Promise<void> {
    const connection = await this.ssh.openConnection(server);

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
        where: { id: server.id },
        data: { hasRunner: true },
      });
    } finally {
      this.ssh.closeConnection(connection);
    }
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `"'"'`)}'`;
  }
}
