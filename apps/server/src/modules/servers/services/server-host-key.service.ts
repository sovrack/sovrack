import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Server } from '@prisma/client';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { chmod, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

type KnownHostEntry = {
  marker: string;
  keyType: string;
  keyBase64: string;
  knownHostsLine: string;
};

type ResolveForConnectionOptions = {
  allowTrustOnFirstUse: boolean;
};

const KEY_TYPE_PRIORITY = [
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'ssh-rsa',
];

@Injectable()
export class ServerHostKeyService {
  private readonly logger = new Logger(ServerHostKeyService.name);

  async resolveForConnection(
    server: Server,
    options: ResolveForConnectionOptions,
  ): Promise<KnownHostEntry> {
    const scanned = await this.scanHostKey(server);
    await this.ensureKnownHostsFile();

    const pinned = await this.readPinnedEntry(server);
    if (pinned && pinned.keyBase64 !== scanned.keyBase64) {
      throw new BadRequestException(
        'Host key mismatch détecté (risque MITM). Vérifiez le fingerprint du serveur avant toute nouvelle connexion.',
      );
    }

    if (pinned) {
      return pinned;
    }

    if (!options.allowTrustOnFirstUse) {
      throw new BadRequestException(
        'Aucune clé hôte pinée pour ce serveur. Lancez d’abord une validation SSH pour enregistrer le fingerprint.',
      );
    }

    await this.upsertPinnedEntry(scanned);
    this.logger.log(
      `Pinned host key for ${server.host}:${String(server.port)}`,
    );
    return scanned;
  }

  async collectFingerprint(server: Server): Promise<string | null> {
    try {
      const scanned = await this.scanHostKey(server);
      return scanned.knownHostsLine;
    } catch {
      return null;
    }
  }

  resolveStrictHostKeyChecking(): 'yes' | 'no' | 'ask' | 'accept-new' {
    const raw = process.env.ANSIBLE_STRICT_HOST_KEY_CHECKING?.trim();
    if (raw) {
      const value = raw.toLowerCase();
      if (
        value === 'yes' ||
        value === 'no' ||
        value === 'ask' ||
        value === 'accept-new'
      ) {
        return value;
      }

      this.logger.warn(
        `Valeur ANSIBLE_STRICT_HOST_KEY_CHECKING invalide (${raw}).`,
      );
    }

    if (this.isProduction()) {
      return 'yes';
    }

    return 'accept-new';
  }

  isStrictMode(): boolean {
    return this.resolveStrictHostKeyChecking() === 'yes';
  }

  resolveKnownHostsPath(): string {
    const configured = process.env.ANSIBLE_KNOWN_HOSTS_PATH?.trim();
    if (configured) {
      return resolve(configured.replace(/[\n\r"'\\;|&$`]/g, '').trim());
    }

    return resolve(process.cwd(), '.local/ssh/known_hosts');
  }

  resolveSshCommonArgs(): string {
    const args = [
      `-o StrictHostKeyChecking=${this.resolveStrictHostKeyChecking()}`,
      '-o ConnectTimeout=10',
      '-o IdentitiesOnly=yes',
      `-o UserKnownHostsFile=${this.resolveKnownHostsPath()}`,
    ];

    return args.join(' ');
  }

  hostVerifier(expectedKeyBase64: string): (key: Buffer | string) => boolean {
    return (key: Buffer | string) => {
      const presented = Buffer.isBuffer(key) ? key.toString('base64') : key;
      return presented === expectedKeyBase64;
    };
  }

  private async ensureKnownHostsFile(): Promise<void> {
    const knownHostsPath = this.resolveKnownHostsPath();
    await mkdir(dirname(knownHostsPath), { recursive: true, mode: 0o700 });

    if (!existsSync(knownHostsPath)) {
      await writeFile(knownHostsPath, '', { encoding: 'utf-8', mode: 0o600 });
    }

    await chmod(knownHostsPath, 0o600);
  }

  private async readPinnedEntry(
    server: Server,
  ): Promise<KnownHostEntry | null> {
    const knownHostsPath = this.resolveKnownHostsPath();
    if (!existsSync(knownHostsPath)) {
      return null;
    }

    const marker = this.knownHostMarker(server);
    const content = await readFile(knownHostsPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const tokens = line.split(/\s+/);
      if (tokens.length < 3) {
        continue;
      }

      const hostsToken = tokens[0];
      const hosts = hostsToken.split(',');
      if (!hosts.includes(marker)) {
        continue;
      }

      const keyType = tokens[1];
      const keyBase64 = tokens[2];
      return {
        marker,
        keyType,
        keyBase64,
        knownHostsLine: `${marker} ${keyType} ${keyBase64}`,
      };
    }

    return null;
  }

  private async upsertPinnedEntry(entry: KnownHostEntry): Promise<void> {
    const knownHostsPath = this.resolveKnownHostsPath();
    const lines = existsSync(knownHostsPath)
      ? (await readFile(knownHostsPath, 'utf-8')).split(/\r?\n/)
      : [];

    const filtered = lines.filter((rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        return true;
      }
      const hostsToken = line.split(/\s+/, 1)[0];
      return !hostsToken.split(',').includes(entry.marker);
    });

    filtered.push(entry.knownHostsLine);
    const output = `${filtered.filter((line) => line.length > 0).join('\n')}\n`;
    await writeFile(knownHostsPath, output, { encoding: 'utf-8', mode: 0o600 });
    await chmod(knownHostsPath, 0o600);
  }

  private async scanHostKey(server: Server): Promise<KnownHostEntry> {
    const sanitizedHost = this.sanitizeHost(server.host);
    const sanitizedPort = this.sanitizePort(server.port);

    const output = await new Promise<string>((resolveOutput, rejectOutput) => {
      const chunks: string[] = [];
      const proc = spawn('ssh-keyscan', [
        '-T',
        '5',
        '-p',
        String(sanitizedPort),
        sanitizedHost,
      ]);

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        rejectOutput(
          new BadRequestException(
            'Timeout lors de la récupération du host key.',
          ),
        );
      }, 7_000);

      proc.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk.toString());
      });

      proc.on('error', () => {
        clearTimeout(timeout);
        rejectOutput(
          new BadRequestException(
            'ssh-keyscan indisponible sur la machine de contrôle.',
          ),
        );
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0 && chunks.join('').trim().length === 0) {
          rejectOutput(
            new BadRequestException(
              'Impossible de récupérer le host key distant. Vérifiez réseau/SSH.',
            ),
          );
          return;
        }

        resolveOutput(chunks.join(''));
      });
    });

    const parsedCandidates = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const tokens = line.split(/\s+/);
        if (tokens.length < 3) {
          return null;
        }
        return {
          keyType: tokens[1],
          keyBase64: tokens[2],
        };
      })
      .filter(
        (candidate): candidate is { keyType: string; keyBase64: string } =>
          Boolean(candidate),
      );

    if (parsedCandidates.length === 0) {
      throw new BadRequestException(
        'Aucune clé hôte SSH valide récupérée depuis le serveur cible.',
      );
    }

    const chosen =
      parsedCandidates.sort((a, b) => {
        const aRank = KEY_TYPE_PRIORITY.indexOf(a.keyType);
        const bRank = KEY_TYPE_PRIORITY.indexOf(b.keyType);
        const normalizedARank = aRank === -1 ? Number.MAX_SAFE_INTEGER : aRank;
        const normalizedBRank = bRank === -1 ? Number.MAX_SAFE_INTEGER : bRank;
        return normalizedARank - normalizedBRank;
      })[0] ?? parsedCandidates[0];

    const marker = this.knownHostMarker(server);
    return {
      marker,
      keyType: chosen.keyType,
      keyBase64: chosen.keyBase64,
      knownHostsLine: `${marker} ${chosen.keyType} ${chosen.keyBase64}`,
    };
  }

  private sanitizeHost(host: string): string {
    const sanitized = host.trim().replace(/^\[/, '').replace(/\]$/, '');
    if (!/^[A-Za-z0-9._:-]+$/.test(sanitized)) {
      throw new BadRequestException(
        'Host SSH invalide pour validation de fingerprint.',
      );
    }
    return sanitized;
  }

  private sanitizePort(port: number): number {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BadRequestException('Port SSH invalide.');
    }
    return port;
  }

  private knownHostMarker(server: Server): string {
    const host = this.sanitizeHost(server.host);
    const cleanHost = host.replace(/^\[/, '').replace(/\]$/, '');
    return `[${cleanHost}]:${String(this.sanitizePort(server.port))}`;
  }

  private isProduction(): boolean {
    return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  }
}
