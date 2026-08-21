import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { CreateSshKeyDto } from './dto/create-ssh-key.dto';
import { SshKeysService } from './ssh-keys.service';

@ApiTags('SSH Keys')
@ApiBearerAuth()
@Controller(['workspaces/:workspaceId/ssh-keys', 'ssh-keys'])
@UseGuards(JwtAuthGuard)
export class SshKeysController {
  constructor(private readonly sshKeysService: SshKeysService) {}

  @Get()
  async findAll(
    @GetUser() user: JwtPayload,
    @Param('workspaceId') workspaceId?: string,
    @Headers('x-workspace-id') workspaceHeader?: string,
  ) {
    return this.sshKeysService.findAll(user.id, workspaceId ?? workspaceHeader);
  }

  @Post()
  async create(
    @GetUser() user: JwtPayload,
    @Body() dto: CreateSshKeyDto,
    @Param('workspaceId') workspaceId?: string,
    @Headers('x-workspace-id') workspaceHeader?: string,
  ) {
    return this.sshKeysService.create(
      user.id,
      dto,
      workspaceId ?? workspaceHeader,
    );
  }

  @Delete(':id')
  async remove(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('workspaceId') workspaceId?: string,
    @Headers('x-workspace-id') workspaceHeader?: string,
  ) {
    return this.sshKeysService.remove(
      id,
      user.id,
      workspaceId ?? workspaceHeader,
    );
  }
}
