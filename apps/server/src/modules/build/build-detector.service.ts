import { Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { GitlabCryptoService } from '../gitlab/gitlab-crypto.service';

export type DetectResult = {
  type: string;
  confidence: 'high' | 'medium' | 'low';
};

type GitlabTreeItem = {
  name: string;
  type: string;
};

@Injectable()
export class BuildDetectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: GitlabCryptoService,
  ) {}

  async detectProjectType(projectId: string): Promise<DetectResult> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });

    if (!project) throw new NotFoundException('Projet non trouvé');
    if (!project.gitlabConfig)
      throw new NotFoundException('Configuration GitLab manquante');

    const config = project.gitlabConfig;
    const token = this.crypto.decryptConfigToken(config.gitlabToken);
    const baseUrl = config.gitlabUrl.replace(/\/$/, '');
    const gitlabId = config.gitlabId ?? project.gitlabId;

    if (!gitlabId)
      throw new NotFoundException('ID GitLab du projet introuvable');

    let files: string[] = [];
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabTreeItem[]>(
          `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabId))}/repository/tree`,
          { headers: { 'PRIVATE-TOKEN': token } },
        ),
      );
      files = response.data.map((f) => f.name);
    } catch {
      return { type: 'unknown', confidence: 'low' };
    }

    const result = this.inferType(files);

    await this.prisma.project.update({
      where: { id: projectId },
      data: { projectType: result.type },
    });

    return result;
  }

  private inferType(files: string[]): DetectResult {
    const set = new Set(files);

    if (set.has('docker-compose.yml') || set.has('docker-compose.yaml'))
      return { type: 'compose', confidence: 'high' };
    if (set.has('Dockerfile') || set.has('dockerfile'))
      return { type: 'docker', confidence: 'high' };
    if (set.has('package.json')) return { type: 'nodejs', confidence: 'high' };
    if (set.has('requirements.txt'))
      return { type: 'python', confidence: 'high' };
    if (set.has('composer.json')) return { type: 'php', confidence: 'high' };
    if (set.has('Gemfile')) return { type: 'ruby', confidence: 'high' };
    if (set.has('go.mod')) return { type: 'golang', confidence: 'high' };
    if (set.has('Cargo.toml')) return { type: 'rust', confidence: 'high' };
    if (set.has('index.html') || set.has('public/index.html'))
      return { type: 'static', confidence: 'medium' };

    return { type: 'unknown', confidence: 'low' };
  }
}
