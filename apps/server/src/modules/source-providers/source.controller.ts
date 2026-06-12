import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { SourceProvidersService } from './source-providers.service';
import { ConnectSourceDto } from './dto/connect-source.dto';

@ApiTags('Source (unified)')
@Controller()
export class SourceController {
  constructor(private readonly gitProvidersService: SourceProvidersService) {}

  @Get('source/providers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister tous les providers source (GitHub + GitLab) avec leur type' })
  @ApiResponse({ status: 200, description: 'Liste des providers source' })
  async listProviders() {
    return await this.gitProvidersService.listSourceProviders();
  }

  @Post('projects/:id/source/connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connecter une source Git (GitLab ou GitHub) à un projet' })
  @ApiResponse({ status: 201, description: 'Source connectée' })
  @ApiResponse({ status: 400, description: 'Connexion échouée' })
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
