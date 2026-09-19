import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { WorkspaceRole } from '@prisma/client';

export class AddTeamMemberDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsIn([WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
  @IsOptional()
  role?: WorkspaceRole;
}
