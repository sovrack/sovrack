import { describe, expect, it } from "vitest";
import { resolveSafeInternalPath } from "./safe-navigation";

describe("resolveSafeInternalPath", () => {
  it("keeps a local invitation path", () => {
    expect(
      resolveSafeInternalPath("/invitations/accept?token=abc", "/dashboard"),
    ).toBe("/invitations/accept?token=abc");
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example/path",
    "javascript:alert(1)",
  ])("rejects external or ambiguous target %s", (target) => {
    expect(resolveSafeInternalPath(target, "/dashboard")).toBe("/dashboard");
  });
});
