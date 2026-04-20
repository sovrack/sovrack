import { Injectable } from '@nestjs/common';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { ServersCoreService } from './servers-core.service';
import { InstallToolsDto } from './servers.types';

@Injectable()
export class ServersService {
  constructor(private readonly core: ServersCoreService) {}

  async create(dto: CreateServerDto, actorUserId: string) {
    return await this.core.create(dto, actorUserId);
  }

  async findAll() {
    return await this.core.findAll();
  }

  async findOne(id: string) {
    return await this.core.findOne(id);
  }

  async update(id: string, dto: UpdateServerDto, actorUserId: string) {
    return await this.core.update(id, dto, actorUserId);
  }

  async remove(id: string, actorUserId: string) {
    return await this.core.remove(id, actorUserId);
  }

  async listJobs(id: string) {
    return await this.core.listJobs(id);
  }

  async retryJob(id: string, jobId: string) {
    return await this.core.retryJob(id, jobId);
  }

  async verifyServer(id: string) {
    return await this.core.verifyServer(id);
  }

  async installTools(id: string, tools?: InstallToolsDto) {
    return await this.core.installTools(id, tools);
  }

  async registerRunner(id: string, gitlabUrl: string, token: string) {
    return await this.core.registerRunner(id, gitlabUrl, token);
  }

  async installPublicKey(id: string, password: string) {
    return await this.core.installPublicKey(id, password);
  }
}
