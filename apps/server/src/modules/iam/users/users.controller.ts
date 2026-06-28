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
import { Role, User } from '@prisma/client';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../../shared/http/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Contrôleur de gestion des utilisateurs (réservé aux admins).
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new developer account' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async create(@Body() dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    return await this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all users without passwords' })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  async findAll(@Query() pagination: PaginationDto) {
    return await this.usersService.findAll(pagination);
  }

  @Put('me/password')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({
    summary: 'Changer le mot de passe de la session courante',
  })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Payload invalide' })
  @ApiResponse({
    status: 401,
    description: 'Invalid/expired JWT token or incorrect current password',
  })
  async changeMyPassword(
    @GetUser() user: JwtPayload,
    @Body() dto: ChangeMyPasswordDto,
  ): Promise<Omit<User, 'password'>> {
    return await this.usersService.changeMyPassword(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: "Get a user's details" })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findById(@Param('id') id: string): Promise<Omit<User, 'password'>> {
    return await this.usersService.findByIdOrFail(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Edit a user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    return await this.usersService.update(id, dto, {
      id: user.id,
      role: user.role,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async delete(@Param('id') id: string): Promise<Omit<User, 'password'>> {
    return await this.usersService.delete(id);
  }

  @Put(':id/toggle-active')
  @ApiOperation({ summary: 'Activate or deactivate a user account' })
  @ApiResponse({ status: 200, description: 'Account status updated' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async toggleActive(@Param('id') id: string): Promise<Omit<User, 'password'>> {
    return await this.usersService.toggleActive(id);
  }
}
