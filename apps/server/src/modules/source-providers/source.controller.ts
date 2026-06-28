import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { SourceProvidersService } from './source-providers.service';
import { ConnectSourceDto } from './dto/connect-source.dto';

@ApiTags('Source (unified)')
@Controller()
export class SourceController {
  constructor(private readonly gitProvidersService: SourceProvidersService) {}

  @Get('source/providers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all source providers (GitHub + GitLab) with their type',
  })
  @ApiResponse({ status: 200, description: 'Liste des providers source' })
  async listProviders() {
    return await this.gitProvidersService.listSourceProviders();
  }

  @Post('projects/:id/source/connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Connect a Git source (GitLab or GitHub) to a project',
  })
  @ApiResponse({ status: 201, description: 'Source connected' })
  @ApiResponse({ status: 400, description: 'Connection failed' })
  async connectSource(
    @Param('id') projectId: string,
    @Body() dto: ConnectSourceDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.gitProvidersService.connectSource(
      projectId,
      dto,
      user.id,
      user.role,
    );
  }
}
