import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectMemberRole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO pour ajouter un membre à un projet.
 */
export class AddMemberDto {
  @ApiProperty({ example: 'uuid-user' })
  @IsString({ message: "L'identifiant utilisateur doit être une chaîne" })
  @IsNotEmpty({ message: "L'identifiant utilisateur est requis" })
  userId: string;

  @ApiPropertyOptional({
    enum: ProjectMemberRole,
    default: ProjectMemberRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(ProjectMemberRole, { message: 'Rôle de membre invalide' })
  role?: ProjectMemberRole;
}
