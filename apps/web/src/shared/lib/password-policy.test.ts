import { describe, expect, it } from "vitest";
import { isSovrackPassword } from "./password-policy";

describe("isSovrackPassword", () => {
  it.each([
    ["Local-Client-2026!", true],
    ["shortA1", false],
    ["all-lowercase-2026", false],
    ["ALL-UPPERCASE-2026", false],
    ["NoDigitsInThisValue", false],
    [`A1${"a".repeat(127)}`, false],
  ])("validates the shared password contract", (value, expected) => {
    expect(isSovrackPassword(value)).toBe(expected);
  });
});
