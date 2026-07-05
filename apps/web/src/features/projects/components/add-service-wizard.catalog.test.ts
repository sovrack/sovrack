import { describe, it, expect } from "vitest";
import {
  repoToName,
  normalizeRepoPath,
  KINDS,
  DATABASES,
} from "./add-service-wizard.catalog";

describe("add-service-wizard catalog", () => {
  describe("repoToName", () => {
    it("takes the last path segment", () => {
      expect(repoToName("group/sub/my-repo")).toBe("my-repo");
    });
    it("trims trailing slashes", () => {
      expect(repoToName("group/repo/")).toBe("repo");
    });
    it("falls back to the trimmed input when no segment", () => {
      expect(repoToName("  solo  ")).toBe("solo");
    });
  });

  describe("normalizeRepoPath", () => {
    it("extracts the path from a full https git URL and strips .git", () => {
      expect(normalizeRepoPath("https://gitlab.com/group/repo.git")).toBe(
        "group/repo",
      );
    });
    it("handles SSH git@ syntax", () => {
      expect(normalizeRepoPath("git@github.com:group/repo.git")).toBe(
        "group/repo",
      );
    });
    it("passes a short path through unchanged", () => {
      expect(normalizeRepoPath("group/repo")).toBe("group/repo");
    });
    it("strips leading slashes", () => {
      expect(normalizeRepoPath("/group/repo")).toBe("group/repo");
    });
  });

  describe("catalog data", () => {
    it("exposes the 4 service kinds and 5 databases", () => {
      // P2.3 (D3) : "COMPOSE" retiré du catalogue de création (fonctionnalité
      // morte tant que l'exécuteur ne déploie qu'un conteneur).
      expect(KINDS).toHaveLength(4);
      expect(KINDS.map((k) => k.kind)).toContain("TEMPLATE");
      expect(KINDS.map((k) => k.kind)).not.toContain("COMPOSE");
      expect(DATABASES).toHaveLength(5);
      expect(DATABASES.find((d) => d.type === "POSTGRES")?.defaultVersion).toBe(
        "16",
      );
    });
  });
});
