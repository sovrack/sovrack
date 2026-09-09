import { describe, expect, it } from "vitest";
import {
  getCapabilitiesByStatus,
  isCapabilityEnabled,
  PRIVATE_BETA_CAPABILITIES,
  PRODUCT_CAPABILITIES,
  PRODUCT_STAGE,
  VALIDATION_GATED_PUBLIC_CAPABILITIES,
} from "./product-capabilities";

describe("product capabilities", () => {
  it("keeps the product in private development until an explicit decision", () => {
    expect(PRODUCT_STAGE).toBe("private-development");
  });

  it("does not expose unfinished commercial and infrastructure paths", () => {
    expect(isCapabilityEnabled("selfServiceBilling")).toBe(false);
    expect(isCapabilityEnabled("managedInfrastructure")).toBe(false);
    expect(isCapabilityEnabled("automatedBackups")).toBe(false);
    expect(isCapabilityEnabled("mergeRequestPreviews")).toBe(false);
  });

  it("pins the exact scope of the first private beta", () => {
    const configuredBeta = getCapabilitiesByStatus("beta")
      .map(([name]) => name)
      .sort();

    expect(configuredBeta).toEqual([...PRIVATE_BETA_CAPABILITIES].sort());
  });

  it("keeps documentation, legal content and pricing gated", () => {
    for (const capability of VALIDATION_GATED_PUBLIC_CAPABILITIES) {
      expect(PRODUCT_CAPABILITIES[capability].status).toBe("planned");
      expect(isCapabilityEnabled(capability)).toBe(false);
    }
  });

  it("documents a decision for every capability", () => {
    for (const capability of Object.values(PRODUCT_CAPABILITIES)) {
      expect(capability.label.trim()).not.toBe("");
      expect(capability.decision.trim()).not.toBe("");
    }
  });

  it("returns only capabilities matching the requested status", () => {
    const planned = getCapabilitiesByStatus("planned");

    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every(([, definition]) => definition.status === "planned")).toBe(true);
  });
});
