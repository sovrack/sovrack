import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { SslCertificateService } from './ssl-certificate.service';
import type { SslCertificateRequest } from './ssl-certificate.service';

@Controller('ssl')
@UseGuards(JwtAuthGuard)
export class SslController {
  constructor(private readonly sslCertificateService: SslCertificateService) {}

  @Post('certificates')
  issue(@Body() dto: SslCertificateRequest) {
    return this.sslCertificateService.issueAndConfigure(dto);
  }

  @Delete('certificates/:domainName')
  revoke(@Param('domainName') domainName: string) {
    return this.sslCertificateService.revoke(domainName);
  }

  @Get('certificates/expiring')
  getExpiring() {
    return this.sslCertificateService.getExpiringCertificates(30);
  }
}
