import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { ServersCryptoService } from '../../servers/services';
import type { CreateSshKeyDto } from './dto/create-ssh-key.dto';

export type SshKeyPublic = {
  id: string;
  name: string;
  publicKey: string;
  keyType: string;
  createdAt: Date;
};

@Injectable()
export class SshKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
  ) {}

  async findAll(userId: string): Promise<SshKeyPublic[]> {
    const keys = await this.prisma.sshKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => this.toPublic(k));
  }

  async create(userId: string, dto: CreateSshKeyDto): Promise<SshKeyPublic> {
    const encrypted = this.crypto.encrypt(dto.privateKey);
    const key = await this.prisma.sshKey.create({
      data: {
        name: dto.name,
        encryptedPrivateKey: encrypted,
        publicKey: dto.publicKey,
        keyType: dto.keyType ?? 'ed25519',
        userId,
      },
    });
    return this.toPublic(key);
  }

  async remove(id: string, userId: string): Promise<void> {
    const key = await this.prisma.sshKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('SSH key not found');
    if (key.userId !== userId) throw new ForbiddenException();
    await this.prisma.sshKey.delete({ where: { id } });
  }

  private toPublic(key: {
    id: string;
    name: string;
    publicKey: string;
    keyType: string;
    createdAt: Date;
  }): SshKeyPublic {
    return {
      id: key.id,
      name: key.name,
      publicKey: key.publicKey,
      keyType: key.keyType,
      createdAt: key.createdAt,
    };
  }
}
