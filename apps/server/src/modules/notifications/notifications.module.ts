import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsConfigService } from './notifications-config.service';
import { NotificationsSmtpService } from './notifications-smtp.service';
import { NotificationsSlackService } from './notifications-slack.service';
import { NotificationsService } from './notifications.service';
import { DockerConnectionNotificationsListener } from './listeners/docker-connection.listener';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsConfigService,
    NotificationsSmtpService,
    NotificationsSlackService,
    NotificationsService,
    DockerConnectionNotificationsListener,
  ],
  exports: [NotificationsService, NotificationsSmtpService],
})
export class NotificationsModule {}
