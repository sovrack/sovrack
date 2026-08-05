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
import { Role } from '@prisma/client';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
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
@Controller('dns')
@UseGuards(JwtAuthGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List DNS providers' })
  @ApiResponse({ status: 200, description: 'Providers DNS' })
  async listProviders() {
    return await this.domainsService.listProviders();
  }

  @Post('providers')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a DNS provider' })
  @ApiResponse({ status: 201, description: 'DNS provider created' })
  async createProvider(@Body() dto: CreateDnsProviderDto) {
    return await this.domainsService.createProvider(dto);
  }

  @Post('providers/:id/test')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Test a DNS provider' })
  @ApiResponse({ status: 201, description: 'DNS test result' })
  async testProvider(@Param('id') id: string) {
    return await this.domainsService.testProvider(id);
  }

  @Get('domains')
  @ApiOperation({ summary: 'List DNS domains' })
  @ApiResponse({ status: 200, description: 'Domaines DNS' })
  async listDomains(
    @Query('projectId') projectId?: string,
    @Query('serviceEnvId') serviceEnvId?: string,
  ) {
    return await this.domainsService.listDomains(projectId, serviceEnvId);
  }

  @Post('domains')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Add a DNS domain' })
  @ApiResponse({ status: 201, description: 'DNS domain created' })
  async createDomain(@Body() dto: CreateDomainDto) {
    return await this.domainsService.createDomain(dto);
  }

  @Delete('domains/:id')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Delete a DNS domain' })
  async removeDomain(@Param('id') id: string) {
    await this.domainsService.removeDomain(id);
    return { deleted: true };
  }

  @Post('domains/:id/verify')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Verify a DNS domain' })
  @ApiResponse({ status: 201, description: 'Domain verified' })
  async verifyDomain(@Param('id') id: string) {
    return await this.domainsService.verifyDomain(id);
  }

  @Get('domains/:domainId/records')
  @ApiOperation({ summary: 'List the DNS records of a domain' })
  @ApiResponse({ status: 200, description: 'Records DNS' })
  async listRecords(@Param('domainId') domainId: string) {
    return await this.domainsService.listRecords(domainId);
  }

  @Post('domains/:domainId/records')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a DNS record' })
  @ApiResponse({ status: 201, description: 'DNS record created' })
  async createRecord(
    @Param('domainId') domainId: string,
    @Body() dto: UpsertDnsRecordDto,
  ) {
    return await this.domainsService.createRecord(domainId, dto);
  }

  @Put('records/:recordId')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Update a DNS record' })
  @ApiResponse({ status: 200, description: 'DNS record updated' })
  async updateRecord(
    @Param('recordId') recordId: string,
    @Body() dto: UpsertDnsRecordDto,
  ) {
    return await this.domainsService.updateRecord(recordId, dto);
  }

  @Delete('records/:recordId')
  @Roles(Role.OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Delete a DNS record' })
  @ApiResponse({ status: 200, description: 'DNS record deleted' })
  async removeRecord(@Param('recordId') recordId: string) {
    await this.domainsService.removeRecord(recordId);
    return { message: 'Record DNS supprimé avec succès' };
  }
}
