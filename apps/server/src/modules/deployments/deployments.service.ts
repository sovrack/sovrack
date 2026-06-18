import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PaginationDto } from '../../core/http/pagination.dto';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsExecutorService } from './services/deployments-executor.service';
import { DeploymentsQueryService } from './services/deployments-query.service';
import { DeploymentsCreateService } from './services/deployments-create.service';
import { DeploymentsLifecycleService } from './services/deployments-lifecycle.service';
import { DeploymentsRollbackService } from './services/deployments-rollback.service';
import { DeploymentsPipelineHandlerService } from './services/deployments-pipeline-handler.service';
import { DeploymentsAutoTriggerService } from './services/deployments-auto-trigger.service';

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly ansibleService: DeploymentsExecutorService,
    private readonly queryService: DeploymentsQueryService,
    private readonly createService: DeploymentsCreateService,
    private readonly lifecycleService: DeploymentsLifecycleService,
    private readonly rollbackService: DeploymentsRollbackService,
    private readonly pipelineHandlerService: DeploymentsPipelineHandlerService,
    private readonly autoTriggerService: DeploymentsAutoTriggerService,
  ) {}

  async create(dto: CreateDeploymentDto, userId: string) {
    return await this.createService.create(dto, userId);
  }

  async handleWebhookUpdate(
    pipelineId: number,
    status: string,
    image?: string,
  ) {
    return await this.pipelineHandlerService.handlePipelineUpdate(pipelineId, status, image);
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

  async remove(id: string, userId: string, userRole: Role) {
    return await this.lifecycleService.remove(id, userId, userRole);
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
    return await this.autoTriggerService.triggerAutoDeployIfConfigured(
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
    await this.queryService.findOne(id, userId, userRole);
    const logs = await this.ansibleService.getContainerLogs(id, tail);
    return { logs };
  }
}
