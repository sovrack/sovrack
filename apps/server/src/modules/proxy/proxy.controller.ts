import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CreateProxyRuleDto, UpdateProxyRuleDto } from './dto/proxy-rule.dto';
import { ProxyService } from './proxy.service';

@ApiTags('proxy')
@UseGuards(JwtAuthGuard)
@Controller('proxy/rules')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get()
  @ApiOperation({ summary: 'List proxy rules' })
  findAll(
    @Query('serverId') serverId?: string,
    @Query('serviceEnvId') serviceEnvId?: string,
  ) {
    return this.proxyService.findAll({ serverId, serviceEnvId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a proxy rule by ID' })
  findOne(@Param('id') id: string) {
    return this.proxyService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a proxy rule' })
  create(@Body() dto: CreateProxyRuleDto) {
    return this.proxyService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a proxy rule' })
  update(@Param('id') id: string, @Body() dto: UpdateProxyRuleDto) {
    return this.proxyService.update(id, dto);
  }

  @Post(':id/toggle')
  @ApiOperation({ summary: 'Toggle rule active/inactive' })
  toggle(@Param('id') id: string) {
    return this.proxyService.toggleActive(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a proxy rule' })
  remove(@Param('id') id: string) {
    return this.proxyService.remove(id);
  }
}
