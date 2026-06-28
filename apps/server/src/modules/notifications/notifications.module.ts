import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DockerConnectionNotificationsListener } from './listeners/docker-connection.listener';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, DockerConnectionNotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
