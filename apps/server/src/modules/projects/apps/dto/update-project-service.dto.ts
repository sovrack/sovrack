import { PartialType } from '@nestjs/swagger';
import { CreateProjectServiceDto } from './create-project-service.dto';

export class UpdateProjectServiceDto extends PartialType(
  CreateProjectServiceDto,
) {}
