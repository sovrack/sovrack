import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptWorkspaceInvitationDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
