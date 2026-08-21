import { ApiProperty } from '@nestjs/swagger';
import { MembershipStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateWorkspaceMemberStatusDto {
  @ApiProperty({ enum: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] })
  @IsEnum(MembershipStatus, { message: 'Statut de membre invalide' })
  status: MembershipStatus;
}
