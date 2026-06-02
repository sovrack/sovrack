import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { PaginationDto } from '../../core/http/pagination.dto';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsAnsibleService } from './services/deployments-ansible.service';
import { DeploymentsQueryService } from './services/deployments-query.service';
import { DeploymentsCreateService } from './services/deployments-create.service';
import { DeploymentsLifecycleService } from './services/deployments-lifecycle.service';
import { DeploymentsRollbackService } from './services/deployments-rollback.service';
import { DeploymentsAutoService } from './services/deployments-auto.service';

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ansibleService: DeploymentsAnsibleService,
    private readonly queryService: DeploymentsQueryService,
    private readonly createService: DeploymentsCreateService,
    private readonly lifecycleService: DeploymentsLifecycleService,
    private readonly rollbackService: DeploymentsRollbackService,
    private readonly autoService: DeploymentsAutoService,
  ) {}

  async create(dto: CreateDeploymentDto, userId: string) {
    return await this.createService.create(dto, userId);
  }

  async handleWebhookUpdate(
    pipelineId: number,
    status: string,
    image?: string,
  ) {
    return await this.autoService.handleWebhookUpdate(pipelineId, status, image);
  }

  async findAll(userId: string, userRole: Role, pagination?: PaginationDto) {
    return await this.queryService.findAll(userId, userRole, pagination);
  }

  async findByProject(projectId: string, userId: string, userRole: Role) {
    return await this.queryService.findByProject(projectId, userId, userRole);
  }

  async findOne(id: string, userId: string, userRole: Role) {
    return await this.queryService.findOne(id, userId, userRole);
  }

  async cancel(id: string, userId: string, userRole: Role) {
    return await this.lifecycleService.cancel(id, userId, userRole);
  }

  async rollback(id: string, userId: string, userRole: Role) {
    return await this.rollbackService.rollback(id, userId, userRole);
  }

  async triggerAutoDeployIfConfigured(
    projectId: string,
    branch: string,
    dockerImage?: string,
    pipelineId?: number,
    serviceId?: string,
  ): Promise<void> {
    return await this.autoService.triggerAutoDeployIfConfigured(
      projectId,
      branch,
      dockerImage,
      pipelineId,
      serviceId,
    );
  }

  async recoverInFlightDeploymentsAfterRestart(): Promise<number> {
    return await this.lifecycleService.recoverInFlightDeploymentsAfterRestart();
  }

  async getContainerLogs(
    id: string,
    userId: string,
    userRole: Role,
    tail?: number,
  ): Promise<{ logs: string }> {
    const deployment = await this.prisma.deployment.findUnique({ where: { id } });
    if (!deployment) {
      throw new NotFoundException('Déploiement introuvable');
    }
    if (userRole !== Role.ADMIN && deployment.userId !== userId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    const logs = await this.ansibleService.getContainerLogs(id, tail);
    return { logs };
  }
}
