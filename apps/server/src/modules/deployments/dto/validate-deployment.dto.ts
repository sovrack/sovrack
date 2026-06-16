import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidateDeploymentDto {
  @ApiProperty({ example: 'project-uuid' })
  @IsString()
  @IsNotEmpty({ message: 'projectId is required' })
  projectId!: string;

  @ApiProperty({ example: 'environment-uuid' })
  @IsString()
  @IsNotEmpty({ message: 'environmentId is required' })
  environmentId!: string;

  @ApiPropertyOptional({
    example: 'service-env-uuid',
    description: 'Required to validate DATABASE services',
  })
  @IsOptional()
  @IsString()
  serviceEnvId?: string;

  @ApiPropertyOptional({
    enum: [
      'DOCKERFILE_REGISTRY',
      'DOCKERFILE_LOCAL',
      'NIXPACKS_REGISTRY',
      'NIXPACKS_LOCAL',
      'DOCKER_COMPOSE',
      'STATIC',
      'EXTERNAL_IMAGE',
    ],
  })
  @IsOptional()
  @IsEnum([
    'DOCKERFILE_REGISTRY',
    'DOCKERFILE_LOCAL',
    'NIXPACKS_REGISTRY',
    'NIXPACKS_LOCAL',
    'DOCKER_COMPOSE',
    'STATIC',
    'EXTERNAL_IMAGE',
  ])
  buildSource?:
    | 'DOCKERFILE_REGISTRY'
    | 'DOCKERFILE_LOCAL'
    | 'NIXPACKS_REGISTRY'
    | 'NIXPACKS_LOCAL'
    | 'DOCKER_COMPOSE'
    | 'STATIC'
    | 'EXTERNAL_IMAGE';
}

export class ValidationResultDto {
  @ApiProperty()
  ready!: boolean;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        binary: { type: 'string' },
        label: { type: 'string' },
        role: { type: 'string' },
      },
    },
  })
  missing!: { binary: string; label: string; role: string }[];

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        binary: { type: 'string' },
        label: { type: 'string' },
        role: { type: 'string' },
      },
    },
  })
  required!: { binary: string; label: string; role: string }[];

  @ApiProperty()
  serverName!: string;

  @ApiProperty()
  buildSource!: string;
}
