import { ProjectRole, WorkspaceRole } from '@prisma/client';

export const WorkspaceActions = {
  READ: 'workspace.read',
  UPDATE: 'workspace.update',
  DELETE: 'workspace.delete',
  INVITE_MEMBER: 'workspace.members.invite',
  MANAGE_MEMBERS: 'workspace.members.manage',
  MANAGE_OWNERS: 'workspace.owners.manage',
  CREATE_PROJECT: 'project.create',
  DELETE_PROJECT: 'project.delete',
  READ_SERVER: 'server.read',
  MANAGE_SERVER: 'server.manage',
  USE_TERMINAL: 'server.terminal',
  READ_INTEGRATION: 'integration.read',
  MANAGE_INTEGRATION: 'integration.manage',
} as const;

export type WorkspaceAction =
  (typeof WorkspaceActions)[keyof typeof WorkspaceActions];

export const ProjectActions = {
  READ: 'project.read',
  UPDATE: 'project.update',
  MANAGE_MEMBERS: 'project.members.manage',
  DEPLOY: 'project.deploy',
  DEPLOY_PROTECTED: 'project.deploy_protected',
  ROLLBACK: 'project.rollback',
  READ_SECRETS: 'project.secrets.read',
} as const;

export type ProjectAction =
  (typeof ProjectActions)[keyof typeof ProjectActions];

export type WorkspaceActorContext = {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
};

export type ProjectActorContext = WorkspaceActorContext & {
  projectId: string;
  projectRole: ProjectRole | null;
  effectiveProjectRole: ProjectRole;
};
