import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const originalEnv = { ...process.env };

function validJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

function request(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
}

describe("web-plane middleware", () => {
  beforeEach(() => {
    process.env.PUBLIC_SITE_URL = "https://sovrack.test";
    process.env.CUSTOMER_APP_URL = "https://app.sovrack.test";
    process.env.STAFF_APP_URL = "https://staff.sovrack.test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("keeps the public home page public after authentication", () => {
    const response = middleware(
      request(
        "https://sovrack.test/",
        `deploy_automation_token=${validJwt()}`,
      ),
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "/pricing",
    "/docs",
    "/status",
    "/security",
    "/legal",
    "/privacy",
    "/terms",
    "/cookies",
    "/acceptable-use",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
  ])("keeps %s on the public host", (pathname) => {
    const response = middleware(request(`https://sovrack.test${pathname}`));
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends product routes from the public host to the customer app", () => {
    const response = middleware(
      request("https://sovrack.test/projects?tab=active"),
    );
    expect(response.headers.get("location")).toBe(
      "https://app.sovrack.test/projects?tab=active",
    );
  });

  it("routes the customer app root according to session state", () => {
    expect(
      middleware(request("https://app.sovrack.test/")).headers.get(
        "location",
      ),
    ).toBe("https://app.sovrack.test/login");
    expect(
      middleware(
        request(
          "https://app.sovrack.test/",
          `deploy_automation_token=${validJwt()}`,
        ),
      ).headers.get("location"),
    ).toBe("https://app.sovrack.test/dashboard");
  });

  it("keeps the one-time support exchange on the customer host", () => {
    const response = middleware(
      request("https://app.sovrack.test/staff-session-exchange"),
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("requires the dedicated staff session on protected staff pages", () => {
    const response = middleware(
      request("https://staff.sovrack.test/staff/users"),
    );
    expect(response.headers.get("location")).toBe(
      "https://staff.sovrack.test/staff/login",
    );
  });
});
