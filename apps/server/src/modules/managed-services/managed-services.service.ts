import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ManagedServiceStatus, ManagedServiceType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateManagedServiceDto } from './dto/managed-service.dto';

type ServiceCredentials = {
  user: string;
  password: string;
  dbName: string;
};

const DEFAULT_PORTS: Record<ManagedServiceType, number> = {
  POSTGRES: 5432,
  MYSQL: 3306,
  REDIS: 6379,
  MONGODB: 27017,
  RABBITMQ: 5672,
};

@Injectable()
export class ManagedServicesService {
  private readonly logger = new Logger(ManagedServicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { projectId?: string; environmentId?: string; serverId?: string }) {
    return this.prisma.managedService.findMany({
      where: {
        ...(filters.projectId && { projectId: filters.projectId }),
        ...(filters.environmentId && { environmentId: filters.environmentId }),
        ...(filters.serverId && { serverId: filters.serverId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const svc = await this.prisma.managedService.findUnique({ where: { id } });
    if (!svc) throw new NotFoundException('Service managé introuvable');
    return svc;
  }

  async create(dto: CreateManagedServiceDto) {
    const credentials = this.generateCredentials(dto.name, dto.type);
    const port = dto.port ?? DEFAULT_PORTS[dto.type];
    const version = dto.version?.trim() || 'latest';

    const service = await this.prisma.managedService.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        version,
        port,
        credentials,
        projectId: dto.projectId,
        environmentId: dto.environmentId,
        serverId: dto.serverId,
        status: ManagedServiceStatus.STOPPED,
      },
    });

    this.logger.log(`ManagedService created: ${service.id} (${service.type})`);
    return service;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.managedService.delete({ where: { id } });
  }

  async updateStatus(id: string, status: ManagedServiceStatus) {
    await this.findOne(id);
    return this.prisma.managedService.update({ where: { id }, data: { status } });
  }

  getDockerImage(type: ManagedServiceType, version: string): string {
    const images: Record<ManagedServiceType, string> = {
      POSTGRES: `postgres:${version}`,
      MYSQL: `mysql:${version}`,
      REDIS: `redis:${version}-alpine`,
      MONGODB: `mongo:${version}`,
      RABBITMQ: `rabbitmq:${version}-management`,
    };
    return images[type];
  }

  private generateCredentials(name: string, type: ManagedServiceType): ServiceCredentials {
    const slug = name.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 16);
    const password = randomBytes(16).toString('hex');
    const redisTypes: ManagedServiceType[] = [ManagedServiceType.REDIS];
    if (redisTypes.includes(type)) {
      return { user: '', password, dbName: '' };
    }
    return {
      user: `${slug}_user`,
      password,
      dbName: `${slug}_db`,
    };
  }
}
