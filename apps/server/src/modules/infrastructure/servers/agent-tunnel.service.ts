import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ServerStatus } from '@prisma/client';

export type AgentHostInfo = {
  hostname: string;
  os: string;
  arch: string;
  cpuCores: number;
  platform?: string;
  uptimeSeconds?: number;
};

export type AgentSystemMetrics = {
  timestamp: number;
  cpuPercent: number;
  memoryTotalMb: number;
  memoryUsedMb: number;
  memoryFreeMb: number;
  memoryPercent: number;
  diskTotalGb: number;
  diskUsedGb: number;
  diskPercent: number;
  netBytesSent: number;
  netBytesRecv: number;
  dockerRunning: boolean;
  containerCount: number;
  host: AgentHostInfo;
};

export type AgentCommandResult = {
  id: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
};

type ConnectedAgent = {
  socket: Socket;
  serverId: string;
  agentToken: string;
  connectedAt: Date;
  lastPingAt: Date;
  hostInfo?: AgentHostInfo;
  latestMetrics?: AgentSystemMetrics;
  pendingCommands: Map<
    string,
    {
      resolve: (res: AgentCommandResult) => void;
      reject: (err: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >;
};

@Injectable()
export class AgentTunnelService {
  private readonly logger = new Logger(AgentTunnelService.name);
  private readonly agents = new Map<string, ConnectedAgent>(); // serverId -> ConnectedAgent
  private readonly socketToAgent = new Map<string, string>(); // socket.id -> serverId

  constructor(private readonly prisma: PrismaService) {}

  async registerAgentConnection(
    socket: Socket,
    token: string,
  ): Promise<string> {
    // 1. Look up server with this token (stored in sshPublicKey or custom token field)
    const server = await this.prisma.server.findFirst({
      where: {
        OR: [{ sshPublicKey: { contains: token } }, { id: token }],
      },
    });

    if (!server) {
      this.logger.warn(
        `Agent connection rejected: unknown token ${token.slice(0, 8)}...`,
      );
      throw new Error('Unauthorized agent token');
    }

    const connected: ConnectedAgent = {
      socket,
      serverId: server.id,
      agentToken: token,
      connectedAt: new Date(),
      lastPingAt: new Date(),
      pendingCommands: new Map(),
    };

    this.agents.set(server.id, connected);
    this.socketToAgent.set(socket.id, server.id);

    await this.prisma.server.update({
      where: { id: server.id },
      data: {
        status: ServerStatus.PREPARED,
        lastVerifiedAt: new Date(),
      },
    });

    this.logger.log(
      `Agent connected for server "${server.name}" (${server.id})`,
    );
    return server.id;
  }

  handleDisconnect(socketId: string) {
    const serverId = this.socketToAgent.get(socketId);
    if (!serverId) return;

    this.socketToAgent.delete(socketId);
    const agent = this.agents.get(serverId);
    if (agent) {
      // Reject any pending commands
      for (const pending of agent.pendingCommands.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Agent disconnected while command in flight'));
      }
      this.agents.delete(serverId);
      this.logger.warn(`Agent disconnected for server ${serverId}`);
    }
  }

  handlePing(socketId: string) {
    const serverId = this.socketToAgent.get(socketId);
    if (!serverId) return;
    const agent = this.agents.get(serverId);
    if (agent) {
      agent.lastPingAt = new Date();
    }
  }

  handleHello(socketId: string, hostInfo: AgentHostInfo) {
    const serverId = this.socketToAgent.get(socketId);
    if (!serverId) return;
    const agent = this.agents.get(serverId);
    if (agent) {
      agent.hostInfo = hostInfo;
      this.logger.log(
        `Agent Hello from server ${serverId}: ${hostInfo.hostname} (${hostInfo.os} ${hostInfo.arch})`,
      );
    }
  }

  handleMetrics(socketId: string, metrics: AgentSystemMetrics) {
    const serverId = this.socketToAgent.get(socketId);
    if (!serverId) return;
    const agent = this.agents.get(serverId);
    if (agent) {
      agent.latestMetrics = metrics;
      agent.lastPingAt = new Date();
    }
  }

  handleCommandResult(socketId: string, result: AgentCommandResult) {
    const serverId = this.socketToAgent.get(socketId);
    if (!serverId) return;
    const agent = this.agents.get(serverId);
    if (!agent) return;

    const pending = agent.pendingCommands.get(result.id);
    if (pending) {
      clearTimeout(pending.timeout);
      agent.pendingCommands.delete(result.id);
      pending.resolve(result);
    }
  }

  isAgentConnected(serverId: string): boolean {
    return this.agents.has(serverId);
  }

  getLatestMetrics(serverId: string): AgentSystemMetrics | null {
    return this.agents.get(serverId)?.latestMetrics ?? null;
  }

  async executeCommand(
    serverId: string,
    command: string,
    args: string[] = [],
    env: Record<string, string> = {},
    timeoutSec: number = 300,
  ): Promise<AgentCommandResult> {
    const agent = this.agents.get(serverId);
    if (!agent) {
      throw new Error(`Server ${serverId} has no active outbound agent tunnel`);
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        agent.pendingCommands.delete(commandId);
        reject(
          new Error(
            `Agent command ${commandId} timed out after ${timeoutSec}s`,
          ),
        );
      }, timeoutSec * 1000);

      agent.pendingCommands.set(commandId, { resolve, reject, timeout });

      agent.socket.emit('COMMAND_REQUEST', {
        id: commandId,
        command,
        args,
        env,
        timeoutSec,
      });
    });
  }
}
