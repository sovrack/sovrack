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
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { CreateDnsProviderDto } from './dto/create-dns-provider.dto';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpsertDnsRecordDto } from './dto/upsert-dns-record.dto';
import { DnsService } from './dns.service';

@ApiTags('DNS')
@ApiBearerAuth()
@Controller('dns')
@UseGuards(JwtAuthGuard)
export class DnsController {
  constructor(private readonly dnsService: DnsService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Lister les providers DNS' })
  @ApiResponse({ status: 200, description: 'Providers DNS' })
  async listProviders() {
    return await this.dnsService.listProviders();
  }

  @Post('providers')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Créer un provider DNS' })
  @ApiResponse({ status: 201, description: 'Provider DNS créé' })
  async createProvider(@Body() dto: CreateDnsProviderDto) {
    return await this.dnsService.createProvider(dto);
  }

  @Post('providers/:id/test')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Tester un provider DNS' })
  @ApiResponse({ status: 201, description: 'Résultat du test DNS' })
  async testProvider(@Param('id') id: string) {
    return await this.dnsService.testProvider(id);
  }

  @Get('domains')
  @ApiOperation({ summary: 'Lister les domaines DNS' })
  @ApiResponse({ status: 200, description: 'Domaines DNS' })
  async listDomains(@Query('projectId') projectId?: string) {
    return await this.dnsService.listDomains(projectId);
  }

  @Post('domains')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Ajouter un domaine DNS' })
  @ApiResponse({ status: 201, description: 'Domaine DNS créé' })
  async createDomain(@Body() dto: CreateDomainDto) {
    return await this.dnsService.createDomain(dto);
  }

  @Post('domains/:id/verify')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Vérifier un domaine DNS' })
  @ApiResponse({ status: 201, description: 'Domaine vérifié' })
  async verifyDomain(@Param('id') id: string) {
    return await this.dnsService.verifyDomain(id);
  }

  @Get('domains/:domainId/records')
  @ApiOperation({ summary: 'Lister les records DNS d’un domaine' })
  @ApiResponse({ status: 200, description: 'Records DNS' })
  async listRecords(@Param('domainId') domainId: string) {
    return await this.dnsService.listRecords(domainId);
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
    return await this.dnsService.createRecord(domainId, dto);
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
    return await this.dnsService.updateRecord(recordId, dto);
  }

  @Delete('records/:recordId')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Supprimer un record DNS' })
  @ApiResponse({ status: 200, description: 'Record DNS supprimé' })
  async removeRecord(@Param('recordId') recordId: string) {
    await this.dnsService.removeRecord(recordId);
    return { message: 'Record DNS supprimé avec succès' };
  }
}
