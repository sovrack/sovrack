import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateBuildConfigDto {
  @IsOptional()
  @IsString()
  projectType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  buildPort?: number;

  @IsOptional()
  @IsString()
  buildStartCmd?: string;
}
