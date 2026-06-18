import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { SshModule } from '../../core/ssh/ssh.module';
import { AnsibleModule } from '../../core/ansible/ansible.module';
import { AppJwtModule } from '../../core/jwt/jwt.module';
import { SslCertificateService } from './ssl-certificate.service';
import { SslRenewalService } from './ssl-renewal.service';
import { SslController } from './ssl.controller';

/**
 * SSL/TLS module — owns certificate lifecycle:
 * issuance via Let's Encrypt ACME, Nginx SSL config via Ansible,
 * and scheduled auto-renewal.
 */
@Module({
  imports: [PrismaModule, SshModule, AnsibleModule, AppJwtModule],
  controllers: [SslController],
  providers: [SslCertificateService, SslRenewalService],
  exports: [SslCertificateService],
})
export class SslModule {}
