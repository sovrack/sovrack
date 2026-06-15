import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ServiceType, SourceType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SourceProvidersService } from '../source-providers/source-providers.service';

export type PreviewSummary = {
  environmentId: string;
  mergeRequestId: string;
  branch: string;
  serviceEnvironmentIds: string[];
};

/**
 * Manages ephemeral preview environments — one per merge/pull request. Opening a
 * preview creates a dedicated Environment (`preview-mr-<id>`) and a preview
 * ServiceEnvironment per application service, marked isPreview/previewMrId/
 * previewBranch with the MR branch as override. Closing soft-deletes them.
 *
 * NOTE: isolated preview *deployments* sharing a host require dynamic port
 * allocation / a reverse proxy (servers are bound 1:1 to an environment). This
 * service owns the preview lifecycle + tracking; deployment targeting builds on
 * the same proxy prerequisite as blue-green.
 */
@Injectable()
export class PreviewEnvironmentService {
  private readonly logger = new Logger(PreviewEnvironmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceProviders: SourceProvidersService,
  ) {}

  async openPreview(projectId: string, mergeRequestId: string, branch: string): Promise<PreviewSummary> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet non trouvé');

    const services = await this.prisma.service.findMany({
      where: { projectId, type: ServiceType.APPLICATION, sourceType: SourceType.GIT },
      select: { id: true },
    });
    if (services.length === 0) {
      throw new BadRequestException('Aucun service applicatif à prévisualiser');
    }

    const envName = `preview-mr-${mergeRequestId}`;
    const environment =
      (await this.prisma.environment.findFirst({ where: { projectId, name: envName } })) ??
      (await this.prisma.environment.create({ data: { projectId, name: envName } }));

    const serviceEnvironmentIds: string[] = [];
    for (const svc of services) {
      const existing = await this.prisma.serviceEnvironment.findUnique({
        where: { serviceId_environmentId: { serviceId: svc.id, environmentId: environment.id } },
      });
      const data = {
        isPreview: true,
        previewMrId: mergeRequestId,
        previewBranch: branch,
        branch,
        archivedAt: null,
      };
      const se = existing
        ? await this.prisma.serviceEnvironment.update({ where: { id: existing.id }, data })
        : await this.prisma.serviceEnvironment.create({
            data: { serviceId: svc.id, environmentId: environment.id, ...data },
          });
      serviceEnvironmentIds.push(se.id);
    }

    await this.tryComment(
      projectId,
      mergeRequestId,
      `🔎 Preview environment ready for \`${branch}\` — ${serviceEnvironmentIds.length} service(s).`,
    );

    return { environmentId: environment.id, mergeRequestId, branch, serviceEnvironmentIds };
  }

  async closePreview(projectId: string, mergeRequestId: string): Promise<{ closed: number }> {
    const previews = await this.prisma.serviceEnvironment.findMany({
      where: { previewMrId: mergeRequestId, isPreview: true, archivedAt: null, service: { projectId } },
      select: { id: true },
    });
    if (previews.length > 0) {
      await this.prisma.serviceEnvironment.updateMany({
        where: { id: { in: previews.map((p) => p.id) } },
        data: { archivedAt: new Date() },
      });
      await this.tryComment(projectId, mergeRequestId, '🧹 Preview environment torn down.');
    }
    return { closed: previews.length };
  }

  async listForProject(projectId: string) {
    return this.prisma.serviceEnvironment.findMany({
      where: { isPreview: true, archivedAt: null, service: { projectId } },
      select: {
        id: true,
        previewMrId: true,
        previewBranch: true,
        environmentId: true,
        service: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  private async tryComment(projectId: string, mergeRequestId: string, body: string): Promise<void> {
    try {
      const provider = await this.sourceProviders.forProject(projectId);
      if (provider.postComment) {
        await provider.postComment(projectId, mergeRequestId, body);
      }
    } catch (error) {
      this.logger.debug(
        `Preview comment skipped for project ${projectId} MR ${mergeRequestId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
