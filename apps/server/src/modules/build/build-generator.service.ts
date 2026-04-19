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
    const startCmd = config.startCmd ?? 'index.js';

    switch (type) {
      case 'nodejs':
        return [
          'FROM node:20-alpine',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci --only=production',
          'COPY . .',
          'RUN npm run build || true',
          `EXPOSE ${port}`,
          `HEALTHCHECK CMD wget -qO- http://localhost:${port}/health || exit 1`,
          `CMD ["node", "${startCmd}"]`,
        ].join('\n');

      case 'python':
        return [
          'FROM python:3.11-slim',
          'WORKDIR /app',
          'COPY requirements.txt .',
          'RUN pip install -r requirements.txt',
          'COPY . .',
          `EXPOSE ${port}`,
          `CMD ["python", "${startCmd}"]`,
        ].join('\n');

      case 'php':
        return [
          'FROM php:8.2-apache',
          'COPY . /var/www/html/',
          'EXPOSE 80',
        ].join('\n');

      case 'static':
        return [
          'FROM nginx:alpine',
          'COPY . /usr/share/nginx/html',
          'EXPOSE 80',
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

  generateGitlabCI(config: BuildConfig & { webhookUrl: string }): string {
    const registryUrl = config.registryUrl ?? '$CI_REGISTRY';
    const webhookUrl = config.webhookUrl;

    return [
      'stages:',
      '  - build',
      '  - notify',
      '',
      'build:',
      '  stage: build',
      '  image: docker:24',
      '  services:',
      '    - docker:24-dind',
      '  variables:',
      '    DOCKER_TLS_CERTDIR: "/certs"',
      '  before_script:',
      `    - echo "$CI_REGISTRY_PASSWORD" | docker login ${registryUrl} -u "$CI_REGISTRY_USER" --password-stdin`,
      '  script:',
      '    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .',
      '    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA',
      '    - docker tag $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA $CI_REGISTRY_IMAGE:latest',
      '    - docker push $CI_REGISTRY_IMAGE:latest',
      '  only:',
      '    - branches',
      '',
      'notify:',
      '  stage: notify',
      '  image: curlimages/curl:latest',
      '  script:',
      `    - |`,
      `      curl -s -X POST ${webhookUrl}/gitlab/webhook \\`,
      `        -H "Content-Type: application/json" \\`,
      `        -H "X-Gitlab-Token: $PLATFORM_WEBHOOK_TOKEN" \\`,
      `        -d '{"object_kind":"pipeline","object_attributes":{"id":'$CI_PIPELINE_ID',"status":"'$CI_JOB_STATUS'","ref":"'$CI_COMMIT_REF_NAME'","sha":"'$CI_COMMIT_SHA'"},"project":{"id":'$CI_PROJECT_ID'}}'`,
      '  when: always',
      '  only:',
      '    - branches',
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
