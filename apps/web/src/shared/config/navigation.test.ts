import { describe, expect, it } from "vitest";
import { APP_NAV_SECTIONS, isRouteActive } from "./navigation";
import { isCapabilityEnabled } from "./product-capabilities";

describe("application navigation", () => {
  it("ties billing visibility to the self-service billing capability", () => {
    const billing = APP_NAV_SECTIONS.flatMap((section) => section.items).find(
      (item) => item.href === "/settings/billing",
    );

    expect(billing?.capability).toBe("selfServiceBilling");
    expect(isCapabilityEnabled(billing!.capability!)).toBe(false);
  });

  it("matches nested routes without making dashboard globally active", () => {
    expect(isRouteActive("/projects/123", "/projects")).toBe(true);
    expect(isRouteActive("/projects", "/dashboard")).toBe(false);
  });
});
