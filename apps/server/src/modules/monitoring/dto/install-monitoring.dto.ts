import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class InstallMonitoringDto {
  @IsString()
  actionKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serverIds!: string[];
}
