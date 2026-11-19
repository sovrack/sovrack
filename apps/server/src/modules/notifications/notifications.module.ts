import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NotificationsConfigService } from './notifications-config.service';
import { NotificationsSmtpService } from './notifications-smtp.service';
import { NotificationsSlackService } from './notifications-slack.service';
import { NotificationsService } from './notifications.service';
import { DockerConnectionNotificationsListener } from './listeners/docker-connection.listener';

import { NotificationsDiscordService } from './notifications-discord.service';

@Module({
  imports: [PrismaModule, HttpModule],
  // Notification delivery remains internal. The former settings controller
  // edited one global secret bag and is not safe for customer workspaces.
  controllers: [],
  providers: [
    NotificationsConfigService,
    NotificationsSmtpService,
    NotificationsSlackService,
    NotificationsDiscordService,
    NotificationsService,
    DockerConnectionNotificationsListener,
  ],
  exports: [
    NotificationsService,
    NotificationsSmtpService,
    NotificationsDiscordService,
    NotificationsConfigService,
  ],
})
export class NotificationsModule {}
