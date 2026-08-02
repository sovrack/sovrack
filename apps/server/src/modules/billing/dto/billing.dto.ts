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

export class WebhookDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  type: string;
}
