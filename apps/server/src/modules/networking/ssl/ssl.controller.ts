import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { SslCertificateService } from './ssl-certificate.service';
import type { SslCertificateRequest } from './ssl-certificate.service';

@ApiTags('SSL')
@ApiBearerAuth()
@Controller('ssl')
@UseGuards(JwtAuthGuard)
export class SslController {
  constructor(private readonly sslCertificateService: SslCertificateService) {}

  @Post('certificates')
  issue(@Body() dto: SslCertificateRequest, @GetUser() user: JwtPayload) {
    return this.sslCertificateService.issueAndConfigure(
      dto,
      user.id,
      user.role,
    );
  }

  @Delete('certificates/:domainName')
  revoke(@Param('domainName') domainName: string, @GetUser() user: JwtPayload) {
    return this.sslCertificateService.revoke(domainName, user.id, user.role);
  }

  @Get('certificates/expiring')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getExpiring() {
    return this.sslCertificateService.getExpiringCertificates(30);
  }
}
