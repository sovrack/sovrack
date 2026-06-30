import { resolveBuildSource } from './build-source.util';

describe('resolveBuildSource', () => {
  it('returns EXTERNAL_IMAGE for DOCKER_IMAGE sourceType regardless of buildPack', () => {
    expect(
      resolveBuildSource({
        buildPack: 'DOCKERFILE',
        buildMode: 'LOCAL',
        sourceType: 'DOCKER_IMAGE',
      }),
    ).toBe('EXTERNAL_IMAGE');
    expect(
      resolveBuildSource({
        buildPack: 'NIXPACKS',
        buildMode: 'REGISTRY',
        sourceType: 'DOCKER_IMAGE',
      }),
    ).toBe('EXTERNAL_IMAGE');
  });

  it('returns NIXPACKS_LOCAL for NIXPACKS + LOCAL', () => {
    expect(
      resolveBuildSource({
        buildPack: 'NIXPACKS',
        buildMode: 'LOCAL',
        sourceType: 'GIT',
      }),
    ).toBe('NIXPACKS_LOCAL');
  });

  it('returns NIXPACKS_REGISTRY for NIXPACKS + REGISTRY', () => {
    expect(
      resolveBuildSource({
        buildPack: 'NIXPACKS',
        buildMode: 'REGISTRY',
        sourceType: 'GIT',
      }),
    ).toBe('NIXPACKS_REGISTRY');
  });

  it('returns STATIC for STATIC buildPack', () => {
    expect(
      resolveBuildSource({
        buildPack: 'STATIC',
        buildMode: 'LOCAL',
        sourceType: 'GIT',
      }),
    ).toBe('STATIC');
  });

  it('returns DOCKER_COMPOSE for DOCKER_COMPOSE buildPack', () => {
    expect(
      resolveBuildSource({
        buildPack: 'DOCKER_COMPOSE',
        buildMode: 'LOCAL',
        sourceType: 'GIT',
      }),
    ).toBe('DOCKER_COMPOSE');
  });

  it('returns EXTERNAL_IMAGE for NONE buildPack', () => {
    expect(
      resolveBuildSource({
        buildPack: 'NONE',
        buildMode: 'LOCAL',
        sourceType: 'GIT',
      }),
    ).toBe('EXTERNAL_IMAGE');
  });

  it('returns DOCKERFILE_LOCAL for Dockerfile + LOCAL', () => {
    expect(
      resolveBuildSource({
        buildPack: 'DOCKERFILE',
        buildMode: 'LOCAL',
        sourceType: 'GIT',
      }),
    ).toBe('DOCKERFILE_LOCAL');
    expect(
      resolveBuildSource({
        buildPack: null,
        buildMode: 'LOCAL',
        sourceType: 'GIT',
      }),
    ).toBe('DOCKERFILE_LOCAL');
  });

  it('returns DOCKERFILE_REGISTRY for Dockerfile + REGISTRY', () => {
    expect(
      resolveBuildSource({
        buildPack: 'DOCKERFILE',
        buildMode: 'REGISTRY',
        sourceType: 'GIT',
      }),
    ).toBe('DOCKERFILE_REGISTRY');
  });

  it('handles null sourceType as GIT (default)', () => {
    expect(
      resolveBuildSource({
        buildPack: 'NIXPACKS',
        buildMode: 'LOCAL',
        sourceType: null,
      }),
    ).toBe('NIXPACKS_LOCAL');
  });
});
