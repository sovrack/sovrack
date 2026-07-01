import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { SshModule } from '../../../adapters/ssh/ssh.module';
import { AnsibleModule } from '../../../adapters/provisioning/ansible.module';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ProjectAccessModule } from '../../catalog/access/project-access.module';
import { SslCertificateService } from './ssl-certificate.service';
import { SslRenewalService } from './ssl-renewal.service';
import { SslController } from './ssl.controller';

@Module({
  imports: [
    PrismaModule,
    SshModule,
    AnsibleModule,
    AppJwtModule,
    NotificationsModule,
    ProjectAccessModule,
  ],
  controllers: [SslController],
  providers: [SslCertificateService, SslRenewalService],
  exports: [SslCertificateService],
})
export class SslModule {}
