import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { ConfigsService } from './configs.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

@ApiTags('Configs')
@ApiBearerAuth()
@Controller('projects/:id/configs')
@UseGuards(JwtAuthGuard)
export class ConfigsController {
  constructor(private readonly configsService: ConfigsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une configuration projet' })
  @ApiResponse({ status: 201, description: 'Configuration créée' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async create(
    @Param('id') projectId: string,
    @Body() dto: CreateConfigDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.configsService.create(projectId, dto, user.id, user.role);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les configurations projet (secrets masqués)',
  })
  @ApiResponse({ status: 200, description: 'Liste des configurations' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Projet non trouvé' })
  async findAll(@Param('id') projectId: string, @GetUser() user: JwtPayload) {
    return await this.configsService.findAll(projectId, user.id, user.role);
  }

  @Put(':configId')
  @ApiOperation({ summary: 'Mettre à jour une configuration projet' })
  @ApiResponse({ status: 200, description: 'Configuration mise à jour' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou configuration non trouvé',
  })
  async update(
    @Param('id') projectId: string,
    @Param('configId') configId: string,
    @Body() dto: UpdateConfigDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.configsService.update(
      projectId,
      configId,
      dto,
      user.id,
      user.role,
    );
  }

  @Delete(':configId')
  @ApiOperation({ summary: 'Supprimer une configuration projet' })
  @ApiResponse({ status: 200, description: 'Configuration supprimée' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Action non autorisée' })
  @ApiResponse({
    status: 404,
    description: 'Projet ou configuration non trouvé',
  })
  async remove(
    @Param('id') projectId: string,
    @Param('configId') configId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.configsService.remove(projectId, configId, user.id, user.role);
    return { message: 'Configuration supprimée avec succès' };
  }
}
