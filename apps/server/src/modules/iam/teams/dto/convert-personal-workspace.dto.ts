import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConvertPersonalWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
