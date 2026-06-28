import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CreateProxyRuleDto, UpdateProxyRuleDto } from './dto/proxy-rule.dto';

@Injectable()
export class ProxyService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { serverId?: string; serviceEnvId?: string }) {
    return this.prisma.proxyRule.findMany({
      where: {
        ...(filters.serverId && { serverId: filters.serverId }),
        ...(filters.serviceEnvId && { serviceEnvId: filters.serviceEnvId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.proxyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Règle proxy introuvable');
    return rule;
  }

  async create(dto: CreateProxyRuleDto) {
    const domain = dto.domain.trim().toLowerCase();
    // Link to the Domain row for this hostname when one exists and isn't already
    // bound to a rule (domainId is @unique → one ProxyRule per Domain). This is
    // what makes deleting a Domain cascade to its proxy rule (P5).
    const matchingDomain = await this.prisma.domain.findFirst({
      where: {
        name: domain,
        proxyRule: { is: null },
        ...(dto.serviceEnvId ? { serviceEnvId: dto.serviceEnvId } : {}),
      },
      select: { id: true },
    });
    try {
      return await this.prisma.proxyRule.create({
        data: {
          domain,
          domainId: matchingDomain?.id ?? null,
          targetPort: dto.targetPort,
          serverId: dto.serverId,
          sslEnabled: dto.sslEnabled ?? true,
          certType: dto.certType,
          serviceEnvId: dto.serviceEnvId ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Une règle proxy existe déjà pour le domaine ${dto.domain} sur ce serveur`,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProxyRuleDto) {
    await this.findOne(id);
    return this.prisma.proxyRule.update({
      where: { id },
      data: {
        ...(dto.targetPort !== undefined && { targetPort: dto.targetPort }),
        ...(dto.sslEnabled !== undefined && { sslEnabled: dto.sslEnabled }),
        ...(dto.certType !== undefined && { certType: dto.certType }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.proxyRule.delete({ where: { id } });
  }

  async toggleActive(id: string) {
    const rule = await this.findOne(id);
    return this.prisma.proxyRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
    });
  }
}
