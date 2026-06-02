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

  async runPostDeployHealthChecks(params: {
    deploymentId: string;
    environmentDomain: string | null;
    serviceDomain?: string | null;
    serverHost: string;
    appPort: number;
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
    const retryDelayMs = this.parsePositiveInt(
      this.configService.get<string>('DEPLOY_HEALTHCHECK_RETRY_DELAY_MS'),
      4000,
    );

    const targets = this.buildHealthCheckTargets({
      environmentDomain: params.serviceDomain ?? params.environmentDomain,
      serverHost: params.serverHost,
      appPort: params.appPort,
    });

    if (targets.length === 0) {
      return 'Health-check post-déploiement ignoré (aucune cible disponible).';
    }

    let lastError = '';
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      for (const target of targets) {
        this.emitGatewayLog(
          params.deploymentId,
          `[HEALTHCHECK] Tentative ${String(attempt)}/${String(retries)}: ${target}`,
          'info',
        );

        try {
          const response = await axios.get(target, {
            timeout: timeoutMs,
            validateStatus: () => true,
            maxRedirects: 0,
          });

          if (
            response.status >= 200 &&
            response.status < 500 &&
            response.status !== 429
          ) {
            const successMessage = `[HEALTHCHECK] OK ${target} (status ${String(response.status)})`;
            this.emitGatewayLog(params.deploymentId, successMessage, 'info');
            return `Health-check post-déploiement OK sur ${target} (status ${String(response.status)}).`;
          }

          lastError = `${target} a répondu status ${String(response.status)}`;
        } catch (error) {
          lastError = `${
            error instanceof Error ? error.message : 'erreur inconnue'
          } (${target})`;
        }
      }

      if (attempt < retries) {
        await this.sleep(retryDelayMs);
      }
    }

    throw new BadRequestException(
      `Health-check post-déploiement échoué après ${String(retries)} tentative(s). Dernière erreur: ${lastError}`,
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

  private buildHealthCheckTargets(params: {
    environmentDomain: string | null;
    serverHost: string;
    appPort: number;
  }): string[] {
    const targets = new Set<string>();

    if (params.environmentDomain?.trim()) {
      for (const baseUrl of this.toBaseUrls(params.environmentDomain.trim())) {
        targets.add(`${baseUrl}/health`);
        targets.add(`${baseUrl}/`);
      }
    }

    const hostBase = `http://${params.serverHost}:${String(params.appPort)}`;
    targets.add(`${hostBase}/health`);
    targets.add(`${hostBase}/`);

    return [...targets];
  }

  private toBaseUrls(hostOrUrl: string): string[] {
    const normalized = hostOrUrl.replace(/\/+$/g, '');
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return [normalized];
    }

    return [`https://${normalized}`, `http://${normalized}`];
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
