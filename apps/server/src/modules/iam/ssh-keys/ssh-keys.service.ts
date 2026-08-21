import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import type { CreateSshKeyDto } from './dto/create-ssh-key.dto';
import { WorkspaceAccessService } from '../authorization/workspace-access.service';
import { WorkspaceActions } from '../authorization/workspace-policy.types';

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
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async findAll(
    userId: string,
    requestedWorkspaceId?: string,
  ): Promise<SshKeyPublic[]> {
    const teamId = await this.resolveManageableWorkspace(
      userId,
      requestedWorkspaceId,
    );
    const keys = await this.prisma.sshKey.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => this.toPublic(k));
  }

  async create(
    userId: string,
    dto: CreateSshKeyDto,
    requestedWorkspaceId?: string,
  ): Promise<SshKeyPublic> {
    const teamId = await this.resolveManageableWorkspace(
      userId,
      requestedWorkspaceId,
    );
    const encrypted = this.crypto.encrypt(dto.privateKey);
    const key = await this.prisma.sshKey.create({
      data: {
        name: dto.name,
        encryptedPrivateKey: encrypted,
        publicKey: dto.publicKey,
        keyType: dto.keyType ?? 'ed25519',
        userId,
        teamId,
      },
    });
    return this.toPublic(key);
  }

  async remove(
    id: string,
    userId: string,
    requestedWorkspaceId?: string,
  ): Promise<void> {
    const teamId = await this.resolveManageableWorkspace(
      userId,
      requestedWorkspaceId,
    );
    const key = await this.prisma.sshKey.findFirst({ where: { id, teamId } });
    if (!key) throw new NotFoundException('SSH key not found');
    await this.prisma.sshKey.delete({ where: { id } });
  }

  private async resolveManageableWorkspace(
    userId: string,
    requestedWorkspaceId?: string,
  ): Promise<string> {
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      userId,
      WorkspaceActions.MANAGE_SERVER,
    );
    return workspaceId;
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
