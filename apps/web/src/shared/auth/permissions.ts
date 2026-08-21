import type { ProjectRole } from "@/features/projects/types/project";
import type { WorkspaceRole } from "@/features/teams/types/team";

export type ProjectAction =
  | "read"
  | "update"
  | "manageMembers"
  | "deploy"
  | "rollback"
  | "readSecrets";

const PROJECT_PERMISSIONS: Record<ProjectRole, ReadonlySet<ProjectAction>> = {
  MAINTAINER: new Set([
    "read",
    "update",
    "manageMembers",
    "deploy",
    "rollback",
    "readSecrets",
  ]),
  DEVELOPER: new Set(["read", "deploy"]),
  VIEWER: new Set(["read"]),
};

export function effectiveProjectRole(
  workspaceRole: WorkspaceRole | null,
  directRole: ProjectRole | null,
): ProjectRole | null {
  return workspaceRole === "OWNER" || workspaceRole === "ADMIN"
    ? "MAINTAINER"
    : directRole;
}

export function canProject(
  workspaceRole: WorkspaceRole | null,
  directRole: ProjectRole | null,
  action: ProjectAction,
): boolean {
  const role = effectiveProjectRole(workspaceRole, directRole);
  return role ? PROJECT_PERMISSIONS[role].has(action) : false;
}
