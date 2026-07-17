import { Injectable } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import type {
  ICiGenerator,
  CiGenerateOptions,
} from '../../interfaces/ci-generator.interface';

type TestJobProfile = {
  runsOn: string;
  setupSteps: string[];
  testSteps: string[];
};

const TEST_PROFILES: Record<string, TestJobProfile> = {
  nodejs: {
    runsOn: 'ubuntu-latest',
    setupSteps: [
      "- uses: actions/setup-node@v4\n          with:\n            node-version: '20'\n            cache: 'npm'",
      '- run: npm ci',
    ],
    testSteps: [
      'run: npm run lint --if-present',
      'run: npm test --if-present -- --passWithNoTests',
    ],
  },
  python: {
    runsOn: 'ubuntu-latest',
    setupSteps: [
      "- uses: actions/setup-python@v5\n          with:\n            python-version: '3.12'",
      '- run: pip install -r requirements.txt',
    ],
    testSteps: ['run: pytest --maxfail=1 --disable-warnings || true'],
  },
  go: {
    runsOn: 'ubuntu-latest',
    setupSteps: [
      "- uses: actions/setup-go@v5\n          with:\n            go-version: '1.22'",
    ],
    testSteps: ['run: go test ./...'],
  },
  java: {
    runsOn: 'ubuntu-latest',
    setupSteps: [
      "- uses: actions/setup-java@v4\n          with:\n            distribution: temurin\n            java-version: '21'",
    ],
    testSteps: ['run: mvn test -B'],
  },
  ruby: {
    runsOn: 'ubuntu-latest',
    setupSteps: [
      "- uses: ruby/setup-ruby@v1\n          with:\n            ruby-version: '3.3'\n            bundler-cache: true",
    ],
    testSteps: ['run: bundle exec rspec --fail-fast || bundle exec rake test'],
  },
  php: {
    runsOn: 'ubuntu-latest',
    setupSteps: [
      "- uses: shivammathur/setup-php@v2\n          with:\n            php-version: '8.3'",
      '- run: composer install --no-interaction --prefer-dist',
    ],
    testSteps: ['run: composer test'],
  },
  rust: {
    runsOn: 'ubuntu-latest',
    setupSteps: [
      "- uses: actions/cache@v4\n          with:\n            path: target\n            key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}",
    ],
    testSteps: ['run: cargo test --release'],
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

function resolveTestProfile(projectType?: string): TestJobProfile | null {
  if (!projectType) return null;
  const key = PROJECT_TYPE_ALIASES[projectType.toLowerCase()];
  return key ? TEST_PROFILES[key] : null;
}

/**
 * Generates a GitHub Actions workflow file that:
 *  1. Runs tests on push (optional, based on project type)
 *  2. Builds and pushes a Docker image to GHCR (ghcr.io/owner/repo:SHA)
 *  3. Never tags with :latest — only the immutable commit SHA
 *
 * File path: .github/workflows/build.yml
 */
@Injectable()
export class GithubActionsGenerator implements ICiGenerator {
  readonly provider = GitProviderType.GITHUB;

  getFilePath(): string {
    return '.github/workflows/build.yml';
  }

  generate(options: CiGenerateOptions): string {
    const branches = options.branches?.length
      ? options.branches
      : ['main', 'develop'];
    const testProfile = resolveTestProfile(options.projectType);
    const imageRepo =
      options.imageRepository ??
      'ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}';

    const branchList = branches.map((b) => `      - ${b}`).join('\n');

    const lines: string[] = [
      'name: Build & Push Docker Image',
      '',
      'on:',
      '  push:',
      '    branches:',
      branchList,
      '',
      'env:',
      `  REGISTRY: ghcr.io`,
      `  IMAGE_NAME: \${{ github.repository }}`,
      '',
      'jobs:',
    ];

    if (testProfile) {
      const setupStepsYml = testProfile.setupSteps
        .map((s) => `        ${s}`)
        .join('\n');
      const testStepsYml = testProfile.testSteps
        .map((s) => `        - ${s}`)
        .join('\n');

      lines.push(
        '  test:',
        `    runs-on: ${testProfile.runsOn}`,
        '    steps:',
        '      - uses: actions/checkout@v4',
        setupStepsYml,
        testStepsYml,
        '',
      );
    }

    lines.push(
      '  build-and-push:',
      `    runs-on: ubuntu-latest`,
      testProfile ? '    needs: test' : '',
      '    permissions:',
      '      contents: read',
      '      packages: write',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '',
      '      - name: Log in to GHCR',
      '        uses: docker/login-action@v3',
      '        with:',
      '          registry: ghcr.io',
      '          username: ${{ github.actor }}',
      '          password: ${{ secrets.GITHUB_TOKEN }}',
      '',
      '      - name: Extract image metadata',
      '        id: meta',
      '        uses: docker/metadata-action@v5',
      '        with:',
      `          images: ${imageRepo}`,
      '          tags: |',
      '            type=sha,format=long',
      '',
      '      - name: Build and push',
      '        uses: docker/build-push-action@v5',
      '        with:',
      '          context: .',
      '          push: true',
      '          tags: ${{ steps.meta.outputs.tags }}',
      '          labels: ${{ steps.meta.outputs.labels }}',
      '          cache-from: type=gha',
      '          cache-to: type=gha,mode=max',
      '',
      // Déclenche le déploiement Deploy Automation (deployTrigger = PIPELINE_SUCCESS / CI_HOOK).
      // Renseigne les secrets repo DA_DEPLOY_HOOK (URL webhook du service) +
      // DA_DEPLOY_TOKEN (secret du webhook) pour activer le déclenchement.
      '      - name: Trigger Deploy Automation deployment',
      '        env:',
      '          DA_DEPLOY_HOOK: ${{ secrets.DA_DEPLOY_HOOK }}',
      '          DA_DEPLOY_TOKEN: ${{ secrets.DA_DEPLOY_TOKEN }}',
      '        run: |',
      '          echo "Image pushed: ${{ steps.meta.outputs.tags }}"',
      '          if [ -n "$DA_DEPLOY_HOOK" ]; then',
      '            curl -fsSL -X POST "$DA_DEPLOY_HOOK" \\',
      '              -H "Content-Type: application/json" \\',
      '              -H "X-Hub-Signature-256: $DA_DEPLOY_TOKEN" \\',
      '              -d "{\\"ref\\":\\"${{ github.ref_name }}\\",\\"sha\\":\\"${{ github.sha }}\\"}"',
      '          else',
      '            echo "DA_DEPLOY_HOOK non défini — déploiement non déclenché.";',
      '          fi',
    );

    return lines.filter((l) => l !== undefined).join('\n');
  }
}
