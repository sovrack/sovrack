import {
  IsEnum,
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

  @IsEnum(WorkspaceRole)
  @IsOptional()
  role?: WorkspaceRole;
}
