import { GitProviderType } from '@prisma/client';

export type CiGenerateOptions = {
  registryUrl?: string;
  projectType?: string;
  branches?: string[];
  /** Registry image path, e.g. registry.gitlab.com/group/project */
  imageRepository?: string;
};

/**
 * Common contract for CI/CD pipeline file generators.
 * Each provider implements this to produce its native CI config file.
 *
 * GitLab → .gitlab-ci.yml
 * GitHub → .github/workflows/build.yml
 */
export interface ICiGenerator {
  /** The provider this generator targets. */
  readonly provider: GitProviderType;

  /** Generate the CI config file content as a string. */
  generate(options: CiGenerateOptions): string;

  /**
   * The file path relative to the repo root where this config must be placed.
   * e.g. '.gitlab-ci.yml' or '.github/workflows/build.yml'
   */
  getFilePath(): string;
}
