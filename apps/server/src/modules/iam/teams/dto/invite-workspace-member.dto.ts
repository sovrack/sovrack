import { WorkspaceRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { NormalizeEmail } from '../../../../shared/validation/identity-validation.util';

export class InviteWorkspaceMemberDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsEnum(WorkspaceRole)
  @IsOptional()
  role?: WorkspaceRole;
}
