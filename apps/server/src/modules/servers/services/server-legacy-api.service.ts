import { GoneException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerAuditService } from './server-audit.service';

@Injectable()
export class ServerLegacyApiService {
  private readonly logger = new Logger(ServerLegacyApiService.name);

  constructor(
    private readonly audit: ServerAuditService,
    private readonly configService: ConfigService,
  ) {}

  applyDeprecationHeaders(
    setHeader: (name: string, value: string) => void,
  ): void {
    const sunsetDate = this.resolveSunsetDate();
    setHeader('Deprecation', 'true');
    setHeader('Sunset', sunsetDate.toUTCString());
    setHeader(
      'Warning',
      `299 - "Deprecated API endpoint. Migrate before ${sunsetDate.toISOString()}"`,
    );
  }

  assertEndpointAvailable(endpoint: string): void {
    if (!this.isLegacyApiEnabled()) {
      throw new GoneException(
        `Legacy endpoint disabled: ${endpoint}. Use the new server preparation workflow endpoints.`,
      );
    }

    const now = new Date();
    const sunsetDate = this.resolveSunsetDate();
    if (now >= sunsetDate) {
      throw new GoneException(
        `Legacy endpoint retired since ${sunsetDate.toISOString()}: ${endpoint}. Use the new workflow endpoints.`,
      );
    }
  }

  async trackUsage(
    serverId: string,
    endpoint: string,
    actorId?: string,
  ): Promise<void> {
    const sunsetDate = this.resolveSunsetDate().toISOString();
    this.logger.warn(
      `Legacy servers API used: endpoint=${endpoint}, serverId=${serverId}, sunset=${sunsetDate}`,
    );
    await this.audit.record(serverId, 'SERVER_LEGACY_API_USED', actorId, {
      endpoint,
      sunsetDate,
    });
  }

  private isLegacyApiEnabled(): boolean {
    const raw = (this.configService.get<string>('SERVER_LEGACY_API_ENABLED', 'true'))
      .trim()
      .toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
  }

  private resolveSunsetDate(): Date {
    const raw = this.configService.get<string>('SERVER_LEGACY_API_SUNSET_DATE', '').trim() || undefined;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date('2026-07-31T23:59:59.000Z');
  }
}
