import type { DetectResult } from './build-detection.types';
import type { ParsedProjectSignals } from './project-detection.util';
import {
  containsAny,
  detectPackageManager,
  isMultiStageDockerfile,
  mergeDependencies,
  resolvePythonPackageManager,
} from './project-detection.util';

export function buildResult(input: DetectResult): DetectResult {
  return input;
}

export function fallbackUnknownResult(...reasons: string[]): DetectResult {
  return {
    type: 'unknown',
    confidence: 'low',
    language: 'unknown',
    framework: 'unknown',
    packageManager: 'unknown',
    hasDockerfile: false,
    hasDockerCompose: false,
    hasCiConfig: false,
    recommendedStrategy: 'docker',
    recommendedBuildType: 'unknown',
    recommendedStartCommand: 'node index.js',
    recommendedPort: 3000,
    reasons,
  };
}

export function inferType(
  files: string[],
  signals: ParsedProjectSignals,
): DetectResult {
  const lowerFiles = files.map((file) => file.toLowerCase());
  const fileSet = new Set(lowerFiles);
  const reasons: string[] = [];

  const hasDockerfile = lowerFiles.some((file) => file.endsWith('dockerfile'));
  const hasDockerCompose = lowerFiles.some(
    (file) =>
      file.endsWith('docker-compose.yml') ||
      file.endsWith('docker-compose.yaml') ||
      file.endsWith('compose.yml') ||
      file.endsWith('compose.yaml'),
  );
  const hasCiConfig =
    fileSet.has('.gitlab-ci.yml') ||
    lowerFiles.some((file) => file.startsWith('.github/workflows/'));

  const packageManager = detectPackageManager(fileSet, signals);
  const packageDeps = mergeDependencies(signals.packageJson);
  const packageScripts = signals.packageJson?.scripts ?? {};

  if (hasDockerCompose && signals.dockerCompose) {
    if (containsAny(signals.dockerCompose, ['postgres:', 'postgresql'])) {
      reasons.push('docker-compose includes PostgreSQL service');
      return buildResult({
        type: 'postgres-service',
        confidence: 'high',
        language: 'service',
        framework: 'postgresql',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: 'service-container',
        recommendedBuildType: 'postgres-service',
        recommendedStartCommand: 'postgres',
        recommendedPort: 5432,
        reasons,
      });
    }
    if (containsAny(signals.dockerCompose, ['redis:', 'redis-stack'])) {
      reasons.push('docker-compose includes Redis service');
      return buildResult({
        type: 'redis-service',
        confidence: 'high',
        language: 'service',
        framework: 'redis',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: 'service-container',
        recommendedBuildType: 'redis-service',
        recommendedStartCommand: 'redis-server',
        recommendedPort: 6379,
        reasons,
      });
    }
  }

  if (packageDeps.has('@nestjs/core') || fileSet.has('nest-cli.json')) {
    reasons.push('NestJS markers found (@nestjs/core or nest-cli.json)');
    return buildResult({
      type: 'nestjs',
      confidence: 'high',
      language: 'typescript',
      framework: 'nestjs',
      packageManager,
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile
        ? 'docker-multi-stage'
        : 'docker-multi-stage',
      recommendedBuildType: 'nestjs',
      recommendedStartCommand:
        packageScripts.start?.includes('node') ||
        packageScripts.start?.includes('dist/')
          ? packageScripts.start
          : 'node dist/main.js',
      recommendedPort: 3000,
      reasons,
    });
  }

  if (
    packageDeps.has('next') ||
    lowerFiles.some((file) => file.startsWith('next.config.'))
  ) {
    reasons.push('Next.js markers found (next dependency or next.config)');
    return buildResult({
      type: 'nextjs',
      confidence: 'high',
      language: 'typescript',
      framework: 'nextjs',
      packageManager,
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile
        ? 'docker-multi-stage'
        : 'docker-multi-stage',
      recommendedBuildType: 'nextjs',
      recommendedStartCommand:
        packageScripts.start && packageScripts.start.trim().length > 0
          ? packageScripts.start
          : 'npm run start',
      recommendedPort: 3000,
      reasons,
    });
  }

  if (packageDeps.has('react') && packageDeps.has('react-dom')) {
    reasons.push('React markers found (react + react-dom)');
    return buildResult({
      type: 'react',
      confidence: 'high',
      language: 'typescript',
      framework: 'react',
      packageManager,
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile ? 'docker' : 'static-build',
      recommendedBuildType: 'react',
      recommendedStartCommand: 'npm run build',
      recommendedPort: 80,
      reasons,
    });
  }

  if (fileSet.has('package.json')) {
    reasons.push('Node.js marker found (package.json)');
    return buildResult({
      type: 'nodejs',
      confidence: 'medium',
      language: 'javascript',
      framework: 'nodejs',
      packageManager,
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile ? 'docker' : 'docker-multi-stage',
      recommendedBuildType: 'nodejs',
      recommendedStartCommand:
        packageScripts.start && packageScripts.start.trim().length > 0
          ? packageScripts.start
          : 'node index.js',
      recommendedPort: 3000,
      reasons,
    });
  }

  if (
    signals.pyprojectToml ||
    signals.requirementsTxt ||
    fileSet.has('manage.py')
  ) {
    if (
      containsAny(signals.pyprojectToml, ['django']) ||
      containsAny(signals.requirementsTxt, ['django']) ||
      fileSet.has('manage.py')
    ) {
      reasons.push('Django markers found (manage.py or django dependency)');
      return buildResult({
        type: 'django',
        confidence: 'high',
        language: 'python',
        framework: 'django',
        packageManager: resolvePythonPackageManager(fileSet, signals),
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
        recommendedBuildType: 'django',
        recommendedStartCommand:
          'gunicorn app.wsgi:application --bind 0.0.0.0:8000',
        recommendedPort: 8000,
        reasons,
      });
    }

    reasons.push('Python markers found (requirements.txt or pyproject.toml)');
    return buildResult({
      type: 'python',
      confidence: 'medium',
      language: 'python',
      framework: 'python',
      packageManager: resolvePythonPackageManager(fileSet, signals),
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
      recommendedBuildType: 'python',
      recommendedStartCommand: 'python app.py',
      recommendedPort: 8000,
      reasons,
    });
  }

  if (signals.composerJson || fileSet.has('artisan')) {
    if (
      containsAny(signals.composerJson, ['laravel/framework']) ||
      fileSet.has('artisan')
    ) {
      reasons.push('Laravel markers found (artisan or laravel/framework)');
      return buildResult({
        type: 'laravel',
        confidence: 'high',
        language: 'php',
        framework: 'laravel',
        packageManager: 'composer',
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
        recommendedBuildType: 'laravel',
        recommendedStartCommand: 'php artisan serve --host=0.0.0.0 --port=8000',
        recommendedPort: 8000,
        reasons,
      });
    }

    reasons.push('PHP markers found (composer.json)');
    return buildResult({
      type: 'php',
      confidence: 'medium',
      language: 'php',
      framework: 'php',
      packageManager: 'composer',
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
      recommendedBuildType: 'php',
      recommendedStartCommand: 'php -S 0.0.0.0:8080 -t public',
      recommendedPort: 8080,
      reasons,
    });
  }

  if (signals.goMod || fileSet.has('go.mod')) {
    reasons.push('Go markers found (go.mod)');
    return buildResult({
      type: 'go',
      confidence: 'high',
      language: 'go',
      framework: 'go',
      packageManager: 'go-modules',
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile ? 'docker' : 'docker-multi-stage',
      recommendedBuildType: 'go',
      recommendedStartCommand: './app',
      recommendedPort: 8080,
      reasons,
    });
  }

  if (signals.pomXml || signals.buildGradle) {
    const isSpringBoot =
      containsAny(signals.pomXml, ['spring-boot']) ||
      containsAny(signals.buildGradle, ['org.springframework.boot']);
    if (isSpringBoot) {
      reasons.push('Spring Boot markers found (spring-boot)');
      return buildResult({
        type: 'spring-boot',
        confidence: 'high',
        language: 'java',
        framework: 'spring-boot',
        packageManager: signals.pomXml ? 'maven' : 'gradle',
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
        recommendedBuildType: 'spring-boot',
        recommendedStartCommand: 'java -jar app.jar',
        recommendedPort: 8080,
        reasons,
      });
    }

    reasons.push('Java markers found (pom.xml/build.gradle)');
    return buildResult({
      type: 'java',
      confidence: 'medium',
      language: 'java',
      framework: 'java',
      packageManager: signals.pomXml ? 'maven' : 'gradle',
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
      recommendedBuildType: 'java',
      recommendedStartCommand: 'java -jar app.jar',
      recommendedPort: 8080,
      reasons,
    });
  }

  if (hasDockerfile) {
    const multiStage = isMultiStageDockerfile(signals.dockerfile);
    reasons.push('Dockerfile found');
    return buildResult({
      type: 'dockerized',
      confidence: 'medium',
      language: 'container',
      framework: 'docker',
      packageManager,
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: multiStage ? 'docker-multi-stage' : 'docker',
      recommendedBuildType: 'dockerized',
      recommendedStartCommand: 'docker run <image>',
      recommendedPort: 3000,
      reasons,
    });
  }

  if (
    fileSet.has('index.html') ||
    lowerFiles.some((file) => file.endsWith('/index.html'))
  ) {
    reasons.push('Static frontend marker found (index.html)');
    return buildResult({
      type: 'static-frontend',
      confidence: 'medium',
      language: 'html',
      framework: 'static',
      packageManager,
      hasDockerfile,
      hasDockerCompose,
      hasCiConfig,
      recommendedStrategy: 'static-build',
      recommendedBuildType: 'static',
      recommendedStartCommand: 'serve static assets',
      recommendedPort: 80,
      reasons,
    });
  }

  reasons.push('No strong framework marker found');
  return fallbackUnknownResult(...reasons);
}
