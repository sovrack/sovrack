import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetWorkspaceId } from '../../../shared/decorators/get-workspace-id.decorator';
import { WorkspaceGuard } from '../../iam/authorization/workspace.guard';
import { CreateDomainDto } from './dto/create-domain.dto';
import { CreateDnsProviderDto } from './dto/create-dns-provider.dto';
import { UpsertDnsRecordDto } from './dto/upsert-dns-record.dto';
import { DomainsService } from './domains.service';

/**
 * DNS surface: providers + domains + records. Kept under the `dns/*` path prefix
 * to preserve the existing public API contract while the implementation lives in
 * domains/ (the former standalone dns/ module was folded in here).
 */
@ApiTags('Domains')
@ApiBearerAuth()
@Controller(['workspaces/:workspaceId/dns', 'dns'])
@UseGuards(WorkspaceGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List DNS providers' })
  @ApiResponse({ status: 200, description: 'Providers DNS' })
  async listProviders(@GetWorkspaceId() workspaceId: string) {
    return await this.domainsService.listProviders(workspaceId);
  }

  @Post('providers')
  @ApiOperation({ summary: 'Create a DNS provider' })
  @ApiResponse({ status: 201, description: 'DNS provider created' })
  async createProvider(
    @Body() dto: CreateDnsProviderDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.domainsService.createProvider(dto, workspaceId);
  }

  @Post('providers/:id/test')
  @ApiOperation({ summary: 'Test a DNS provider' })
  @ApiResponse({ status: 201, description: 'DNS test result' })
  async testProvider(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.domainsService.testProvider(id, workspaceId);
  }

  @Get('domains')
  @ApiOperation({ summary: 'List DNS domains' })
  @ApiResponse({ status: 200, description: 'Domaines DNS' })
  async listDomains(
    @GetWorkspaceId() workspaceId: string,
    @Query('projectId') projectId?: string,
    @Query('serviceEnvId') serviceEnvId?: string,
  ) {
    return await this.domainsService.listDomains(
      workspaceId,
      projectId,
      serviceEnvId,
    );
  }

  @Post('domains')
  @ApiOperation({ summary: 'Add a DNS domain' })
  @ApiResponse({ status: 201, description: 'DNS domain created' })
  async createDomain(
    @Body() dto: CreateDomainDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.domainsService.createDomain(dto, workspaceId);
  }

  @Delete('domains/:id')
  @ApiOperation({ summary: 'Delete a DNS domain' })
  async removeDomain(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    await this.domainsService.removeDomain(id, workspaceId);
    return { deleted: true };
  }

  @Post('domains/:id/verify')
  @ApiOperation({ summary: 'Verify a DNS domain' })
  @ApiResponse({ status: 201, description: 'Domain verified' })
  async verifyDomain(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.domainsService.verifyDomain(id, workspaceId);
  }

  @Get('domains/:domainId/records')
  @ApiOperation({ summary: 'List the DNS records of a domain' })
  @ApiResponse({ status: 200, description: 'Records DNS' })
  async listRecords(
    @Param('domainId') domainId: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.domainsService.listRecords(domainId, workspaceId);
  }

  @Post('domains/:domainId/records')
  @ApiOperation({ summary: 'Create a DNS record' })
  @ApiResponse({ status: 201, description: 'DNS record created' })
  async createRecord(
    @Param('domainId') domainId: string,
    @Body() dto: UpsertDnsRecordDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.domainsService.createRecord(domainId, dto, workspaceId);
  }

  @Put('records/:recordId')
  @ApiOperation({ summary: 'Update a DNS record' })
  @ApiResponse({ status: 200, description: 'DNS record updated' })
  async updateRecord(
    @Param('recordId') recordId: string,
    @Body() dto: UpsertDnsRecordDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.domainsService.updateRecord(recordId, dto, workspaceId);
  }

  @Delete('records/:recordId')
  @ApiOperation({ summary: 'Delete a DNS record' })
  @ApiResponse({ status: 200, description: 'DNS record deleted' })
  async removeRecord(
    @Param('recordId') recordId: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    await this.domainsService.removeRecord(recordId, workspaceId);
    return { message: 'Record DNS supprimé avec succès' };
  }
}
