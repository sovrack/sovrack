import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto/billing.dto';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  getMyBilling(@GetUser() user: JwtPayload) {
    return this.billingService.getMyBillingForUser(user.id);
  }

  @Post('subscribe')
  @HttpCode(200)
  subscribe(@GetUser() user: JwtPayload, @Body() dto: SubscribeDto) {
    return this.billingService.subscribeForUser(user.id, dto.plan);
  }
}
