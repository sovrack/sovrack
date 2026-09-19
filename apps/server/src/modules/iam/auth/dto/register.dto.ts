import { WorkspaceType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  SOVRACK_PASSWORD_OPENAPI,
  IsSovrackPassword,
  NormalizeEmail,
} from '../../../../shared/validation/identity-validation.util';

/**
 * DTO d'inscription publique — crée un compte (User + Team + essai billing).
 */
export class RegisterDto {
  @ApiProperty({ example: 'utilisateur@example.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    ...SOVRACK_PASSWORD_OPENAPI,
  })
  @IsSovrackPassword()
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;

  @ApiProperty({ example: 'John Developer' })
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Nom complet requis' })
  fullName: string;

  @ApiProperty({ enum: WorkspaceType, example: WorkspaceType.PERSONAL })
  @IsEnum(WorkspaceType, { message: "Type d'espace invalide" })
  workspaceType: WorkspaceType;

  @ApiPropertyOptional({
    example: 'Acme Engineering',
    description: 'Obligatoire uniquement pour un espace organisation',
  })
  @ValidateIf(
    (dto: RegisterDto) => dto.workspaceType === WorkspaceType.ORGANIZATION,
  )
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: "Nom de l'organisation requis" })
  @MaxLength(120)
  workspaceName?: string;
}
