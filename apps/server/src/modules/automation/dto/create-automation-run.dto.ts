import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AUTOMATION_ACTIONS } from '../shared/automation-options';

export class CreateAutomationRunDto {
  @IsString()
  @IsIn(AUTOMATION_ACTIONS.map((a) => a.key))
  actionKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serverIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  gitlabRunnerExecutor?: string;
}
