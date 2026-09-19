import { WorkspaceRole } from '@prisma/client';
import { IsEmail, IsIn, IsOptional } from 'class-validator';
import { NormalizeEmail } from '../../../../shared/validation/identity-validation.util';

export class InviteWorkspaceMemberDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsIn([WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
  @IsOptional()
  role?: WorkspaceRole;
}
