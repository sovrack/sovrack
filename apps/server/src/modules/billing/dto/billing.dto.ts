import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Plan } from '@prisma/client';

export class SubscribeDto {
  @ApiProperty({ enum: Plan, example: Plan.PRO })
  @IsEnum(Plan)
  plan: Plan;
}

export class UpdateSubscriptionQuantityDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  serverQuantity?: number;
}

export class CheckoutSessionDto {
  @ApiProperty({ enum: Plan, example: Plan.PRO })
  @IsEnum(Plan)
  plan: Plan;

  @ApiPropertyOptional({ enum: ['USD', 'TND', 'EUR'], default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['stripe', 'konnect'], default: 'stripe' })
  @IsOptional()
  @IsString()
  gateway?: 'stripe' | 'konnect';
}

export class WebhookDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  type: string;
}
