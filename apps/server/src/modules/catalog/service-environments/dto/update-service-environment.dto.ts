import { PartialType } from '@nestjs/swagger';
import { CreateServiceEnvironmentDto } from './create-service-environment.dto';

export class UpdateServiceEnvironmentDto extends PartialType(
  CreateServiceEnvironmentDto,
) {}
