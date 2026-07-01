import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { ServerHostKeyService } from '../../adapters/ssh/server-host-key.service';
import { ServersCryptoService } from '../../adapters/ssh/servers-crypto.service';
import { SshSessionService } from './ssh-session.service';
import { TerminalAuditService } from './terminal-audit.service';

export type SshSessionOptions = {
  cols: number;
  rows: number;
};

export type SshSessionHandlers = {
  onData: (data: string) => void;
  onClose: (code: number | null) => void;
  onError: (message: string) => void;
};

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
    private readonly hostKeys: ServerHostKeyService,
    private readonly sshSessions: SshSessionService,
    private readonly audit: TerminalAuditService,
    private readonly configService: ConfigService,
  ) {}

  async openSession(
    serverId: string,
    actorId: string,
    actorRole: Role,
    opts: SshSessionOptions,
    handlers: SshSessionHandlers,
  ): Promise<{
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    close: () => void;
  }> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      throw new NotFoundException('Serveur introuvable');
    }

    if (!server.isVerified) {
      throw new ForbiddenException(
        "Ce serveur n'est pas encore validé (SSH non vérifié).",
      );
    }

    if (!server.isActive) {
      throw new ForbiddenException('Ce serveur est désactivé.');
    }

    // ADMIN : accès global à tous les serveurs.
    // Tout autre rôle : doit être OWNER du projet lié au serveur.
    if (actorRole !== Role.ADMIN) {
      await this.assertOwnerAccess(server.environmentId ?? null, actorId);
    }

    const privateKey = this.crypto.normalizePrivateKeyFormat(
      this.crypto.decrypt(server.sshKey),
    );
    const pinnedHost = await this.hostKeys.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    const inactivityTimeoutMs = this.resolveInactivityTimeoutMs();

    await this.audit.recordOpen(serverId, actorId, {
      host: server.host,
      port: server.port,
      managedBy: 'control-node',
      agentless: true,
      inactivityTimeoutMs,
    });

    try {
      return await this.sshSessions.openShell(
        {
          host: server.host,
          port: server.port,
          username: server.username,
          privateKey,
          cols: opts.cols,
          rows: opts.rows,
          readyTimeoutMs: 15_000,
          keepaliveIntervalMs: 30_000,
          inactivityTimeoutMs,
          hostVerifier: this.hostKeys.hostVerifier(pinnedHost.keyBase64),
        },
        {
          onData: (data) => handlers.onData(data),
          onClose: (code) => {
            handlers.onClose(code);
            void this.audit.recordClose(serverId, actorId, {
              exitCode: code ?? 0,
            });
          },
          onError: (message) => {
            handlers.onError(message);
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur de session SSH';
      this.logger.error(message);
      await this.audit.recordError(serverId, actorId, { message });
      throw error;
    }
  }

  /**
   * Vérifie que l'utilisateur est OWNER du projet associé au serveur.
   * Un serveur sans environmentId (pas encore lié à un projet) est réservé aux ADMINs.
   */
  private async assertOwnerAccess(
    environmentId: string | null,
    actorId: string,
  ): Promise<void> {
    if (!environmentId) {
      throw new ForbiddenException(
        "Ce serveur n'est pas encore lié à un environnement de projet. Accès réservé aux ADMIN.",
      );
    }

    const env = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      select: { projectId: true },
    });
    if (!env) throw new NotFoundException('Environnement introuvable');

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: env.projectId, userId: actorId } },
      select: { role: true },
    });

    if (member?.role !== ProjectRole.OWNER) {
      throw new ForbiddenException(
        'Terminal SSH réservé aux OWNER du projet ou ADMIN de la plateforme.',
      );
    }
  }

  private resolveInactivityTimeoutMs(): number {
    const raw = Number(
      this.configService.get<string>(
        'TERMINAL_SSH_INACTIVITY_TIMEOUT_MS',
        '300000',
      ),
    );
    if (Number.isFinite(raw) && raw >= 60_000) {
      return Math.floor(raw);
    }
    return 15 * 60_000;
  }
}
