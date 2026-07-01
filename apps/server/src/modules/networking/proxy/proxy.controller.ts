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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { CreateProxyRuleDto, UpdateProxyRuleDto } from './dto/proxy-rule.dto';
import { ProxyService } from './proxy.service';

@ApiTags('proxy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('proxy/rules')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get()
  @ApiOperation({ summary: 'List proxy rules' })
  findAll(
    @Query('serverId') serverId: string | undefined,
    @Query('serviceEnvId') serviceEnvId: string | undefined,
    @GetUser() user: JwtPayload,
  ) {
    return this.proxyService.findAll(
      { serverId, serviceEnvId },
      user.id,
      user.role,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a proxy rule by ID' })
  findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.proxyService.findOne(id, user.id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Create a proxy rule' })
  create(@Body() dto: CreateProxyRuleDto, @GetUser() user: JwtPayload) {
    return this.proxyService.create(dto, user.id, user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a proxy rule' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProxyRuleDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.proxyService.update(id, dto, user.id, user.role);
  }

  @Post(':id/toggle')
  @ApiOperation({ summary: 'Toggle rule active/inactive' })
  toggle(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.proxyService.toggleActive(id, user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a proxy rule' })
  remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.proxyService.remove(id, user.id, user.role);
  }
}
