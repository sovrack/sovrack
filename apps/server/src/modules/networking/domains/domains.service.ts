import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DnsProvider, DnsProviderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { CreateDnsProviderDto } from './dto/create-dns-provider.dto';
import { UpsertDnsRecordDto } from './dto/upsert-dns-record.dto';

const domainInclude = {
  provider: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  records: {
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.DomainInclude;

/**
 * Domains module — owns the Domain aggregate (a project's domains + their DNS
 * records) AND the DNS providers (Cloudflare, OVH, DigitalOcean, MANUAL) those
 * domains reference. The former standalone dns/ module was folded in here so a
 * single module owns the whole DNS surface.
 */
@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  // ── DNS providers ──────────────────────────────────────────────────────

  async listProviders() {
    const providers = await this.prisma.dnsProvider.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return providers.map((provider) => this.toPublicProvider(provider));
  }

  async createProvider(dto: CreateDnsProviderDto) {
    const provider = await this.prisma.dnsProvider.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        apiToken: dto.apiToken?.trim()
          ? this.crypto.encrypt(dto.apiToken.trim())
          : undefined,
        accountId: dto.accountId?.trim() || undefined,
        zoneId: dto.zoneId?.trim() || undefined,
      },
    });
    return this.toPublicProvider(provider);
  }

  async testProvider(providerId: string) {
    const provider = await this.prisma.dnsProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException('Provider DNS introuvable');
    }

    if (provider.type === DnsProviderType.MANUAL) {
      return {
        ok: true,
        status: 'MANUAL',
        message:
          'Provider MANUAL prêt: Vaytek affichera les records à créer manuellement.',
      };
    }

    if (!provider.apiToken) {
      throw new BadRequestException(
        'Token API DNS manquant pour tester ce provider',
      );
    }

    return {
      ok: true,
      status: 'CONFIGURED',
      message:
        'Credentials présents. Le test API automatisé sera activé provider par provider.',
    };
  }

  private toPublicProvider(provider: DnsProvider) {
    return {
      ...provider,
      apiToken: provider.apiToken ? '***' : null,
      apiTokenConfigured: Boolean(provider.apiToken),
    };
  }

  // ── Domains ────────────────────────────────────────────────────────────

  async listDomains(projectId?: string, serviceEnvId?: string) {
    return await this.prisma.domain.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(serviceEnvId ? { serviceEnvId } : {}),
      },
      orderBy: { name: 'asc' },
      include: domainInclude,
    });
  }

  async createDomain(dto: CreateDomainDto) {
    await this.validateProvider(dto.providerId);
    await this.validateProject(dto.projectId);

    return await this.prisma.domain.create({
      data: {
        name: dto.name.trim().toLowerCase(),
        providerId: dto.providerId?.trim() || undefined,
        projectId: dto.projectId?.trim() || undefined,
        serviceEnvId: dto.serviceEnvId?.trim() || undefined,
      },
      include: domainInclude,
    });
  }

  async removeDomain(domainId: string): Promise<void> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });
    if (!domain) throw new NotFoundException('Domaine introuvable');
    await this.prisma.domain.delete({ where: { id: domainId } });
  }

  async verifyDomain(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { records: true },
    });

    if (!domain) {
      throw new NotFoundException('Domaine introuvable');
    }

    const verified = domain.records.length > 0;
    return await this.prisma.domain.update({
      where: { id: domainId },
      data: { verified },
      include: domainInclude,
    });
  }

  async listRecords(domainId: string) {
    await this.ensureDomainExists(domainId);
    return await this.prisma.dnsRecord.findMany({
      where: { domainId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRecord(domainId: string, dto: UpsertDnsRecordDto) {
    await this.ensureDomainExists(domainId);
    await this.validateRecordLinks(dto);

    return await this.prisma.dnsRecord.create({
      data: {
        domainId,
        type: dto.type,
        name: dto.name.trim(),
        value: dto.value.trim(),
        ttl: dto.ttl ?? 300,
        proxied: dto.proxied,
        serviceEnvId: dto.serviceEnvId?.trim() || undefined,
      },
    });
  }

  async updateRecord(recordId: string, dto: UpsertDnsRecordDto) {
    await this.ensureRecordExists(recordId);
    await this.validateRecordLinks(dto);

    return await this.prisma.dnsRecord.update({
      where: { id: recordId },
      data: {
        type: dto.type,
        name: dto.name.trim(),
        value: dto.value.trim(),
        ttl: dto.ttl ?? 300,
        proxied: dto.proxied,
        serviceEnvId: dto.serviceEnvId?.trim() || null,
      },
    });
  }

  async removeRecord(recordId: string): Promise<void> {
    await this.ensureRecordExists(recordId);
    await this.prisma.dnsRecord.delete({ where: { id: recordId } });
  }

  private async validateProvider(providerId?: string): Promise<void> {
    if (!providerId?.trim()) {
      return;
    }

    const provider = await this.prisma.dnsProvider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider DNS introuvable');
    }
  }

  private async validateProject(projectId?: string): Promise<void> {
    if (!projectId?.trim()) {
      return;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }
  }

  private async validateRecordLinks(dto: UpsertDnsRecordDto): Promise<void> {
    if (dto.serviceEnvId?.trim()) {
      const se = await this.prisma.serviceEnvironment.findUnique({
        where: { id: dto.serviceEnvId },
        select: { id: true },
      });
      if (!se) {
        throw new NotFoundException(
          'ServiceEnvironment introuvable pour ce record DNS',
        );
      }
    }
  }

  private async ensureDomainExists(domainId: string): Promise<void> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true },
    });
    if (!domain) {
      throw new NotFoundException('Domaine introuvable');
    }
  }

  private async ensureRecordExists(recordId: string): Promise<void> {
    const record = await this.prisma.dnsRecord.findUnique({
      where: { id: recordId },
      select: { id: true },
    });
    if (!record) {
      throw new NotFoundException('Record DNS introuvable');
    }
  }
}
