import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { PlatformService } from '../../../platform/platform.service';

export type MonitoringMetricSnapshot = {
  up: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  networkRxBytesPerSec: number | null;
  networkTxBytesPerSec: number | null;
  uptimeSeconds: number | null;
};

export type MetricRangePoint = { t: number; value: number | null };
export type HostMetricRange = {
  configured: boolean;
  host: string;
  from: number;
  to: number;
  stepSeconds: number;
  series: {
    cpuPercent: MetricRangePoint[];
    memoryPercent: MetricRangePoint[];
    diskPercent: MetricRangePoint[];
  };
};

export type ServiceMetricRange = {
  configured: boolean;
  serviceEnvId: string;
  from: number;
  to: number;
  stepSeconds: number;
  series: {
    cpuPercent: MetricRangePoint[];
    memoryMb: MetricRangePoint[];
  };
};

type PrometheusMatrixSample = {
  metric?: Record<string, string>;
  values?: Array<[number, string]>;
};

type PrometheusVectorSample = {
  metric?: Record<string, string>;
  value?: [number | string, string];
};

@Injectable()
export class MonitoringPrometheusService {
  private readonly logger = new Logger(MonitoringPrometheusService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly platformConfig: PlatformService,
  ) {}

  async getPrometheusStatus() {
    const prometheusUrl = await this.getConfigValue(
      'MONITORING_PROMETHEUS_URL',
    );
    if (!prometheusUrl) {
      return {
        configured: false,
        reachable: false,
        url: null,
        message: 'Prometheus URL is not configured.',
        totalTargets: 0,
        upTargets: 0,
        downTargets: 0,
      };
    }

    const normalizedUrl = this.trimTrailingSlash(prometheusUrl);

    try {
      await firstValueFrom(
        this.httpService.get(`${normalizedUrl}/-/ready`, {
          timeout: 4_000,
        }),
      );

      const targetsRes = await firstValueFrom(
        this.httpService.get<{
          data?: { activeTargets?: Array<{ health?: string }> };
        }>(`${normalizedUrl}/api/v1/targets`, {
          timeout: 5_000,
        }),
      );

      const targets = targetsRes.data?.data?.activeTargets ?? [];
      const upTargets = targets.filter(
        (target) => target.health === 'up',
      ).length;
      const downTargets = Math.max(targets.length - upTargets, 0);

      return {
        configured: true,
        reachable: true,
        url: normalizedUrl,
        message: 'Prometheus is reachable.',
        totalTargets: targets.length,
        upTargets,
        downTargets,
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        url: normalizedUrl,
        message: `Prometheus is unreachable: ${this.errorMessage(error)}`,
        totalTargets: 0,
        upTargets: 0,
        downTargets: 0,
      };
    }
  }

  async fetchPrometheusMetricsByHost(): Promise<
    Map<string, MonitoringMetricSnapshot>
  > {
    const prometheusUrl = await this.getConfigValue(
      'MONITORING_PROMETHEUS_URL',
    );
    if (!prometheusUrl) {
      return new Map();
    }

    const normalized = this.trimTrailingSlash(prometheusUrl);

    const [
      upValues,
      cpuValues,
      memoryValues,
      diskValues,
      rxValues,
      txValues,
      uptimeValues,
    ] = await Promise.all([
      this.queryPrometheus(normalized, 'up{job=~".*node.*exporter.*"}'),
      this.queryPrometheus(
        normalized,
        '100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))',
      ),
      this.queryPrometheus(
        normalized,
        '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))',
      ),
      this.queryPrometheus(
        normalized,
        '100 * (1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}))',
      ),
      this.queryPrometheus(
        normalized,
        'sum by(instance) (rate(node_network_receive_bytes_total{device!~"lo"}[5m]))',
      ),
      this.queryPrometheus(
        normalized,
        'sum by(instance) (rate(node_network_transmit_bytes_total{device!~"lo"}[5m]))',
      ),
      this.queryPrometheus(
        normalized,
        '(node_time_seconds - node_boot_time_seconds)',
      ),
    ]);

    const metricMap = new Map<string, MonitoringMetricSnapshot>();

    const setValue = (
      host: string,
      key: keyof MonitoringMetricSnapshot,
      value: number | null,
    ) => {
      const current = metricMap.get(host) ?? this.emptyMetricSnapshot();
      metricMap.set(host, { ...current, [key]: value });
    };

    const apply = (
      samples: PrometheusVectorSample[],
      key: keyof MonitoringMetricSnapshot,
    ) => {
      for (const sample of samples) {
        const instance = sample.metric?.instance;
        const host = instance ? this.extractHostFromInstance(instance) : null;
        const rawValue = sample.value?.[1];
        if (!host || rawValue === undefined) {
          continue;
        }
        const parsed = Number(rawValue);
        setValue(host, key, Number.isFinite(parsed) ? parsed : null);
      }
    };

    apply(upValues, 'up');
    apply(cpuValues, 'cpuPercent');
    apply(memoryValues, 'memoryPercent');
    apply(diskValues, 'diskPercent');
    apply(rxValues, 'networkRxBytesPerSec');
    apply(txValues, 'networkTxBytesPerSec');
    apply(uptimeValues, 'uptimeSeconds');

    return metricMap;
  }

  /**
   * Historical (time-series) metrics for one host, via Prometheus
   * `query_range`. Complements the live snapshot: lets the UI draw CPU/mem/disk
   * charts over a window instead of only the instant value.
   */
  async getHostMetricRange(params: {
    host: string;
    from: Date;
    to: Date;
    stepSeconds: number;
  }): Promise<HostMetricRange> {
    const { host, from, to, stepSeconds } = params;
    const base: HostMetricRange = {
      configured: false,
      host,
      from: Math.floor(from.getTime() / 1000),
      to: Math.floor(to.getTime() / 1000),
      stepSeconds,
      series: { cpuPercent: [], memoryPercent: [], diskPercent: [] },
    };

    const prometheusUrl = await this.getConfigValue(
      'MONITORING_PROMETHEUS_URL',
    );
    if (!prometheusUrl) return base;
    const normalized = this.trimTrailingSlash(prometheusUrl);

    // Escape regex metacharacters AND the double-quote so the host can neither
    // alter the regex nor break out of the PromQL string literal.
    const h = host.replace(/["\\.*+?^${}()|[\]]/g, '\\$&');
    const inst = `instance=~"${h}:.*"`;

    const [cpu, mem, disk] = await Promise.all([
      this.queryRangePrometheus(
        normalized,
        `100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle",${inst}}[5m])))`,
        base.from,
        base.to,
        stepSeconds,
      ),
      this.queryRangePrometheus(
        normalized,
        `100 * (1 - (node_memory_MemAvailable_bytes{${inst}} / node_memory_MemTotal_bytes{${inst}}))`,
        base.from,
        base.to,
        stepSeconds,
      ),
      this.queryRangePrometheus(
        normalized,
        `100 * (1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay",${inst}} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay",${inst}}))`,
        base.from,
        base.to,
        stepSeconds,
      ),
    ]);

    return {
      ...base,
      configured: true,
      series: {
        cpuPercent: cpu,
        memoryPercent: mem,
        diskPercent: disk,
      },
    };
  }

  /**
   * Historical CPU/memory time-series for a SERVICE-ENVIRONMENT's container(s),
   * via cAdvisor metrics filtered on the `platform.service_env` Docker label
   * (exposed by cAdvisor as `container_label_platform_service_env`). Powers the
   * per-service charts + deployment markers. Returns empty when the Prometheus
   * stack is not installed (graceful degradation → UI falls back to live).
   */
  async getServiceMetricRange(params: {
    serviceEnvId: string;
    from: Date;
    to: Date;
    stepSeconds: number;
  }): Promise<ServiceMetricRange> {
    const { serviceEnvId, from, to, stepSeconds } = params;
    const base: ServiceMetricRange = {
      configured: false,
      serviceEnvId,
      from: Math.floor(from.getTime() / 1000),
      to: Math.floor(to.getTime() / 1000),
      stepSeconds,
      series: { cpuPercent: [], memoryMb: [] },
    };

    const prometheusUrl = await this.getConfigValue(
      'MONITORING_PROMETHEUS_URL',
    );
    if (!prometheusUrl) return base;
    const normalized = this.trimTrailingSlash(prometheusUrl);

    // Escape regex/quote so the id can neither alter the regex nor break the
    // PromQL string literal.
    const id = serviceEnvId.replace(/["\\.*+?^${}()|[\]]/g, '\\$&');
    const sel = `container_label_platform_service_env="${id}"`;

    const [cpu, mem] = await Promise.all([
      this.queryRangePrometheus(
        normalized,
        `sum(rate(container_cpu_usage_seconds_total{${sel}}[5m])) * 100`,
        base.from,
        base.to,
        stepSeconds,
      ),
      this.queryRangePrometheus(
        normalized,
        `sum(container_memory_usage_bytes{${sel}}) / 1024 / 1024`,
        base.from,
        base.to,
        stepSeconds,
      ),
    ]);

    return {
      ...base,
      configured: true,
      series: { cpuPercent: cpu, memoryMb: mem },
    };
  }

  private async queryRangePrometheus(
    prometheusUrl: string,
    query: string,
    start: number,
    end: number,
    step: number,
  ): Promise<MetricRangePoint[]> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<{
          data?: { result?: PrometheusMatrixSample[] };
        }>(`${prometheusUrl}/api/v1/query_range`, {
          params: { query, start, end, step },
          timeout: 8_000,
        }),
      );
      // First series only (query is filtered to a single host).
      const values = res.data?.data?.result?.[0]?.values ?? [];
      return values.map(([t, v]) => {
        const parsed = Number(v);
        return { t: Number(t), value: Number.isFinite(parsed) ? parsed : null };
      });
    } catch (error) {
      this.logger.warn(
        `Prometheus query_range failed (${query}): ${this.errorMessage(error)}`,
      );
      return [];
    }
  }

  private async queryPrometheus(
    prometheusUrl: string,
    query: string,
  ): Promise<PrometheusVectorSample[]> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<{
          status?: string;
          data?: {
            resultType?: string;
            result?: PrometheusVectorSample[];
          };
        }>(`${prometheusUrl}/api/v1/query`, {
          params: { query },
          timeout: 5_000,
        }),
      );

      const result = res.data?.data?.result;
      return Array.isArray(result) ? result : [];
    } catch (error) {
      this.logger.warn(
        `Prometheus query failed (${query}): ${this.errorMessage(error)}`,
      );
      return [];
    }
  }

  private extractHostFromInstance(instance: string): string {
    const trimmed = instance.trim();

    if (trimmed.startsWith('[') && trimmed.includes(']:')) {
      return trimmed.slice(1, trimmed.indexOf(']:')).toLowerCase();
    }

    const parts = trimmed.split(':');
    if (parts.length <= 2) {
      return parts[0].toLowerCase();
    }

    return trimmed.toLowerCase();
  }

  private emptyMetricSnapshot(): MonitoringMetricSnapshot {
    return {
      up: null,
      cpuPercent: null,
      memoryPercent: null,
      diskPercent: null,
      networkRxBytesPerSec: null,
      networkTxBytesPerSec: null,
      uptimeSeconds: null,
    };
  }

  private trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
  }

  private async getConfigValue(key: string): Promise<string | null> {
    const value = await this.platformConfig.get(key);
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
