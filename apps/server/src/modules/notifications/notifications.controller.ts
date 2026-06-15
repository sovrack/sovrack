import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { NotificationsService } from './notifications.service';

class UpdateNotificationSettingsDto {
  @IsString() @IsOptional() slackWebhookUrl?: string;
  @IsBoolean() @IsOptional() notifyOnSuccess?: boolean;
  @IsBoolean() @IsOptional() notifyOnFailure?: boolean;
  @IsString() @IsOptional() smtpHost?: string;
  @IsOptional() smtpPort?: number;
  @IsString() @IsOptional() smtpUser?: string;
  @IsString() @IsOptional() smtpPass?: string;
  @IsString() @IsOptional() smtpFrom?: string;
  @IsString() @IsOptional() smtpTo?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notif: NotificationsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get the notification settings' })
  async getSettings() {
    return this.notif.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Save the notification settings' })
  async saveSettings(@Body() dto: UpdateNotificationSettingsDto) {
    await this.notif.saveSettings(dto);
    return this.notif.getSettings();
  }
}
