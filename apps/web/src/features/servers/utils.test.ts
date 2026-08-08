import { describe, expect, it } from "vitest";
import {
  canCancelJob,
  canRetryJob,
  formatConnectionMode,
  formatJobType,
  getJobStatusClassName,
} from "./utils";
import type { Server, ServerJob } from "@/features/servers/types/server";

const job = (over: Partial<ServerJob>): ServerJob =>
  ({ type: "VERIFY", status: "PENDING", ...over }) as ServerJob;

describe("server-utils", () => {
  describe("formatJobType", () => {
    it("mappe les types connus", () => {
      expect(formatJobType("INSTALL_TOOLS" as ServerJob["type"])).toBe(
        "Legacy setup",
      );
      expect(formatJobType("PREPARE_SERVER" as ServerJob["type"])).toBe(
        "Setup Server",
      );
      expect(formatJobType("REGISTER_RUNNER" as ServerJob["type"])).toBe(
        "Register Runner",
      );
    });
    it("défaut = Validate SSH", () => {
      expect(formatJobType("VERIFY")).toBe("Validate SSH");
    });
  });

  describe("formatConnectionMode", () => {
    it("met en majuscules", () => {
      expect(formatConnectionMode("ssh" as Server["connectionMode"])).toBe(
        "SSH",
      );
    });
  });

  describe("canRetryJob", () => {
    it("retryable si FAILED/TIMEOUT/BLOCKED et type VERIFY", () => {
      expect(canRetryJob(job({ status: "FAILED", type: "VERIFY" }))).toBe(
        true,
      );
      expect(canRetryJob(job({ status: "TIMEOUT", type: "VERIFY" }))).toBe(
        true,
      );
      expect(canRetryJob(job({ status: "BLOCKED", type: "VERIFY" }))).toBe(
        true,
      );
    });
    it("non retryable pour les autres types", () => {
      expect(
        canRetryJob(job({ status: "FAILED", type: "PREPARE_SERVER" })),
      ).toBe(false);
      expect(
        canRetryJob(job({ status: "FAILED", type: "REGISTER_RUNNER" })),
      ).toBe(false);
    });
    it("non retryable si SUCCESS", () => {
      expect(canRetryJob(job({ status: "SUCCESS", type: "VERIFY" }))).toBe(
        false,
      );
    });
  });

  describe("canCancelJob", () => {
    it("cancelable si RUNNING/PENDING/BLOCKED", () => {
      expect(canCancelJob(job({ status: "RUNNING" }))).toBe(true);
      expect(canCancelJob(job({ status: "PENDING" }))).toBe(true);
    });
    it("non cancelable si SUCCESS/FAILED", () => {
      expect(canCancelJob(job({ status: "SUCCESS" }))).toBe(false);
      expect(canCancelJob(job({ status: "FAILED" }))).toBe(false);
    });
  });

  describe("getJobStatusClassName", () => {
    it("vert pour SUCCESS", () => {
      expect(getJobStatusClassName("SUCCESS")).toContain("green");
    });
    it("rouge pour FAILED/TIMEOUT/BLOCKED", () => {
      expect(getJobStatusClassName("FAILED")).toContain("red");
      expect(getJobStatusClassName("TIMEOUT")).toContain("red");
    });
    it("bleu pour RUNNING/PENDING", () => {
      expect(getJobStatusClassName("RUNNING")).toContain("blue");
    });
    it("zinc par défaut", () => {
      expect(
        getJobStatusClassName("CANCELED" as ServerJob["status"]),
      ).toContain("zinc");
    });
  });
});
