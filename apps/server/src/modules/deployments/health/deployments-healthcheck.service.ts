import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DeploymentsGateway } from '../gateways/deployments.gateway';

type DeploymentLogLevel = 'info' | 'error' | 'success';

@Injectable()
export class DeploymentsHealthcheckService {
  constructor(
    private readonly configService: ConfigService,
    private readonly gateway: DeploymentsGateway,
  ) {}

  /**
   * Progressive post-deploy health check, in 3 phases:
   *   1. Startup grace — wait DEPLOY_STARTUP_GRACE_MS before the first probe so a
   *      slow-booting app is not failed prematurely.
   *   2. Liveness — up to DEPLOY_HEALTHCHECK_RETRIES probes every INTERVAL_MS;
   *      any HTTP 200–499 counts as "alive" (a 4xx still means the server is up).
   *   3. Readiness — only mark healthy after DEPLOY_HEALTHCHECK_CONSECUTIVE
   *      consecutive successes (a single lucky 200 is not enough).
   *
   * Returns a summary string on success; THROWS (with the last 3 responses) on
   * failure so the executor can stop the broken container and mark the
   * deployment FAILED. Every attempt is streamed to the deploy log.
   */
  async runPostDeployHealthChecks(params: {
    deploymentId: string;
    environmentDomain: string | null;
    serviceDomain?: string | null;
    serverHost: string;
    appPort: number;
    healthcheckPath?: string | null;
  }): Promise<string> {
    if (!this.isPostDeployHealthCheckEnabled()) {
      return 'Health-check post-déploiement ignoré (DEPLOY_HEALTHCHECK_ENABLED=false).';
    }

    const timeoutMs = this.parsePositiveInt(
      this.configService.get<string>('DEPLOY_HEALTHCHECK_TIMEOUT_MS'),
      5000,
    );
    const retries = this.parsePositiveInt(
      this.configService.get<string>('DEPLOY_HEALTHCHECK_RETRIES'),
      6,
    );
    const intervalMs = this.parsePositiveInt(
      this.configService.get<string>('DEPLOY_HEALTHCHECK_INTERVAL_MS') ??
        this.configService.get<string>('DEPLOY_HEALTHCHECK_RETRY_DELAY_MS'),
      5000,
    );
    const startupGraceMs = this.parsePositiveInt(
      this.configService.get<string>('DEPLOY_STARTUP_GRACE_MS'),
      15000,
    );
    const consecutiveRequired = this.parsePositiveInt(
      this.configService.get<string>('DEPLOY_HEALTHCHECK_CONSECUTIVE'),
      2,
    );

    const target = this.buildHealthCheckTarget(params);

    // ── Phase 1 — startup grace ─────────────────────────────────────────────
    this.emitGatewayLog(
      params.deploymentId,
      `[HEALTH] Startup grace ${String(startupGraceMs)}ms before first check (${target})`,
      'info',
    );
    await this.sleep(startupGraceMs);

    // ── Phase 2 + 3 — liveness then readiness ───────────────────────────────
    const recentResponses: string[] = [];
    let consecutive = 0;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const startedAt = Date.now();
      let outcome: string;
      let alive = false;

      try {
        const response = await axios.get(target, {
          timeout: timeoutMs,
          validateStatus: () => true,
          maxRedirects: 0,
        });
        const latency = Date.now() - startedAt;
        alive = response.status >= 200 && response.status < 500;
        outcome = `HTTP ${String(response.status)} (${String(latency)}ms)`;
      } catch (error) {
        outcome = error instanceof Error ? error.message : 'erreur inconnue';
      }

      recentResponses.push(outcome);
      if (recentResponses.length > 3) recentResponses.shift();

      if (alive) {
        consecutive += 1;
        this.emitGatewayLog(
          params.deploymentId,
          `[HEALTH] Attempt ${String(attempt)}/${String(retries)} → ${outcome} OK (${String(consecutive)}/${String(consecutiveRequired)})`,
          'info',
        );
        if (consecutive >= consecutiveRequired) {
          return `Health-check OK sur ${target} (${String(consecutiveRequired)} succès consécutifs).`;
        }
      } else {
        consecutive = 0;
        this.emitGatewayLog(
          params.deploymentId,
          `[HEALTH] Attempt ${String(attempt)}/${String(retries)} → ${outcome} (app starting...)`,
          'info',
        );
      }

      if (attempt < retries) {
        await this.sleep(intervalMs);
      }
    }

    throw new BadRequestException(
      `Health-check post-déploiement échoué après ${String(retries)} tentative(s) sur ${target}. ` +
        `Dernières réponses: ${recentResponses.join(' | ')}`,
    );
  }

  private isPostDeployHealthCheckEnabled(): boolean {
    const raw = (
      this.configService.get<string>('DEPLOY_HEALTHCHECK_ENABLED') ?? 'true'
    ).trim();
    return raw !== '0' && raw.toLowerCase() !== 'false';
  }

  private parsePositiveInt(
    rawValue: string | undefined,
    fallback: number,
  ): number {
    if (!rawValue?.trim()) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  /**
   * Single probe target for the consecutive-readiness loop. Prefers the
   * host:port endpoint (always reachable right after deploy) with the
   * service's healthcheckPath (or '/'). A configured domain is not used here
   * because DNS/proxy may not be wired yet at deploy time.
   */
  private buildHealthCheckTarget(params: {
    serverHost: string;
    appPort: number;
    healthcheckPath?: string | null;
  }): string {
    const rawPath = params.healthcheckPath?.trim() || '/';
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    return `http://${params.serverHost}:${String(params.appPort)}${path}`;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, ms);
    });
  }

  private emitGatewayLog(
    deploymentId: string,
    rawMessage: string,
    fallbackLevel: 'info' | 'error',
  ): void {
    const lines = rawMessage
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      this.gateway.emitLog({
        deploymentId,
        message: line,
        level: this.inferLogLevel(line, fallbackLevel),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private inferLogLevel(
    message: string,
    fallbackLevel: 'info' | 'error',
  ): DeploymentLogLevel {
    if (/error|fail|fatal|exception/i.test(message)) {
      return 'error';
    }

    if (/success|ok|done|completed|ready/i.test(message)) {
      return 'success';
    }

    return fallbackLevel;
  }
}
