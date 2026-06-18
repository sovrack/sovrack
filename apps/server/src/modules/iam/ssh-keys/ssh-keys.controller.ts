import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { CreateSshKeyDto } from './dto/create-ssh-key.dto';
import { SshKeysService } from './ssh-keys.service';

@ApiTags('SSH Keys')
@ApiBearerAuth()
@Controller('ssh-keys')
@UseGuards(JwtAuthGuard)
export class SshKeysController {
  constructor(private readonly sshKeysService: SshKeysService) {}

  @Get()
  async findAll(@GetUser() user: JwtPayload) {
    return this.sshKeysService.findAll(user.id);
  }

  @Post()
  async create(@GetUser() user: JwtPayload, @Body() dto: CreateSshKeyDto) {
    return this.sshKeysService.create(user.id, dto);
  }

  @Delete(':id')
  async remove(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.sshKeysService.remove(id, user.id);
  }
}
