import { BadRequestException } from '@nestjs/common';
import { BuildPack, GitProviderType, ServiceType } from '@prisma/client';

type ServiceContractInput = {
  type?: ServiceType;
  buildPack?: BuildPack;
  dockerComposeContent?: string | null;
  composeServiceName?: string | null;
  source?: { provider?: GitProviderType };
};

const V1_SERVICE_TYPES = new Set<ServiceType>([
  ServiceType.APPLICATION,
  ServiceType.DATABASE,
]);
const V1_GIT_PROVIDERS = new Set<GitProviderType>([
  GitProviderType.GITLAB,
  GitProviderType.GITHUB,
]);

export function assertV1ServiceContract(input: ServiceContractInput): void {
  if (input.type !== undefined && !V1_SERVICE_TYPES.has(input.type)) {
    throw new BadRequestException(
      `Le type de service ${input.type} n'est pas disponible dans la V1`,
    );
  }
  if (
    input.buildPack === BuildPack.DOCKER_COMPOSE ||
    input.dockerComposeContent !== undefined ||
    input.composeServiceName !== undefined
  ) {
    throw new BadRequestException(
      'Les services Docker Compose ne sont pas disponibles dans la V1',
    );
  }
  if (
    input.source?.provider !== undefined &&
    !V1_GIT_PROVIDERS.has(input.source.provider)
  ) {
    throw new BadRequestException(
      `Le fournisseur Git ${input.source.provider} n'est pas disponible dans la V1`,
    );
  }
}
