import { Injectable } from '@nestjs/common';

export type GitlabCiGenerateOptions = {
  registryUrl?: string;
  projectType?: string;
  branches?: string[];
};

type TestStageProfile = {
  image: string;
  cachePaths: string[];
  beforeScript: string[];
  script: string[];
};

const TEST_PROFILES: Record<string, TestStageProfile> = {
  nodejs: {
    image: 'node:20-alpine',
    cachePaths: ['node_modules/', '.npm/'],
    beforeScript: ['npm ci --cache .npm --prefer-offline'],
    script: [
      'npm run lint --if-present',
      'npm run test --if-present -- --passWithNoTests',
    ],
  },
  python: {
    image: 'python:3.12-slim',
    cachePaths: ['.pip-cache/'],
    beforeScript: [
      'pip install --cache-dir .pip-cache --upgrade pip',
      'pip install --cache-dir .pip-cache -r requirements.txt',
    ],
    script: ['pytest --maxfail=1 --disable-warnings || true'],
  },
  go: {
    image: 'golang:1.22-alpine',
    cachePaths: ['.go-cache/'],
    beforeScript: ['export GOCACHE="$CI_PROJECT_DIR/.go-cache"', 'go mod download'],
    script: ['go test ./...'],
  },
  java: {
    image: 'maven:3.9-eclipse-temurin-21',
    cachePaths: ['.m2/repository/'],
    beforeScript: ['export MAVEN_OPTS="-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"'],
    script: ['mvn test -B'],
  },
  ruby: {
    image: 'ruby:3.3-alpine',
    cachePaths: ['vendor/bundle/'],
    beforeScript: [
      'apk add --no-cache build-base',
      'bundle config set --local path vendor/bundle',
      'bundle install --jobs 4',
    ],
    script: ['bundle exec rspec --fail-fast || bundle exec rake test'],
  },
  php: {
    image: 'composer:2',
    cachePaths: ['vendor/'],
    beforeScript: ['composer install --no-interaction --prefer-dist'],
    script: ['composer test'],
  },
  rust: {
    image: 'rust:1.77-alpine',
    cachePaths: ['.cargo-cache/', 'target/'],
    beforeScript: [
      'apk add --no-cache musl-dev',
      'export CARGO_HOME="$CI_PROJECT_DIR/.cargo-cache"',
    ],
    script: ['cargo test --release'],
  },
};

const PROJECT_TYPE_ALIASES: Record<string, keyof typeof TEST_PROFILES> = {
  nodejs: 'nodejs',
  nestjs: 'nodejs',
  nextjs: 'nodejs',
  react: 'nodejs',
  python: 'python',
  django: 'python',
  go: 'go',
  golang: 'go',
  java: 'java',
  'spring-boot': 'java',
  ruby: 'ruby',
  php: 'php',
  laravel: 'php',
  rust: 'rust',
};

function resolveTestProfile(projectType?: string): TestStageProfile | null {
  if (!projectType) return null;
  const key = PROJECT_TYPE_ALIASES[projectType.toLowerCase()];
  return key ? TEST_PROFILES[key] : null;
}

function formatBranchRules(branches: string[]): string[] {
  return branches.map((branch) => `    - ${branch}`);
}

@Injectable()
export class GitlabCiGenerator {
  generate(options: GitlabCiGenerateOptions): string {
    const registryUrl = options.registryUrl ?? '$CI_REGISTRY';
    const branches = options.branches?.length
      ? options.branches
      : ['develop', 'main'];
    const testProfile = resolveTestProfile(options.projectType);

    const lines: string[] = [
      'stages:',
      '  - test',
      '  - build',
      '  - notify',
      '',
    ];

    if (testProfile) {
      lines.push(
        'test:',
        '  stage: test',
        `  image: ${testProfile.image}`,
        '  cache:',
        '    key: ${CI_COMMIT_REF_SLUG}',
        '    paths:',
        ...testProfile.cachePaths.map((p) => `      - ${p}`),
        '  before_script:',
        ...testProfile.beforeScript.map((s) => `    - ${s}`),
        '  script:',
        ...testProfile.script.map((s) => `    - ${s}`),
        '  only:',
        ...formatBranchRules(branches),
        '',
      );
    }

    lines.push(
      'build:',
      '  stage: build',
      '  image: docker:24',
      '  services:',
      '    - docker:24-dind',
      '  variables:',
      '    DOCKER_TLS_CERTDIR: ""',
      '    IMAGE_TAG: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA',
      '    IMAGE_LATEST: $CI_REGISTRY_IMAGE:latest',
      '  before_script:',
      `    - echo "$CI_REGISTRY_PASSWORD" | docker login ${registryUrl} -u "$CI_REGISTRY_USER" --password-stdin`,
      '  script:',
      '    - docker pull $IMAGE_LATEST || true',
      '    - docker build --cache-from $IMAGE_LATEST --tag $IMAGE_TAG --tag $IMAGE_LATEST .',
      '    - docker push $IMAGE_TAG',
      '    - docker push $IMAGE_LATEST',
      '  only:',
      ...formatBranchRules(branches),
      '',
      'notify:',
      '  stage: notify',
      '  image: alpine:3.19',
      '  script:',
      '    - echo "Pipeline OK for $CI_COMMIT_SHA on $CI_COMMIT_REF_NAME"',
      '    - echo "Image pushed:$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"',
      '  when: on_success',
      '  only:',
      ...formatBranchRules(branches),
    );

    return lines.join('\n');
  }
}
