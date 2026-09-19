import { WorkspaceRole } from '@prisma/client';
import { IsIn } from 'class-validator';

export class UpdateWorkspaceMemberRoleDto {
  @IsIn([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
  role!: WorkspaceRole;
}
