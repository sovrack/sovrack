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
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
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
  @ApiOperation({ summary: 'Lister les providers DNS' })
  @ApiResponse({ status: 200, description: 'Providers DNS' })
  async listProviders() {
    return await this.domainsService.listProviders();
  }

  @Post('providers')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Créer un provider DNS' })
  @ApiResponse({ status: 201, description: 'Provider DNS créé' })
  async createProvider(@Body() dto: CreateDnsProviderDto) {
    return await this.domainsService.createProvider(dto);
  }

  @Post('providers/:id/test')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Tester un provider DNS' })
  @ApiResponse({ status: 201, description: 'Résultat du test DNS' })
  async testProvider(@Param('id') id: string) {
    return await this.domainsService.testProvider(id);
  }

  @Get('domains')
  @ApiOperation({ summary: 'Lister les domaines DNS' })
  @ApiResponse({ status: 200, description: 'Domaines DNS' })
  async listDomains(@Query('projectId') projectId?: string) {
    return await this.domainsService.listDomains(projectId);
  }

  @Post('domains')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Ajouter un domaine DNS' })
  @ApiResponse({ status: 201, description: 'Domaine DNS créé' })
  async createDomain(@Body() dto: CreateDomainDto) {
    return await this.domainsService.createDomain(dto);
  }

  @Post('domains/:id/verify')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Vérifier un domaine DNS' })
  @ApiResponse({ status: 201, description: 'Domaine vérifié' })
  async verifyDomain(@Param('id') id: string) {
    return await this.domainsService.verifyDomain(id);
  }

  @Get('domains/:domainId/records')
  @ApiOperation({ summary: 'Lister les records DNS d’un domaine' })
  @ApiResponse({ status: 200, description: 'Records DNS' })
  async listRecords(@Param('domainId') domainId: string) {
    return await this.domainsService.listRecords(domainId);
  }

  @Post('domains/:domainId/records')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Créer un record DNS' })
  @ApiResponse({ status: 201, description: 'Record DNS créé' })
  async createRecord(
    @Param('domainId') domainId: string,
    @Body() dto: UpsertDnsRecordDto,
  ) {
    return await this.domainsService.createRecord(domainId, dto);
  }

  @Put('records/:recordId')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Mettre à jour un record DNS' })
  @ApiResponse({ status: 200, description: 'Record DNS mis à jour' })
  async updateRecord(
    @Param('recordId') recordId: string,
    @Body() dto: UpsertDnsRecordDto,
  ) {
    return await this.domainsService.updateRecord(recordId, dto);
  }

  @Delete('records/:recordId')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Supprimer un record DNS' })
  @ApiResponse({ status: 200, description: 'Record DNS supprimé' })
  async removeRecord(@Param('recordId') recordId: string) {
    await this.domainsService.removeRecord(recordId);
    return { message: 'Record DNS supprimé avec succès' };
  }
}
