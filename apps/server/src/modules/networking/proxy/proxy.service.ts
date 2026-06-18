import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
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
    try {
      return await this.prisma.proxyRule.create({
        data: {
          domain: dto.domain.trim().toLowerCase(),
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
