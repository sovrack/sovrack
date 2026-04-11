import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Config, Role } from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

type ConfigPublic = Omit<Config, 'value'> & { value: string };

@Injectable()
export class ConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    projectId: string,
    dto: CreateConfigDto,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const isSecret = dto.isSecret ?? false;

    const config = await this.prisma.config.create({
      data: {
        projectId,
        key: dto.key,
        isSecret,
        value: isSecret ? this.encrypt(dto.value) : dto.value,
      },
    });

    return this.toPublic(config);
  }

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const configs = await this.prisma.config.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return configs.map((item) => this.toPublic(item));
  }

  async findOne(
    projectId: string,
    configId: string,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const config = await this.prisma.config.findFirst({
      where: {
        id: configId,
        projectId,
      },
    });

    if (!config) {
      throw new NotFoundException('Configuration non trouvée');
    }

    return this.toPublic(config);
  }

  async update(
    projectId: string,
    configId: string,
    dto: UpdateConfigDto,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const existing = await this.prisma.config.findFirst({
      where: {
        id: configId,
        projectId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Configuration non trouvée');
    }

    const nextIsSecret = dto.isSecret ?? existing.isSecret;
    const nextValue =
      dto.value === undefined
        ? existing.value
        : nextIsSecret
          ? this.encrypt(dto.value)
          : dto.value;

    const updated = await this.prisma.config.update({
      where: { id: configId },
      data: {
        key: dto.key,
        isSecret: nextIsSecret,
        value: nextValue,
      },
    });

    return this.toPublic(updated);
  }

  async remove(
    projectId: string,
    configId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const existing = await this.prisma.config.findFirst({
      where: {
        id: configId,
        projectId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Configuration non trouvée');
    }

    await this.prisma.config.delete({
      where: { id: configId },
    });
  }

  async getDecrypted(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<Record<string, string>> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const configs = await this.prisma.config.findMany({
      where: { projectId },
    });

    const result: Record<string, string> = {};
    for (const config of configs) {
      result[config.key] = config.isSecret
        ? this.decrypt(config.value)
        : config.value;
    }

    return result;
  }

  private toPublic(config: Config): ConfigPublic {
    return {
      ...config,
      value: config.isSecret ? '***' : config.value,
    };
  }

  private encrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.encrypt(value, secret).toString();
  }

  private decrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.decrypt(value, secret).toString(CryptoJS.enc.Utf8);
  }

  private async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole === Role.ADMIN) {
      return;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Accès non autorisé à ce projet');
    }
  }

  private async assertCanManageProject(
    projectId: string,
    _userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }
}
