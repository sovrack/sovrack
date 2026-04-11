import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectMemberRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * DTO pour ajouter un membre à un projet.
 */
export class AddMemberDto {
  @ApiPropertyOptional({ example: 'uuid-user' })
  @IsOptional()
  @IsString({ message: "L'identifiant utilisateur doit être une chaîne" })
  userId?: string;

  @ApiPropertyOptional({ example: 'dev@devops.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email invalide' })
  email?: string;

  @ApiPropertyOptional({
    enum: ProjectMemberRole,
    default: ProjectMemberRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(ProjectMemberRole, { message: 'Rôle de membre invalide' })
  role?: ProjectMemberRole;
}
