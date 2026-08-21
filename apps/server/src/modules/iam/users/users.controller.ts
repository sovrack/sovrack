import { Body, Controller, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { UsersService } from './users.service';

/**
 * Identity self-service only. Workspace membership administration lives under
 * /workspaces/:workspaceId/members and uses invitations; a workspace admin
 * must never create, disable or delete a global User identity.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put('me/password')
  @ApiOperation({ summary: 'Change the current identity password' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  async changeMyPassword(
    @GetUser() user: JwtPayload,
    @Body() dto: ChangeMyPasswordDto,
  ): Promise<Omit<User, 'password'>> {
    return this.usersService.changeMyPassword(user.id, dto);
  }
}
