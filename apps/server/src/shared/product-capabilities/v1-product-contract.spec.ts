import { BadRequestException } from '@nestjs/common';
import { BuildPack, GitProviderType, ServiceType } from '@prisma/client';
import { assertV1ServiceContract } from './v1-product-contract';

describe('assertV1ServiceContract', () => {
  it.each([ServiceType.APPLICATION, ServiceType.DATABASE])(
    'accepts V1 service type %s',
    (type) => {
      expect(() => assertV1ServiceContract({ type })).not.toThrow();
    },
  );

  it.each([ServiceType.MANAGED, ServiceType.WORKER, ServiceType.CRON])(
    'rejects planned service type %s',
    (type) => {
      expect(() => assertV1ServiceContract({ type })).toThrow(
        BadRequestException,
      );
    },
  );

  it('rejects every Docker Compose entry point', () => {
    expect(() =>
      assertV1ServiceContract({ buildPack: BuildPack.DOCKER_COMPOSE }),
    ).toThrow(BadRequestException);
    expect(() => assertV1ServiceContract({ dockerComposeContent: '' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      assertV1ServiceContract({ composeServiceName: 'api' }),
    ).toThrow(BadRequestException);
  });

  it('rejects Gitea while retaining GitLab and GitHub', () => {
    expect(() =>
      assertV1ServiceContract({
        source: { provider: GitProviderType.GITEA },
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertV1ServiceContract({
        source: { provider: GitProviderType.GITLAB },
      }),
    ).not.toThrow();
  });
});
