import { describe, expect, it } from "vitest";
import { canProject, effectiveProjectRole } from "./permissions";

describe("project permissions", () => {
  it("inherits MAINTAINER for workspace OWNER/ADMIN", () => {
    expect(effectiveProjectRole("ADMIN", null)).toBe("MAINTAINER");
    expect(canProject("OWNER", null, "readSecrets")).toBe(true);
  });

  it("allows developers to deploy but never reveal secrets", () => {
    expect(canProject("MEMBER", "DEVELOPER", "deploy")).toBe(true);
    expect(canProject("MEMBER", "DEVELOPER", "readSecrets")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(canProject("MEMBER", "VIEWER", "read")).toBe(true);
    expect(canProject("MEMBER", "VIEWER", "deploy")).toBe(false);
  });
});
