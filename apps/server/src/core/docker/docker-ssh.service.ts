import { Injectable } from '@nestjs/common';
import {
  SshConnection,
  SshExecResult,
  SshExecutorService,
} from '../ssh/ssh-executor.service';

/**
 * Docker operations performed over an SSH shell (the "no TLS" path). Centralises
 * every `docker …` command string the platform shells out over SSH, so they are
 * defined once instead of being copy-pasted across monitoring + deployments.
 *
 * The TLS Docker Engine API path lives in {@link DockerApiService}; this one is
 * the SSH fallback used for servers without a configured DockerConnection.
 */
@Injectable()
export class DockerSshService {
  private static readonly STATS_FORMAT =
    '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}';

  constructor(private readonly ssh: SshExecutorService) {}

  /** `docker stats` for a single container; returns the raw line or `NOT_FOUND`. */
  async containerStats(conn: SshConnection, containerName: string): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker stats --no-stream --format "${DockerSshService.STATS_FORMAT}" ${containerName} 2>/dev/null || echo "NOT_FOUND"`,
    );
    return r.stdout.trim();
  }

  /** `docker stats` for all containers whose name matches a project slug. */
  async projectStats(conn: SshConnection, projectSlug: string): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker stats --no-stream --format "${DockerSshService.STATS_FORMAT}" 2>/dev/null | grep "^[^|]*|${projectSlug}" || true`,
    );
    return r.stdout.trim();
  }

  /** `docker ps` status string for a single named container. */
  async containerStatus(conn: SshConnection, containerName: string): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker ps --filter "name=${containerName}" --format "{{.Status}}" 2>/dev/null`,
    );
    return r.stdout.trim();
  }

  /** Tail of `docker logs`; appends a CONTAINER_NOT_FOUND sentinel on failure. */
  async containerLogs(
    conn: SshConnection,
    containerName: string,
    tail: number,
  ): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker logs --tail ${String(tail)} --timestamps ${containerName} 2>&1 || echo "CONTAINER_NOT_FOUND"`,
    );
    return r.stdout.trim();
  }

  /** First container name matching a (case-insensitive) pattern, or ''. */
  async findContainerByName(
    conn: SshConnection,
    namePattern: string,
  ): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker ps -a --format '{{.Names}}' | grep -i '${namePattern}' | head -1`,
    );
    return r.stdout.trim();
  }

  /** All container names (`docker ps -a`). */
  async listContainerNames(conn: SshConnection): Promise<string> {
    const r = await this.ssh.exec(conn, `docker ps -a --format '{{.Names}}'`);
    return r.stdout.trim();
  }

  /** Raw `docker logs` result for an exact container name. */
  async logsRaw(
    conn: SshConnection,
    containerName: string,
    tail: number,
  ): Promise<SshExecResult> {
    return this.ssh.exec(
      conn,
      `docker logs --tail=${String(tail)} --timestamps "${containerName}" 2>&1`,
    );
  }

  /** Immutable image digest (sha256:…) via `docker inspect`, or null. */
  async imageDigest(
    conn: SshConnection,
    imageRef: string,
  ): Promise<string | null> {
    const escaped = imageRef.replace(/'/g, "'\\''");
    const r = await this.ssh.exec(
      conn,
      `docker inspect --format='{{index .RepoDigests 0}}' '${escaped}' ` +
        `|| docker inspect --format='{{.Id}}' '${escaped}'`,
    );
    return (
      (r.stdout || '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('sha256:')) ?? null
    );
  }
}
