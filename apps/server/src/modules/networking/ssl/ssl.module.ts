import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { SshModule } from '../../../adapters/ssh/ssh.module';
import { AnsibleModule } from '../../../adapters/provisioning/ansible.module';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { SslCertificateService } from './ssl-certificate.service';
import { SslRenewalService } from './ssl-renewal.service';
import { SslController } from './ssl.controller';

/**
 * SSL/TLS module — owns certificate lifecycle:
 * issuance via Let's Encrypt ACME, Nginx SSL config via Ansible,
 * and scheduled auto-renewal.
 */
@Module({
  imports: [
    PrismaModule,
    SshModule,
    AnsibleModule,
    AppJwtModule,
    NotificationsModule,
  ],
  controllers: [SslController],
  providers: [SslCertificateService, SslRenewalService],
  exports: [SslCertificateService],
})
export class SslModule {}
