import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { PlatformService } from '../../../platform/platform.service';

/** Une ligne de log persistée renvoyée par Loki. */
export type LokiLogEntry = {
  /** Timestamp en millisecondes (Loki renvoie des ns, on normalise). */
  ts: number;
  line: string;
  labels?: Record<string, string>;
};

export type LokiSearchResult = {
  /** MONITORING_LOKI_URL est-elle configurée ? (sinon l'UI retombe sur le tail live). */
  configured: boolean;
  /** Loki a-t-il répondu ? */
  reachable: boolean;
  serviceEnvId: string;
  /** Fenêtre demandée, en secondes unix. */
  from: number;
  to: number;
  total: number;
  entries: LokiLogEntry[];
  message?: string;
};

type LokiQueryRangeResponse = {
  data?: {
    result?: Array<{
      stream?: Record<string, string>;
      values?: Array<[string, string]>;
    }>;
  };
};

const LOKI_CONFIG_KEY = 'MONITORING_LOKI_URL';
/**
 * Le driver de log Loki sanitise les labels Docker `deployautomation.service_env`
 * (point interdit dans un nom de label Loki) → `deployautomation_service_env`.
 * Voir buildDeployautomationLabels (container-spec.util).
 */
const SERVICE_ENV_LABEL = 'deployautomation_service_env';

/**
 * Recherche de logs runtime HISTORIQUES via Loki (stockage centralisé), par
 * opposition au tail live de MonitoringRuntimeLogsService (N dernières lignes via l'API
 * Docker). Filtre par instance service×env grâce aux labels `deployautomation.*` déjà
 * posés au déploiement. Dégradation gracieuse : si MONITORING_LOKI_URL est
 * absente, `configured=false` et l'UI bascule sur le tail live.
 */
@Injectable()
export class MonitoringLokiService {
  private readonly logger = new Logger(MonitoringLokiService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly platformConfig: PlatformService,
  ) {}

  /** True si la plateforme a une URL Loki configurée. */
  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getConfigValue(LOKI_CONFIG_KEY));
  }

  /**
   * Interroge Loki pour les logs d'une instance service×env sur une fenêtre.
   * `search` est appliqué comme filtre de ligne LogQL insensible à la casse.
   *
   * `lokiUrlOverride` : URL du Loki du serveur RÉEL hébergeant ce
   * service-env (résolue par l'appelant via MonitoringServerResolverService).
   * Sans elle, on retomberait sur la config plateforme globale, figée sur le
   * premier serveur ayant eu la stack installée — jamais forcément celui qui
   * héberge ce service précis (c'est ce qui provoquait "Loki injoignable"
   * pour un service tournant sur un AUTRE serveur que celui-là).
   */
  async queryServiceLogs(
    serviceEnvId: string,
    opts: {
      from?: Date;
      to?: Date;
      search?: string;
      limit?: number;
      lokiUrlOverride?: string;
    } = {},
  ): Promise<LokiSearchResult> {
    const to = opts.to ?? new Date();
    const from = opts.from ?? new Date(to.getTime() - 60 * 60 * 1000); // défaut : 1h
    const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);

    const base: LokiSearchResult = {
      configured: false,
      reachable: false,
      serviceEnvId,
      from: Math.floor(from.getTime() / 1000),
      to: Math.floor(to.getTime() / 1000),
      total: 0,
      entries: [],
    };

    const lokiUrl =
      opts.lokiUrlOverride ?? (await this.getConfigValue(LOKI_CONFIG_KEY));
    if (!lokiUrl) {
      return { ...base, message: 'Loki n’est pas configuré.' };
    }
    const normalized = this.trimTrailingSlash(lokiUrl);
    const query = this.buildLogQL(serviceEnvId, opts.search);

    try {
      const res = await firstValueFrom(
        this.httpService.get<LokiQueryRangeResponse>(
          `${normalized}/loki/api/v1/query_range`,
          {
            params: {
              query,
              start: this.toNanos(from),
              end: this.toNanos(to),
              limit,
              direction: 'backward',
            },
            timeout: 8_000,
          },
        ),
      );
      const entries = this.parse(res.data);
      return {
        ...base,
        configured: true,
        reachable: true,
        total: entries.length,
        entries,
      };
    } catch (error) {
      this.logger.warn(`Loki query_range failed: ${this.errorMessage(error)}`);
      return {
        ...base,
        configured: true,
        reachable: false,
        message: `Loki injoignable : ${this.errorMessage(error)}`,
      };
    }
  }

  /**
   * Construit la requête LogQL : un sélecteur de stream sur le label
   * service×env + un filtre de ligne optionnel (insensible à la casse). Les
   * deux entrées utilisateur sont échappées pour ne pas pouvoir altérer la
   * requête (ni le matcher de label, ni le littéral regex).
   */
  buildLogQL(serviceEnvId: string, search?: string): string {
    const id = this.escapeLabelValue(serviceEnvId);
    let query = `{${SERVICE_ENV_LABEL}="${id}"}`;
    const term = search?.trim();
    if (term) {
      query += ` |~ "(?i)${this.escapeRegexLiteral(term)}"`;
    }
    return query;
  }

  /** Aplatit `streams[].values = [[tsNs, line], …]` puis trie du + récent au + ancien. */
  private parse(data: LokiQueryRangeResponse | undefined): LokiLogEntry[] {
    const streams = data?.data?.result ?? [];
    const out: LokiLogEntry[] = [];
    for (const stream of streams) {
      for (const [tsNs, line] of stream.values ?? []) {
        out.push({
          ts: Math.floor(Number(tsNs) / 1e6),
          line,
          labels: stream.stream,
        });
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }

  /** Échappe `\` et `"` pour un matcher de label entre guillemets. */
  private escapeLabelValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /** Échappe les métacaractères regex + les guillemets du littéral LogQL. */
  private escapeRegexLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"');
  }

  /** ms → ns (Loki attend des nanosecondes). */
  private toNanos(date: Date): string {
    return `${date.getTime()}000000`;
  }

  private trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
  }

  private async getConfigValue(key: string): Promise<string | null> {
    const value = await this.platformConfig.get(key);
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
