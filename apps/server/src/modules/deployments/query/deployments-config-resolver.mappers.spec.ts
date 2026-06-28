import { BuildPack } from '@prisma/client';
import { DeploymentsConfigResolver } from './deployments-config-resolver.service';
import { BuildImageService } from '../../build/lifecycle/build-image.service';
import type { BuildSource } from '../../build/strategies/build-strategy.interface';

describe('DeploymentsConfigResolver — pure mappers', () => {
  let resolver: DeploymentsConfigResolver;

  beforeEach(() => {
    resolver = new DeploymentsConfigResolver(
      {} as unknown as BuildImageService,
    );
  });

  it('classifies local vs registry build sources', () => {
    const local: BuildSource[] = [
      'DOCKERFILE_LOCAL',
      'NIXPACKS_LOCAL',
      'STATIC',
      'DOCKER_COMPOSE',
    ];
    const remote: BuildSource[] = [
      'DOCKERFILE_REGISTRY',
      'NIXPACKS_REGISTRY',
      'EXTERNAL_IMAGE',
    ];
    for (const s of local) expect(resolver.isLocalBuildSource(s)).toBe(true);
    for (const s of remote) expect(resolver.isLocalBuildSource(s)).toBe(false);
  });

  it('maps each build source to the right build pack', () => {
    const cases: Array<[BuildSource, BuildPack]> = [
      ['DOCKERFILE_LOCAL', BuildPack.DOCKERFILE],
      ['DOCKERFILE_REGISTRY', BuildPack.DOCKERFILE],
      ['NIXPACKS_LOCAL', BuildPack.NIXPACKS],
      ['NIXPACKS_REGISTRY', BuildPack.NIXPACKS],
      ['DOCKER_COMPOSE', BuildPack.DOCKER_COMPOSE],
      ['STATIC', BuildPack.STATIC],
      ['EXTERNAL_IMAGE', BuildPack.NONE],
    ];
    for (const [src, pack] of cases) {
      expect(resolver.buildSourceToBuildPack(src)).toBe(pack);
    }
  });

  it('resolves managed database images, ports and volumes', () => {
    expect(
      resolver.getDatabaseImage({
        databaseType: 'POSTGRES',
        databaseVersion: '16',
      }),
    ).toEqual({
      image: 'postgres:16-alpine',
      port: 5432,
      volumes: [{ containerPath: '/var/lib/postgresql/data' }],
    });
    expect(resolver.getDatabaseImage({ databaseType: 'REDIS' }).port).toBe(
      6379,
    );
    expect(resolver.getDatabaseImage({ databaseType: 'MONGODB' }).image).toBe(
      'mongo:latest',
    );
    expect(
      resolver.getDatabaseImage({ databaseType: 'MYSQL', databaseVersion: '8' })
        .image,
    ).toBe('mysql:8-oracle');
    expect(resolver.getDatabaseImage({ databaseType: 'RABBITMQ' }).port).toBe(
      5672,
    );
  });
});
