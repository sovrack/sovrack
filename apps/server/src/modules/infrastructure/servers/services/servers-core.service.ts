import { Injectable } from '@nestjs/common';
import { PaginationDto } from '../../../../shared/http/pagination.dto';
import { CreateServerDto } from '../dto/create-server.dto';
import { UpdateServerDto } from '../dto/update-server.dto';
import { InstallToolsDto } from '../dto/install-tools.dto';
import { PrepareServerDto } from '../dto/prepare-server.dto';
import { StartServerPreparationDto } from '../dto/start-server-preparation.dto';
import { ServerPreparationService } from '../../preparation/services/infra-preparation.service';
import {
  CreateServerResult,
  ServerJobsListResult,
  ServerListResult,
  ServerPublic,
} from '../shared/servers.types';
import type { ServerInfraRole } from '@prisma/client';
import { ServersJobsFacade } from './servers-jobs.facade';
import { ServersReadersFacade } from './servers-readers.facade';
import { ServersCrudService } from './servers-crud.service';

/**
 * Façade de cycle de vie serveur — CRUD réel délégué à ServersCrudService,
 * le reste (jobs/vérification/préparation/détection/audit) délégué tel quel
 * à ServersJobsFacade/ServersReadersFacade, inchangé. Voir
 * EXPLORATION_BACKEND_DEPENDANCES.md section 1 : cette façade protège les 4
 * contrôleurs (server-management, server-validation, server-detection,
 * server-audit) du découpage interne — aucun d'eux ne change.
 */
@Injectable()
export class ServersCoreService {
  constructor(
    private readonly crud: ServersCrudService,
    private readonly jobsFacade: ServersJobsFacade,
    private readonly readersFacade: ServersReadersFacade,
  ) {}

  async create(
    dto: CreateServerDto,
    actorUserId: string,
  ): Promise<CreateServerResult> {
    return this.crud.create(dto, actorUserId);
  }

  async findAll(pagination?: PaginationDto): Promise<ServerListResult> {
    return this.crud.findAll(pagination);
  }

  async findOne(id: string): Promise<ServerPublic> {
    return this.crud.findOne(id);
  }

  async update(
    id: string,
    dto: UpdateServerDto,
    actorUserId: string,
  ): Promise<ServerPublic> {
    return this.crud.update(id, dto, actorUserId);
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    return this.crud.remove(id, actorUserId);
  }

  async listJobs(
    id: string,
    pagination?: PaginationDto,
  ): Promise<ServerJobsListResult> {
    return this.jobsFacade.listJobs(id, pagination);
  }

  async cancelJob(serverId: string, jobId: string) {
    return this.jobsFacade.cancelJob(serverId, jobId);
  }

  async retryJob(id: string, jobId: string): Promise<ServerPublic> {
    return this.jobsFacade.retryJob(id, jobId);
  }

  async verifyServer(id: string, actorUserId?: string): Promise<ServerPublic> {
    return this.jobsFacade.verifyServer(id, actorUserId);
  }

  async installTools(
    id: string,
    tools?: InstallToolsDto,
  ): Promise<ServerPublic> {
    return this.jobsFacade.installTools(id, tools);
  }

  async prepareServer(
    id: string,
    prepare?: PrepareServerDto | StartServerPreparationDto,
    actorUserId?: string,
  ): Promise<ServerPublic> {
    return this.jobsFacade.prepareServer(id, prepare, actorUserId);
  }

  async startPreparation(
    id: string,
    prepare?: StartServerPreparationDto,
    actorUserId?: string,
  ) {
    return this.jobsFacade.startPreparation(id, prepare, actorUserId);
  }

  async detectServer(id: string, actorUserId?: string): Promise<ServerPublic> {
    return this.jobsFacade.detectServer(id, actorUserId);
  }

  async registerRunner(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    return this.jobsFacade.registerRunner(id, gitlabUrl, token);
  }

  async installPublicKey(
    id: string,
    password: string,
    actorUserId?: string,
  ): Promise<{ success: true; message: string }> {
    return this.jobsFacade.installPublicKey(id, password, actorUserId);
  }

  async pingServer(
    id: string,
    actorUserId: string,
  ): Promise<{ ok: boolean; message: string }> {
    return this.jobsFacade.pingServer(id, actorUserId);
  }

  toErrorMessage(error: unknown): string {
    return this.jobsFacade.toErrorMessage(error);
  }

  async listAuditEvents(id: string) {
    return this.readersFacade.listAuditEvents(id);
  }

  async listCapabilities(id: string) {
    return this.readersFacade.listCapabilities(id);
  }

  async listInstalledTools(id: string) {
    return this.readersFacade.listInstalledTools(id);
  }

  async listValidationResults(id: string) {
    return this.readersFacade.listValidationResults(id);
  }

  async listPreparations(id: string) {
    return this.readersFacade.listPreparations(id);
  }

  async getPreparationReadiness(id: string) {
    return this.readersFacade.getPreparationReadiness(id);
  }

  getPreparationOptions() {
    return this.readersFacade.getPreparationOptions();
  }

  async getPreparation(id: string) {
    return this.readersFacade.getPreparation(id);
  }

  async getPreparationLogs(id: string, afterLine?: number) {
    return this.readersFacade.getPreparationLogs(id, afterLine);
  }

  async retryPreparation(
    id: string,
    dto: Parameters<ServerPreparationService['retryPreparation']>[1],
    actorId: string,
  ) {
    return this.readersFacade.retryPreparation(id, dto, actorId);
  }

  async cancelPreparation(id: string, actorId: string) {
    return this.readersFacade.cancelPreparation(id, actorId);
  }

  async resetVerificationStatus(id: string) {
    return this.readersFacade.resetVerificationStatus(id);
  }

  async getRecentVerificationLogs(id: string, limit = 50) {
    return this.readersFacade.getRecentVerificationLogs(id, limit);
  }

  async setServerInfraRole(
    id: string,
    infraRole: ServerInfraRole,
    actorUserId: string,
  ): Promise<ServerPublic> {
    return this.readersFacade.setServerInfraRole(id, infraRole, actorUserId);
  }

  async listInfraEnvironments(): Promise<ServerPublic[]> {
    return this.readersFacade.listInfraEnvironments();
  }

  async listEnvironmentsForServer(id: string) {
    return this.readersFacade.listEnvironmentsForServer(id);
  }
}
