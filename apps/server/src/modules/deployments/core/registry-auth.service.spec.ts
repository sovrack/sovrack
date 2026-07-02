import { BadRequestException } from '@nestjs/common';
import { RegistryProviderType } from '@prisma/client';
import { RegistryAuthService } from './registry-auth.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';

describe('RegistryAuthService.resolveAuthForImage', () => {
  function make(registries: Array<Record<string, unknown>>) {
    const prisma = {
      registryConfig: { findMany: jest.fn().mockResolvedValue(registries) },
    } as unknown as PrismaService;
    const crypto = {
      decryptSafe: (v: string) => `dec(${v})`,
    } as unknown as CryptoService;
    return new RegistryAuthService(prisma, crypto);
  }

  it('matches a GitLab registry by image host', async () => {
    const svc = make([
      {
        type: RegistryProviderType.GITLAB,
        username: 'u',
        password: 'p',
        registryUrl: 'https://registry.gitlab.com',
        isDefault: true,
      },
    ]);
    const auth = await svc.resolveAuthForImage(
      'registry.gitlab.com/grp/app:latest',
    );
    expect(auth).toEqual({
      username: 'u',
      password: 'dec(p)',
      serveraddress: 'registry.gitlab.com',
    });
  });

  it('falls back to Docker Hub for an image without a host', async () => {
    const svc = make([
      {
        type: RegistryProviderType.DOCKER_HUB,
        username: 'me',
        password: 'pw',
        registryUrl: '',
        isDefault: true,
      },
    ]);
    const auth = await svc.resolveAuthForImage('me/private-app:1.2');
    expect(auth?.username).toBe('me');
    expect(auth?.serveraddress).toContain('index.docker.io');
  });

  it('returns undefined when no registry matches the host', async () => {
    const svc = make([
      {
        type: RegistryProviderType.GITLAB,
        username: 'u',
        password: 'p',
        registryUrl: 'https://registry.gitlab.com',
        isDefault: true,
      },
    ]);
    const auth = await svc.resolveAuthForImage('ghcr.io/org/app:latest');
    expect(auth).toBeUndefined();
  });

  it('returns undefined when no registries are configured (public pull)', async () => {
    const svc = make([]);
    expect(await svc.resolveAuthForImage('nginx:alpine')).toBeUndefined();
  });

  // AUDIT_VALIDATION_DEPLOIEMENT.md Point 7 : un RegistryConfig connu pour cet
  // host mais aux identifiants incomplets ne doit plus retomber silencieusement
  // sur un pull anonyme (qui échouerait plus tard avec un message Docker brut) —
  // c'est une configuration cassée, pas une image publique ambiguë.
  it('throws when a matching registry has incomplete credentials', async () => {
    const svc = make([
      {
        name: 'custom-registry',
        type: RegistryProviderType.GITLAB,
        username: null,
        password: null,
        registryUrl: 'https://registry.gitlab.com',
        isDefault: true,
      },
    ]);
    await expect(
      svc.resolveAuthForImage('registry.gitlab.com/grp/app:latest'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
