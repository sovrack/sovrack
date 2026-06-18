import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateBuildConfigDto {
  @IsOptional()
  @IsString()
  defaultBuildSource?: string;

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

  @IsOptional()
  @IsBoolean()
  autoDeploy?: boolean;

  @IsOptional()
  @IsString()
  autoDeployBranch?: string;

  @IsOptional()
  @IsString()
  dockerfileContent?: string;

  @IsOptional()
  @IsString()
  gitlabCiContent?: string;

  @IsOptional()
  @IsString()
  dockerComposeContent?: string;

  @IsOptional()
  @IsBoolean()
  overwriteDockerfile?: boolean;

  @IsOptional()
  @IsBoolean()
  overwriteGitlabCi?: boolean;

  @IsOptional()
  nixpacksConfig?: any;

  @IsOptional()
  staticConfig?: any;
}
