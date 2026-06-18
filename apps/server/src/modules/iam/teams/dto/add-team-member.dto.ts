import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class AddTeamMemberDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}
