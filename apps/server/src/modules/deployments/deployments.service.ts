import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsCoreService } from './deployments-core.service';

@Injectable()
export class DeploymentsService {
  constructor(private readonly core: DeploymentsCoreService) {}

  async create(dto: CreateDeploymentDto, userId: string) {
    return await this.core.create(dto, userId);
  }

  async handleWebhookUpdate(
    pipelineId: number,
    status: string,
    image?: string,
  ) {
    return await this.core.handleWebhookUpdate(pipelineId, status, image);
  }

  async findAll(userId: string, userRole: Role) {
    return await this.core.findAll(userId, userRole);
  }

  async findByProject(projectId: string, userId: string, userRole: Role) {
    return await this.core.findByProject(projectId, userId, userRole);
  }

  async findOne(id: string, userId: string, userRole: Role) {
    return await this.core.findOne(id, userId, userRole);
  }

  async cancel(id: string, userId: string, userRole: Role) {
    return await this.core.cancel(id, userId, userRole);
  }

  async rollback(id: string, userId: string, userRole: Role) {
    return await this.core.rollback(id, userId, userRole);
  }

  async triggerAutoDeployIfConfigured(
    projectId: string,
    branch: string,
    dockerImage?: string,
    pipelineId?: number,
  ): Promise<void> {
    return await this.core.triggerAutoDeployIfConfigured(
      projectId,
      branch,
      dockerImage,
      pipelineId,
    );
  }

  async recoverInFlightDeploymentsAfterRestart(): Promise<number> {
    return await this.core.recoverInFlightDeploymentsAfterRestart();
  }
}
