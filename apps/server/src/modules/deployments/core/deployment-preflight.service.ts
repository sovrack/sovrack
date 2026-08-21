import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BuildPack,
  CircuitState,
  ServerStatus,
  ServiceType,
} from '@prisma/client';
import * as yaml from 'js-yaml';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { DockerConnectionsService } from '../../../adapters/container-runtime/docker-connections.service';
import { serverHasDocker } from '../../../adapters/server-capabilities/server-capabilities.util';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { DeploymentsConfigResolver } from '../query/deployments-config-resolver.service';
import { RegistryAuthService } from './registry-auth.service';
import { ContainerLifecycleService } from './container-lifecycle.service';
import type { CreateDeploymentDto } from '../dto/create-deployment.dto';
import { EnvLevel, resolveEnvDetailed } from '../utils/env-resolver.util';
import { checkRepoCloneable } from '../utils/repo-cloneable.util';
import { BLUE_GREEN_PORT_OFFSET } from '../utils/blue-green.constants';
import { buildContainerPrefix } from '../../../shared/utils/container-spec.util';
import { parseDbCredentials } from '../../../shared/utils/database-spec.util';

export type PreflightInput = {
  serviceEnvId: string;
  branch?: string;
  overrideImage?: string;
  strategy?: 'standard' | 'blue-green';
};

const DEPLOYABLE_SERVER_STATUSES: ServerStatus[] = [
  ServerStatus.PREPARED,
  ServerStatus.PARTIALLY_PREPARED,
];

const SECRETS_LEVEL_LABELS: Record<string, string> = {
  service: 'du service',
  environment: "de l'environnement",
  serviceEnvironment: 'du couple service-environnement',
};

/**
 * Garde unique de pré-vol, appelée AVANT la création de toute ligne
 * `Deployment` — par le chemin API (`DeploymentsCreateService`), le chemin
 * webhook (`DeploymentsAutoTriggerService`), et le endpoint informatif
 * `/deployments/validate` (`DeploymentsValidationService`).
 *
 * Centralise ce qui, avant ce sprint, n'existait que dans l'endpoint
 * optionnel `/validate` (jamais appelé par la création réelle) ou
 * uniquement à l'exécution dans les exécuteurs Docker (donc trop tard —
 * voir AUDIT_VALIDATION_DEPLOIEMENT.md). Les vérifications déjà présentes
 * dans les exécuteurs restent en place (défense en profondeur) : ce service
 * ajoute une garde en amont, il ne remplace pas les gardes en aval.
 *
 * Lève dès le premier échec rencontré (ordre : coût croissant — état DB
 * d'abord, appels réseau au provider Git en dernier).
 */
@Injectable()
export class DeploymentPreflightService {
  private readonly logger = new Logger(DeploymentPreflightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configResolver: DeploymentsConfigResolver,
    private readonly gitProvidersService: SourceProvidersService,
    private readonly dockerConnections: DockerConnectionsService,
    private readonly crypto: CryptoService,
    private readonly registryAuth: RegistryAuthService,
    private readonly containerLifecycle: ContainerLifecycleService,
  ) {}

  async assertDeployable(input: PreflightInput): Promise<void> {
    // 1) Résolution de base.
    const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
      where: { id: input.serviceEnvId },
      include: {
        service: true,
        server: true,
        environment: { include: { servers: true, project: true } },
      },
    });
    if (!serviceEnv || serviceEnv.archivedAt) {
      throw new NotFoundException(
        `Lien service-environnement introuvable ou archivé (${input.serviceEnvId}).`,
      );
    }
    const { service, environment } = serviceEnv;
    const project = environment.project;

    // 2) Serveur cible réellement déployable.
    const server = serviceEnv.server ?? environment.servers[0] ?? null;
    if (!server) {
      throw new BadRequestException(
        `Aucun serveur n'est rattaché à l'environnement « ${environment.name} ». Liez un serveur dans Projet → Environments.`,
      );
    }

    // 2b/3) État serveur + circuit breaker Docker — voir assertServerReady
    // (extrait, réutilisé aussi par DeploymentsRollbackService/ReconcilerService
    // pour les redéploiements d'une image déjà connue).
    await this.assertServerReady(server.id);

    // Les services DATABASE n'ont ni build ni dépôt Git — seuls les champs
    // base de données et les secrets s'appliquent (même raccourci que
    // l'ancien DeploymentsValidationService.validate()).
    if (service.type === ServiceType.DATABASE) {
      if (!service.databaseType) {
        throw new BadRequestException(
          'databaseType est requis pour un service DATABASE',
        );
      }
      if (service.databaseCredentials) {
        const creds = parseDbCredentials(
          service.databaseCredentials,
          this.crypto,
        );
        if (!creds.user || !creds.password || !creds.dbName) {
          throw new BadRequestException(
            'databaseCredentials doit contenir user, password et dbName',
          );
        }
      }
      this.assertSecretsJsonValid(service, environment, serviceEnv);

      // 9) Port cible disponible. Task 4 : un service DATABASE ne publie un
      // port hôte QUE si l'utilisateur a défini externalPort (UI "External
      // Credentials") — sinon la base reste interne au réseau projet (aucun
      // -p, joignable seulement par alias Docker). Pas de Traefik/blue-green
      // pour une base (resolveTraefikConfig exclut DATABASE, jamais de
      // blue-green DB) → le port publié est exactement externalPort. Sans
      // externalPort, rien n'est publié → aucun conflit possible à vérifier.
      if (service.externalPort != null) {
        await this.assertPortAvailable(
          server.id,
          buildContainerPrefix(project.name, service.name),
          service.externalPort,
        );
      }
      return;
    }

    // 4) Type de build déterminé sans ambiguïté.
    const config = await this.configResolver.resolve(
      {
        overrideImage: input.overrideImage,
        branch: input.branch,
      } as CreateDeploymentDto,
      service,
      project,
    );
    const hasExternalImage =
      !!input.overrideImage ||
      (service.sourceType === 'DOCKER_IMAGE' && !!service.repoPath);
    if (service.buildPack === BuildPack.NONE && !hasExternalImage) {
      throw new BadRequestException(
        "Le type de build n'est pas configuré pour ce service. Choisissez un type dans l'onglet Général avant de déployer.",
      );
    }

    // 5) Cohérence contenu/type.
    if (
      config.buildSource === 'DOCKERFILE_LOCAL' ||
      config.buildSource === 'DOCKERFILE_REGISTRY'
    ) {
      await this.assertDockerfileExists(project.id, service.id, config.branch);
    }
    if (config.buildSource === 'DOCKER_COMPOSE') {
      this.assertComposeContentValid(service.dockerComposeContent);
    }

    // 6) Accessibilité du dépôt ET de la branche précise (builds locaux
    // uniquement — le mode registre n'a pas besoin de cloner sur le VPS).
    if (config.isLocalBuild) {
      await checkRepoCloneable(
        this.gitProvidersService,
        this.logger,
        project.id,
        service.id,
        config.branch,
      );
    }

    // 7) Format JSON des secrets aux 3 niveaux.
    this.assertSecretsJsonValid(service, environment, serviceEnv);

    // 8) Registre privé configuré si nécessaire (uniquement quand une image
    // sera réellement pullée — pas pour un build local, packagé sur le VPS).
    if (!config.isLocalBuild) {
      await this.registryAuth.resolveAuthForImage(config.dockerImage);
    }

    // 9) Port cible disponible sur le serveur.
    // Un port hôte n'est réellement publié QUE quand le trafic n'est PAS
    // routé par Traefik (voir DockerDeployExecutorService : useTraefik=true →
    // aucun -p sur le conteneur, tout passe par le réseau Docker interne +
    // le reverse-proxy) et que le service n'est ni WORKER ni CRON (ces types
    // ne servent jamais de trafic entrant). Dans tous les autres cas
    // (APPLICATION/service sans domaine, avec ou sans blue-green), un port
    // hôte fixe (ou décalé de BLUE_GREEN_PORT_OFFSET) est bindé — c'est ce
    // cas précis que ce point vérifie.
    if (service.type !== 'WORKER' && service.type !== 'CRON') {
      const useTraefik = await this.wouldUseTraefik(
        serviceEnv.id,
        project.id,
        service.name,
        environment.name,
        server.host,
      );
      if (!useTraefik) {
        // NB: comme DockerDeployExecutorService.resolveRuntimeConfig (pour un
        // déploiement frais, non-rollback), seul Service.port est consulté —
        // le override ServiceEnvironment.port n'est PAS pris en compte par
        // l'exécuteur pour un déploiement standard (uniquement restauré
        // depuis specSnapshot lors d'un rollback/auto-heal). Prédire un port
        // différent ici donnerait un faux résultat ; on reproduit donc
        // fidèlement ce comportement (potentiellement surprenant mais réel)
        // plutôt que de le "corriger" silencieusement dans le pré-vol.
        const servicePort = service.port ?? 3000;
        const blueGreen = input.strategy === 'blue-green';
        const publishPort = blueGreen
          ? servicePort + BLUE_GREEN_PORT_OFFSET
          : servicePort;
        await this.assertPortAvailable(
          server.id,
          buildContainerPrefix(project.name, service.name),
          publishPort,
        );
      }
    }
  }

  /**
   * Garde minimale de disponibilité serveur — sous-ensemble réutilisable
   * d'assertDeployable, couvrant UNIQUEMENT ce qui reste pertinent quel que
   * soit le contexte (redéployer une image déjà connue/déjà construite) :
   * état serveur (actif/vérifié/statut/Docker installé) + circuit breaker
   * Docker. N'impose PAS les checks complets du pré-vol (Dockerfile, JSON
   * des secrets, etc.) — sans objet pour un rollback ou un auto-heal, qui ne
   * font que relancer une image déjà validée par un déploiement antérieur.
   *
   * Utilisé par assertDeployable ci-dessus, et directement par
   * DeploymentsRollbackService (avant de relancer une image déjà connue) et
   * ReconcilerService (avant un auto-heal).
   */
  async assertServerReady(serverId: string): Promise<void> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(`Serveur introuvable (${serverId}).`);
    }
    if (!server.isActive) {
      throw new BadRequestException(
        `Le serveur « ${server.name} » est désactivé. Réactivez-le avant de déployer.`,
      );
    }
    if (!server.isVerified) {
      throw new BadRequestException(
        `Le serveur « ${server.name} » n'est pas vérifié (connexion SSH non confirmée).`,
      );
    }
    if (!DEPLOYABLE_SERVER_STATUSES.includes(server.status)) {
      throw new BadRequestException(
        `Le serveur « ${server.name} » n'est pas prêt (statut actuel : ${server.status}). Terminez son setup avant de déployer.`,
      );
    }
    if (!serverHasDocker(server)) {
      throw new BadRequestException(
        `Docker n'est pas installé sur le serveur « ${server.name} ». Relancez son setup (Setup Server).`,
      );
    }

    // Circuit breaker Docker — lecture seule (pas d'ouverture de connexion).
    let dockerConnection;
    try {
      dockerConnection = await this.dockerConnections.findForServer(server.id);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new BadRequestException(
          `Aucune connexion Docker configurée pour le serveur « ${server.name} ». Relancez son setup (Setup Server).`,
        );
      }
      throw err;
    }
    if (dockerConnection.circuitState === CircuitState.OPEN) {
      throw new ServiceUnavailableException(
        `Le serveur Docker « ${server.name} » est actuellement injoignable (circuit ouvert), réessayez dans quelques minutes.`,
      );
    }
  }

  /**
   * Prédit si ce déploiement sera routé par Traefik (donc SANS port hôte
   * publié), sans jamais écrire — contrairement à
   * TraefikRouteService.resolveAutoSubdomain(), qui persiste un Domain en
   * base au passage. Un pré-vol doit rester un pur contrôle en lecture ; le
   * calcul est dupliqué ici volontairement (mêmes 2 clés PlatformConfig,
   * même règle) plutôt que d'appeler le service réel et risquer de créer un
   * sous-domaine juste en validant si un déploiement SERAIT possible.
   */
  private async wouldUseTraefik(
    serviceEnvId: string,
    projectId: string,
    serviceName: string,
    envName: string,
    serverHost: string,
  ): Promise<boolean> {
    const existingDomain = await this.prisma.domain.findFirst({
      where: { serviceEnvId },
      select: { id: true },
    });
    if (existingDomain) return true;

    const [baseRow, autoFlagRow] = await Promise.all([
      this.prisma.platformConfig.findUnique({
        where: { key: 'PLATFORM_BASE_DOMAIN' },
      }),
      this.prisma.platformConfig.findUnique({
        where: { key: 'PLATFORM_AUTO_SUBDOMAIN' },
      }),
    ]);
    const base = baseRow?.value?.trim() || null;
    const autoFlag = autoFlagRow?.value?.trim() || null;

    if (base) return true;
    if (
      serverHost &&
      /^\d+\.\d+\.\d+\.\d+$/.test(serverHost) &&
      ['true', '1', 'nip.io', 'yes'].includes((autoFlag ?? '').toLowerCase())
    ) {
      return true;
    }
    return false;
  }

  private async assertPortAvailable(
    serverId: string,
    containerPrefix: string,
    publishPort: number,
  ): Promise<void> {
    await this.containerLifecycle.assertNoForeignPortConflict(
      serverId,
      containerPrefix,
      publishPort,
      true,
    );
  }

  private async assertDockerfileExists(
    projectId: string,
    serviceId: string,
    branch: string,
  ): Promise<void> {
    const provider = await this.gitProvidersService.forService(serviceId);
    // serviceId obligatoire ici : sans lui, un projet multi-dépôts vérifie le
    // Dockerfile d'un dépôt ARBITRAIRE (voir resolveRepositoryContext).
    let content = await provider.readFile(
      projectId,
      'Dockerfile',
      branch,
      serviceId,
    );
    if (content === null) {
      content = await provider.readFile(
        projectId,
        'dockerfile',
        branch,
        serviceId,
      );
    }
    if (content === null) {
      throw new BadRequestException(
        `Aucun Dockerfile trouvé sur la branche « ${branch} ». Générez-en un depuis l'onglet Build avant de déployer.`,
      );
    }
  }

  private assertComposeContentValid(content: string | null | undefined): void {
    if (!content || !content.trim()) {
      throw new BadRequestException(
        "Le service n'a pas de contenu docker-compose. Renseignez le champ « Docker Compose » du service.",
      );
    }
    try {
      yaml.load(content);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'erreur de parsing YAML';
      throw new BadRequestException(
        `Le contenu docker-compose n'est pas un YAML valide : ${reason}`,
      );
    }
  }

  private assertSecretsJsonValid(
    service: { secretsEnv: string | null },
    environment: { secretsEnv: string | null },
    serviceEnv: { secretsEnv: string | null },
  ): void {
    // env: null volontaire — on ne valide que secretsEnv ici (Point 6 de
    // l'audit) ; les valeurs sont chiffrées au repos, à déchiffrer avant
    // parsing (même règle que DeploymentEnvService.buildEnvLevels).
    const levels: EnvLevel[] = [
      {
        levelName: 'service',
        env: null,
        secretsEnv: this.crypto.decryptSafe(service.secretsEnv),
      },
      {
        levelName: 'environment',
        env: null,
        secretsEnv: this.crypto.decryptSafe(environment.secretsEnv),
      },
      {
        levelName: 'serviceEnvironment',
        env: null,
        secretsEnv: this.crypto.decryptSafe(serviceEnv.secretsEnv),
      },
    ];
    const { warnings } = resolveEnvDetailed(levels);
    if (warnings.length > 0) {
      const [firstWarning] = warnings;
      const level = firstWarning.split('.')[0];
      throw new BadRequestException(
        `Les variables secrètes ${SECRETS_LEVEL_LABELS[level] ?? ''} sont dans un format invalide (JSON malformé) : ${firstWarning}`,
      );
    }
  }
}
