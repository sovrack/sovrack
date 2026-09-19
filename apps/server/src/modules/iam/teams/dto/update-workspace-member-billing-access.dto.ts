import { IsBoolean } from 'class-validator';

export class UpdateWorkspaceMemberBillingAccessDto {
  @IsBoolean()
  canManageBilling!: boolean;
}
