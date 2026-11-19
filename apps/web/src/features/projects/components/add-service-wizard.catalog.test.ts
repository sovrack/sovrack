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
    it("exposes the application, database and Docker image kinds available in V1", () => {
      expect(KINDS.map((kind) => kind.kind)).toEqual([
        "APPLICATION",
        "DATABASE",
        "DOCKER",
        "TEMPLATE",
      ]);
    });

    it("publishes the five managed database definitions", () => {
      expect(DATABASES).toHaveLength(5);
      expect(DATABASES.map((d) => d.type)).toEqual([
        "POSTGRES",
        "REDIS",
        "MYSQL",
        "MONGODB",
        "RABBITMQ",
      ]);
      expect(DATABASES.find((d) => d.type === "POSTGRES")?.defaultVersion).toBe(
        "16",
      );
    });
  });
});
