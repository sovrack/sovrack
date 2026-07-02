import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RegistryProviderType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';

export type DockerPullAuth = {
  username: string;
  password: string;
  serveraddress?: string;
};

/**
 * Résout les identifiants de registre à utiliser pour `docker pull <image>`.
 * Sans ça, une image PRIVÉE (Docker Hub privé, registre GitLab, GHCR…) ne peut
 * pas être tirée. On associe le HOST de l'image au registre configuré
 * (RegistryConfig) et on déchiffre ses identifiants.
 */
@Injectable()
export class RegistryAuthService {
  private readonly logger = new Logger(RegistryAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async resolveAuthForImage(
    imageRef: string,
  ): Promise<DockerPullAuth | undefined> {
    const host = this.extractHost(imageRef); // null = Docker Hub
    const registries = await this.prisma.registryConfig.findMany();
    if (registries.length === 0) return undefined;

    let match = registries.find((r) =>
      this.matches(r.type, r.registryUrl, host),
    );
    // Repli : image sans host → Docker Hub par défaut.
    if (!match && !host) {
      match =
        registries.find(
          (r) => r.type === RegistryProviderType.DOCKER_HUB && r.isDefault,
        ) ?? registries.find((r) => r.type === RegistryProviderType.DOCKER_HUB);
    }
    // Aucun registre connu pour cet host : ambigu (image publique jamais
    // configurée, ou simplement pas encore répertoriée) — on ne peut pas
    // distinguer les deux, donc pas d'échec ici (comportement inchangé).
    if (!match) return undefined;

    const password = this.crypto.decryptSafe(match.password);
    if (!match.username || !password) {
      // Un RegistryConfig EXISTE pour cet host mais ses identifiants sont
      // incomplets : ce n'est plus ambigu — c'est une configuration connue
      // et cassée. Échouer clairement plutôt que de tenter un pull anonyme
      // qui échouerait plus tard côté démon Docker avec un message générique
      // (voir AUDIT_VALIDATION_DEPLOIEMENT.md, Point 7).
      throw new BadRequestException(
        `La configuration du registre « ${match.name} » (${host ?? 'docker.io'}) est incomplète (identifiants manquants). Complétez-la avant de déployer.`,
      );
    }
    this.logger.log(
      `Registry auth résolu pour ${imageRef} via registre ${match.type} (${host ?? 'docker.io'})`,
    );
    return {
      username: match.username,
      password,
      serveraddress: host ?? 'https://index.docker.io/v1/',
    };
  }

  /** Host de l'image (`registry.gitlab.com/grp/img:tag` → `registry.gitlab.com`) ou null pour Docker Hub. */
  private extractHost(imageRef: string): string | null {
    const first = imageRef.split('/')[0];
    const looksLikeHost =
      imageRef.includes('/') &&
      (first.includes('.') || first.includes(':') || first === 'localhost');
    return looksLikeHost ? first : null;
  }

  private hostOf(url: string | null | undefined): string | null {
    if (!url) return null;
    return (
      url
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .trim() || null
    );
  }

  private matches(
    type: RegistryProviderType,
    registryUrl: string | null,
    host: string | null,
  ): boolean {
    if (!host) return type === RegistryProviderType.DOCKER_HUB;
    const regHost = this.hostOf(registryUrl);
    if (regHost && host === regHost) return true;
    if (type === RegistryProviderType.GITLAB && host.includes('gitlab'))
      return true;
    if (type === RegistryProviderType.GCR && host.includes('gcr.io'))
      return true;
    if (type === RegistryProviderType.ECR && host.includes('amazonaws.com'))
      return true;
    return false;
  }
}
