import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DnsProvider, DnsProviderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
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

  async listProviders(teamId: string) {
    const providers = await this.prisma.dnsProvider.findMany({
      where: { teamId, type: DnsProviderType.MANUAL },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return providers.map((provider) => this.toPublicProvider(provider));
  }

  async createProvider(dto: CreateDnsProviderDto, teamId: string) {
    if (dto.type !== DnsProviderType.MANUAL) {
      throw new BadRequestException(
        "L'automatisation DNS n'est pas disponible dans la V1. Utilisez le mode MANUAL.",
      );
    }
    if (dto.apiToken || dto.accountId || dto.zoneId) {
      throw new BadRequestException(
        "Le mode DNS manuel n'accepte pas de credentials fournisseur",
      );
    }
    const provider = await this.prisma.dnsProvider.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        apiToken: dto.apiToken?.trim()
          ? this.crypto.encrypt(dto.apiToken.trim())
          : undefined,
        accountId: dto.accountId?.trim() || undefined,
        zoneId: dto.zoneId?.trim() || undefined,
        teamId,
      },
    });
    return this.toPublicProvider(provider);
  }

  async testProvider(providerId: string, teamId: string) {
    const provider = await this.prisma.dnsProvider.findFirst({
      where: { id: providerId, teamId },
    });

    if (!provider) {
      throw new NotFoundException('Provider DNS introuvable');
    }

    if (provider.type === DnsProviderType.MANUAL) {
      return {
        ok: true,
        status: 'MANUAL',
        message:
          'Provider MANUAL prêt: Sovrack affichera les records à créer manuellement.',
      };
    }
    throw new BadRequestException(
      "L'automatisation DNS n'est pas disponible dans la V1",
    );
  }

  private toPublicProvider(provider: DnsProvider) {
    return {
      ...provider,
      apiToken: provider.apiToken ? '***' : null,
      apiTokenConfigured: Boolean(provider.apiToken),
    };
  }

  // ── Domains ────────────────────────────────────────────────────────────

  async listDomains(teamId: string, projectId?: string, serviceEnvId?: string) {
    return await this.prisma.domain.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(serviceEnvId ? { serviceEnvId } : {}),
        project: { teamId },
      },
      orderBy: { name: 'asc' },
      include: domainInclude,
    });
  }

  async createDomain(dto: CreateDomainDto, teamId: string) {
    await this.validateProvider(dto.providerId, teamId);
    let projectId = dto.projectId?.trim() || undefined;
    if (!projectId && dto.serviceEnvId?.trim()) {
      const serviceEnvironment = await this.prisma.serviceEnvironment.findFirst(
        {
          where: {
            id: dto.serviceEnvId.trim(),
            service: { project: { teamId } },
          },
          select: { service: { select: { projectId: true } } },
        },
      );
      projectId = serviceEnvironment?.service.projectId;
    }
    if (!projectId) {
      throw new BadRequestException(
        'Un domaine doit appartenir à un projet du workspace',
      );
    }
    await this.validateProject(projectId, teamId);

    return await this.prisma.domain.create({
      data: {
        name: dto.name.trim().toLowerCase(),
        providerId: dto.providerId?.trim() || undefined,
        projectId,
        serviceEnvId: dto.serviceEnvId?.trim() || undefined,
      },
      include: domainInclude,
    });
  }

  async removeDomain(domainId: string, teamId: string): Promise<void> {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, project: { teamId } },
    });
    if (!domain) throw new NotFoundException('Domaine introuvable');
    await this.prisma.domain.delete({ where: { id: domainId } });
  }

  async verifyDomain(domainId: string, teamId: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, project: { teamId } },
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

  async listRecords(domainId: string, teamId: string) {
    await this.ensureDomainExists(domainId, teamId);
    return await this.prisma.dnsRecord.findMany({
      where: { domainId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRecord(
    domainId: string,
    dto: UpsertDnsRecordDto,
    teamId: string,
  ) {
    await this.ensureDomainExists(domainId, teamId);
    await this.validateRecordLinks(dto, teamId);

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

  async updateRecord(
    recordId: string,
    dto: UpsertDnsRecordDto,
    teamId: string,
  ) {
    await this.ensureRecordExists(recordId, teamId);
    await this.validateRecordLinks(dto, teamId);

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

  async removeRecord(recordId: string, teamId: string): Promise<void> {
    await this.ensureRecordExists(recordId, teamId);
    await this.prisma.dnsRecord.delete({ where: { id: recordId } });
  }

  private async validateProvider(
    providerId: string | undefined,
    teamId: string,
  ): Promise<void> {
    if (!providerId?.trim()) {
      return;
    }

    const provider = await this.prisma.dnsProvider.findFirst({
      where: { id: providerId, teamId },
      select: { id: true, type: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider DNS introuvable');
    }
    if (provider.type !== DnsProviderType.MANUAL) {
      throw new BadRequestException(
        "L'automatisation DNS n'est pas disponible dans la V1",
      );
    }
  }

  private async validateProject(
    projectId: string | undefined,
    teamId: string,
  ): Promise<void> {
    if (!projectId?.trim()) {
      return;
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }
  }

  private async validateRecordLinks(
    dto: UpsertDnsRecordDto,
    teamId: string,
  ): Promise<void> {
    if (dto.serviceEnvId?.trim()) {
      const se = await this.prisma.serviceEnvironment.findFirst({
        where: {
          id: dto.serviceEnvId,
          service: { project: { teamId } },
        },
        select: { id: true },
      });
      if (!se) {
        throw new NotFoundException(
          'ServiceEnvironment introuvable pour ce record DNS',
        );
      }
    }
  }

  private async ensureDomainExists(
    domainId: string,
    teamId: string,
  ): Promise<void> {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, project: { teamId } },
      select: { id: true },
    });
    if (!domain) {
      throw new NotFoundException('Domaine introuvable');
    }
  }

  private async ensureRecordExists(
    recordId: string,
    teamId: string,
  ): Promise<void> {
    const record = await this.prisma.dnsRecord.findFirst({
      where: { id: recordId, domain: { project: { teamId } } },
      select: { id: true },
    });
    if (!record) {
      throw new NotFoundException('Record DNS introuvable');
    }
  }
}
