import { describe, expect, it } from "vitest";
import {
  getCapabilitiesByStatus,
  isCapabilityEnabled,
  V1_CAPABILITIES,
  PRODUCT_CAPABILITIES,
  PRODUCT_STAGE,
} from "./product-capabilities";

describe("product capabilities", () => {
  it("publishes the V1 as generally available", () => {
    expect(PRODUCT_STAGE).toBe("general-availability");
  });

  it("does not expose unfinished commercial and infrastructure paths", () => {
    expect(isCapabilityEnabled("selfServiceBilling")).toBe(false);
    expect(isCapabilityEnabled("managedInfrastructure")).toBe(false);
    expect(isCapabilityEnabled("automatedBackups")).toBe(false);
    expect(isCapabilityEnabled("mergeRequestPreviews")).toBe(false);
  });

  it("pins the exact scope of the public V1", () => {
    const configuredV1 = getCapabilitiesByStatus("available")
      .map(([name]) => name)
      .sort();

    expect(configuredV1).toEqual([...V1_CAPABILITIES].sort());
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
    expect(
      planned.every(([, definition]) => definition.status === "planned"),
    ).toBe(true);
  });
});
