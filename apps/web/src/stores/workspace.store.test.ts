import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceSummary } from "@/features/teams/types/team";
import { readWorkspaceSelection } from "@/shared/lib/workspace-storage";
import { useWorkspaceStore } from "./workspace.store";

function workspace(id: string): WorkspaceSummary {
  return {
    id,
    name: id,
    slug: id,
    description: null,
    type: "ORGANIZATION",
    status: "ACTIVE",
    role: "OWNER",
    membershipStatus: "ACTIVE",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

describe("workspace store", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({
      workspaces: [],
      selectedWorkspaceId: null,
      loading: false,
      initialized: false,
      error: null,
    });
  });

  it("selects the first authorized workspace and persists the choice", () => {
    useWorkspaceStore
      .getState()
      .setWorkspaces([workspace("workspace-1"), workspace("workspace-2")]);

    expect(useWorkspaceStore.getState().selectedWorkspaceId).toBe(
      "workspace-1",
    );
    expect(readWorkspaceSelection()).toBe("workspace-1");
  });

  it("keeps a valid previous choice and ignores foreign workspace ids", () => {
    useWorkspaceStore
      .getState()
      .setWorkspaces([workspace("workspace-1"), workspace("workspace-2")]);
    useWorkspaceStore.getState().selectWorkspace("workspace-2");
    useWorkspaceStore.getState().selectWorkspace("foreign-workspace");

    expect(useWorkspaceStore.getState().selectedWorkspaceId).toBe(
      "workspace-2",
    );
    expect(readWorkspaceSelection()).toBe("workspace-2");
  });

  it("clears workspace context on logout", () => {
    useWorkspaceStore.getState().setWorkspaces([workspace("workspace-1")]);
    useWorkspaceStore.getState().clear();

    expect(useWorkspaceStore.getState().selectedWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().initialized).toBe(false);
    expect(readWorkspaceSelection()).toBeNull();
  });
});
