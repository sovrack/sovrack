import { describe, expect, it } from "vitest";
import {
  formatDate,
  timeAgo,
  timeAgoCompact,
  formatBytes,
} from "./format-date";

describe("formatDate", () => {
  it("formate une date ISO en jj/mm/aaaa", () => {
    expect(formatDate("2026-06-18T10:00:00Z")).toBe("18/06/2026");
  });
  it('retourne "-" pour une date invalide', () => {
    expect(formatDate("not-a-date")).toBe("-");
  });
  it('retourne "-" pour une chaîne vide', () => {
    expect(formatDate("")).toBe("-");
  });
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("timeAgo", () => {
  it("« just now » sous 1 min", () => {
    expect(timeAgo(new Date().toISOString())).toBe("just now");
  });
  it("minutes / heures / jours avec « ago »", () => {
    expect(timeAgo(ago(5 * 60_000))).toBe("5m ago");
    expect(timeAgo(ago(3 * 3_600_000))).toBe("3h ago");
    expect(timeAgo(ago(2 * 86_400_000))).toBe("2d ago");
  });
  it("« — » pour null / undefined / invalide", () => {
    expect(timeAgo(null)).toBe("—");
    expect(timeAgo(undefined)).toBe("—");
    expect(timeAgo("not-a-date")).toBe("—");
  });
});

describe("timeAgoCompact", () => {
  it("format compact sans « ago », jours en « j »", () => {
    expect(timeAgoCompact(new Date().toISOString())).toBe("just now");
    expect(timeAgoCompact(ago(5 * 60_000))).toBe("5m");
    expect(timeAgoCompact(ago(3 * 3_600_000))).toBe("3h");
    expect(timeAgoCompact(ago(2 * 86_400_000))).toBe("2j");
  });
  it("« — » si absent", () => {
    expect(timeAgoCompact(null)).toBe("—");
  });
});

describe("formatBytes", () => {
  it("B / KB / MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
  it("« — » pour null / undefined", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });
});
