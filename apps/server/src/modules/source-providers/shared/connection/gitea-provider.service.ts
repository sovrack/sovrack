import { Injectable, NotFoundException } from '@nestjs/common';
import { GitProviderType, type GitProviderConfig } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import {
  normalizeOptional,
  requireNonEmpty,
  toGiteaProviderPublic,
  type GitlabProviderPublic,
} from './git-provider-config.util';
import { writeWithSingleDefault } from './provider-default-write.util';

type UpsertProviderInput = {
  name: string;
  providerUrl: string;
  internalUrl?: string;
  adminToken?: string;
  isDefault?: boolean;
};
type PatchProviderInput = Partial<UpsertProviderInput>;

/**
 * Gitea provider CRUD (PAT-based). Extracted from GitProviderConfigService
 * (R2 god-file split); the latter delegates the public Gitea methods here.
 */
@Injectable()
export class GiteaProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async list(): Promise<GitlabProviderPublic[]> {
    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { type: GitProviderType.GITEA },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => toGiteaProviderPublic(p));
  }

  async create(input: UpsertProviderInput): Promise<GitlabProviderPublic> {
    const name = requireNonEmpty(input.name, 'Name est requis');
    const giteaUrl = requireNonEmpty(input.providerUrl, 'Gitea URL est requis');

    const count = await this.prisma.gitProviderConfig.count({
      where: { type: GitProviderType.GITEA },
    });
    const shouldBeDefault = count === 0 ? true : input.isDefault === true;

    const provider = await writeWithSingleDefault(
      this.prisma,
      GitProviderType.GITEA,
      shouldBeDefault,
      (tx) =>
        tx.gitProviderConfig.create({
          data: {
            name,
            type: GitProviderType.GITEA,
            providerUrl: giteaUrl,
            internalUrl: normalizeOptional(input.internalUrl),
            adminToken: this.crypto.encryptOptional(input.adminToken),
            isDefault: shouldBeDefault,
          },
        }),
    );
    return toGiteaProviderPublic(provider);
  }

  async update(
    id: string,
    input: PatchProviderInput,
  ): Promise<GitlabProviderPublic> {
    const current = await this.getOrFail(id);
    const data: Partial<GitProviderConfig> = {};

    if (typeof input.name === 'string')
      data.name = requireNonEmpty(input.name, 'Name est requis');
    if (typeof input.providerUrl === 'string')
      data.providerUrl = requireNonEmpty(
        input.providerUrl,
        'Gitea URL est requis',
      );
    if (typeof input.internalUrl === 'string')
      data.internalUrl = normalizeOptional(input.internalUrl);
    if (typeof input.adminToken === 'string')
      data.adminToken = this.crypto.encryptOptional(input.adminToken);

    const makeDefault = input.isDefault === true && !current.isDefault;
    if (makeDefault) {
      data.isDefault = true;
    }

    const updated = await writeWithSingleDefault(
      this.prisma,
      GitProviderType.GITEA,
      makeDefault,
      (tx) => tx.gitProviderConfig.update({ where: { id }, data }),
    );
    return toGiteaProviderPublic(updated);
  }

  async remove(id: string): Promise<void> {
    await this.getOrFail(id);
    await this.prisma.gitProviderConfig.delete({ where: { id } });
  }

  async setDefault(id: string): Promise<GitlabProviderPublic> {
    await this.getOrFail(id);
    const updated = await writeWithSingleDefault(
      this.prisma,
      GitProviderType.GITEA,
      true,
      (tx) =>
        tx.gitProviderConfig.update({
          where: { id },
          data: { isDefault: true },
        }),
    );
    return toGiteaProviderPublic(updated);
  }

  private async getOrFail(id: string): Promise<GitProviderConfig> {
    const provider = await this.prisma.gitProviderConfig.findUnique({
      where: { id },
    });
    if (!provider || provider.type !== GitProviderType.GITEA) {
      throw new NotFoundException('Provider Gitea introuvable');
    }
    return provider;
  }
}
