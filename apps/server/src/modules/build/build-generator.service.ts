import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { GitlabCryptoService } from '../gitlab/gitlab-crypto.service';

type BuildConfig = {
  port?: number;
  startCmd?: string;
  type?: string;
  registryUrl?: string;
};

type GitlabFilePayload = {
  branch: string;
  commit_message: string;
  content: string;
};

@Injectable()
export class BuildGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: GitlabCryptoService,
  ) {}

  generateDockerfile(type: string, config: BuildConfig): string {
    const port = config.port ?? 3000;
    const startCmd = config.startCmd ?? 'dist/main.js';
    const rubyStartCmd =
      config.startCmd ??
      `bundle exec rails server -b 0.0.0.0 -p ${String(port)}`;
    const normalizedType = type.toLowerCase();

    switch (normalizedType) {
      case 'nestjs':
      case 'nodejs':
        return [
          'FROM node:20-alpine AS builder',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci',
          'COPY . .',
          'RUN npm run build',
          '',
          'FROM node:20-alpine AS production',
          'WORKDIR /app',
          'RUN addgroup -S app && adduser -S app -G app',
          'COPY --from=builder /app/dist ./dist',
          'COPY --from=builder /app/node_modules ./node_modules',
          'COPY package*.json ./',
          'USER app',
          `EXPOSE ${port}`,
          `HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${port}/health || exit 1`,
          `CMD ["node", "${startCmd}"]`,
        ].join('\n');

      case 'nextjs':
        return [
          'FROM node:20-alpine AS deps',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci',
          '',
          'FROM node:20-alpine AS builder',
          'WORKDIR /app',
          'COPY --from=deps /app/node_modules ./node_modules',
          'COPY . .',
          'RUN npm run build',
          '',
          'FROM node:20-alpine AS runner',
          'WORKDIR /app',
          'ENV NODE_ENV=production',
          'COPY --from=builder /app/.next ./.next',
          'COPY --from=builder /app/public ./public',
          'COPY --from=builder /app/package*.json ./',
          'COPY --from=builder /app/node_modules ./node_modules',
          `EXPOSE ${port}`,
          `CMD ["sh", "-c", "${config.startCmd ?? 'npm run start'}"]`,
        ].join('\n');

      case 'python':
      case 'django':
        return [
          'FROM python:3.11-slim',
          'WORKDIR /app',
          'COPY requirements.txt .',
          'RUN pip install --no-cache-dir -r requirements.txt',
          'COPY . .',
          `EXPOSE ${port}`,
          `HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:${port}/health || exit 1`,
          `CMD ["sh", "-c", "${config.startCmd ?? (normalizedType === 'django' ? 'gunicorn app.wsgi:application --bind 0.0.0.0:8000' : 'python app.py')}"]`,
        ].join('\n');

      case 'php':
      case 'laravel':
        return [
          'FROM php:8.2-apache',
          'WORKDIR /var/www/html',
          'COPY . .',
          'RUN docker-php-ext-install pdo pdo_mysql',
          `EXPOSE ${normalizedType === 'laravel' ? 8000 : 80}`,
          `CMD ["sh", "-c", "${config.startCmd ?? (normalizedType === 'laravel' ? 'php artisan serve --host=0.0.0.0 --port=8000' : 'apache2-foreground')}"]`,
        ].join('\n');

      case 'ruby':
        return [
          'FROM ruby:3.2-alpine',
          'WORKDIR /app',
          'COPY Gemfile* ./',
          'RUN bundle install',
          'COPY . .',
          `EXPOSE ${port}`,
          `CMD ["sh", "-c", "${rubyStartCmd}"]`,
        ].join('\n');

      case 'go':
      case 'golang':
        return [
          'FROM golang:1.21-alpine AS builder',
          'WORKDIR /app',
          'COPY go.* ./',
          'RUN go mod download',
          'COPY . .',
          'RUN go build -o main .',
          '',
          'FROM alpine:latest',
          'WORKDIR /app',
          'COPY --from=builder /app/main .',
          `EXPOSE ${port}`,
          'CMD ["./main"]',
        ].join('\n');

      case 'spring-boot':
      case 'java':
        return [
          'FROM eclipse-temurin:21-jdk AS builder',
          'WORKDIR /app',
          'COPY . .',
          'RUN if [ -f ./mvnw ]; then ./mvnw -DskipTests package; else mvn -DskipTests package; fi',
          '',
          'FROM eclipse-temurin:21-jre',
          'WORKDIR /app',
          'COPY --from=builder /app/target/*.jar /app/app.jar',
          `EXPOSE ${port}`,
          `CMD ["sh", "-c", "${config.startCmd ?? 'java -jar /app/app.jar'}"]`,
        ].join('\n');

      case 'postgres-service':
        return ['FROM postgres:16-alpine', 'EXPOSE 5432'].join('\n');

      case 'redis-service':
        return ['FROM redis:7-alpine', 'EXPOSE 6379'].join('\n');

      case 'react':
        return [
          'FROM node:20-alpine AS builder',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci',
          'COPY . .',
          'RUN npm run build && if [ -d build ]; then cp -R build /tmp/web; elif [ -d dist ]; then cp -R dist /tmp/web; else mkdir -p /tmp/web; fi',
          '',
          'FROM nginx:alpine',
          'COPY --from=builder /tmp/web /usr/share/nginx/html',
          'EXPOSE 80',
          'HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost || exit 1',
        ].join('\n');

      case 'rust':
        return [
          'FROM rust:1.75-alpine AS builder',
          'WORKDIR /app',
          'COPY . .',
          'RUN cargo build --release',
          '',
          'FROM alpine:latest',
          'WORKDIR /app',
          'COPY --from=builder /app/target/release/app .',
          `EXPOSE ${port}`,
          'CMD ["./app"]',
        ].join('\n');

      case 'static-frontend':
      case 'static':
      case 'docker':
      case 'dockerized':
      case 'compose':
        return [
          'FROM nginx:alpine',
          'COPY . /usr/share/nginx/html',
          'EXPOSE 80',
          'HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost || exit 1',
        ].join('\n');

      default:
        return [
          'FROM alpine:latest',
          'WORKDIR /app',
          'COPY . .',
          `EXPOSE ${port}`,
        ].join('\n');
    }
  }

  generateGitlabCI(config: BuildConfig & { webhookUrl?: string }): string {
    const registryUrl = config.registryUrl ?? '$CI_REGISTRY';

    return [
      'stages:',
      '  - build',
      '',
      'build:',
      '  stage: build',
      '  image: docker:24',
      '  services:',
      '    - docker:dind',
      '  variables:',
      '    DOCKER_TLS_CERTDIR: ""',
      '  before_script:',
      `    - echo "$CI_REGISTRY_PASSWORD" | docker login ${registryUrl} -u "$CI_REGISTRY_USER" --password-stdin`,
      '  script:',
      '    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .',
      '    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA',
      '    - docker tag $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA $CI_REGISTRY_IMAGE:latest',
      '    - docker push $CI_REGISTRY_IMAGE:latest',
      '  only:',
      '    - develop',
      '    - main',
    ].join('\n');
  }

  async pushFilesToRepo(
    projectId: string,
    files: Record<string, string>,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });

    if (!project) throw new NotFoundException('Projet non trouvé');
    if (!project.gitlabConfig)
      throw new BadRequestException('Configuration GitLab manquante');

    const config = project.gitlabConfig;
    const token = this.crypto.decryptConfigToken(config.gitlabToken);
    const baseUrl = config.gitlabUrl.replace(/\/$/, '');
    const gitlabId = config.gitlabId ?? project.gitlabId;

    if (!gitlabId) throw new BadRequestException('ID GitLab introuvable');

    const branch = config.defaultBranch || project.branch || 'main';

    for (const [filePath, content] of Object.entries(files)) {
      const encodedPath = encodeURIComponent(filePath);
      const url = `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabId))}/repository/files/${encodedPath}`;

      const payload: GitlabFilePayload = {
        branch,
        commit_message: 'chore: add deploy config by platform',
        content,
      };

      // Essayer PUT (mise à jour), sinon POST (création)
      try {
        await firstValueFrom(
          this.httpService.put(url, payload, {
            headers: { 'PRIVATE-TOKEN': token },
          }),
        );
      } catch {
        await firstValueFrom(
          this.httpService.post(url, payload, {
            headers: { 'PRIVATE-TOKEN': token },
          }),
        );
      }
    }
  }

  async configureWebhook(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });

    if (!project) throw new NotFoundException('Projet non trouvé');
    if (!project.gitlabConfig)
      throw new BadRequestException('Configuration GitLab manquante');

    const config = project.gitlabConfig;
    const token = this.crypto.decryptConfigToken(config.gitlabToken);
    const baseUrl = config.gitlabUrl.replace(/\/$/, '');
    const gitlabId = config.gitlabId ?? project.gitlabId;

    if (!gitlabId) throw new BadRequestException('ID GitLab introuvable');

    const webhookUrl = process.env.WEBHOOK_URL ?? 'http://localhost:3001';
    const webhookSecret = config.webhookSecret
      ? this.crypto.decryptConfigToken(config.webhookSecret)
      : undefined;

    await firstValueFrom(
      this.httpService.post(
        `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabId))}/hooks`,
        {
          url: `${webhookUrl}/gitlab/webhook`,
          token: webhookSecret,
          push_events: true,
          pipeline_events: true,
        },
        { headers: { 'PRIVATE-TOKEN': token } },
      ),
    );
  }
}
