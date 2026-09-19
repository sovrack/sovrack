import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PUBLIC_URL =
  process.env.PLAYWRIGHT_PUBLIC_SITE_URL ?? "http://sovrack.localhost:13080";
const APP_URL =
  process.env.PLAYWRIGHT_CUSTOMER_APP_URL ??
  "http://app.sovrack.localhost:13080";
const STAFF_URL =
  process.env.PLAYWRIGHT_STAFF_APP_URL ??
  "http://staff.sovrack.localhost:13080";

const CLIENT_EMAIL =
  process.env.PLAYWRIGHT_CLIENT_EMAIL ?? "owner@sovrack.test";
const CLIENT_PASSWORD =
  process.env.PLAYWRIGHT_CLIENT_PASSWORD ?? "Local-Client-2026!";
const STAFF_EMAIL =
  process.env.PLAYWRIGHT_STAFF_EMAIL ?? "admin.staff@sovrack.test";
const STAFF_PASSWORD =
  process.env.PLAYWRIGHT_STAFF_PASSWORD ?? "Local-Admin-2026!";
const STAFF_MFA_SECRET =
  process.env.PLAYWRIGHT_STAFF_MFA_SECRET ?? "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

let cachedClientCookies: Parameters<BrowserContext["addCookies"]>[0] | null =
  null;

function currentTotp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Secret TOTP local invalide");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) >>>
    0;
  return (binary % 1_000_000).toString().padStart(6, "0");
}

async function loginClient(page: Page) {
  if (cachedClientCookies) {
    await page.context().addCookies(cachedClientCookies);
    await page.goto(`${APP_URL}/dashboard`);
    await expect(
      page.getByRole("heading", { name: /Bienvenue,/ }),
    ).toBeVisible();
    return;
  }

  await page.goto(`${APP_URL}/login`);
  await expect(page.getByLabel(/Code MFA|Code de secours/)).toHaveCount(0);
  await page.getByLabel("Email").fill(CLIENT_EMAIL);
  await page.locator("#password").fill(CLIENT_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(`${APP_URL}/dashboard`);
  await expect(page.getByRole("heading", { name: /Bienvenue,/ })).toBeVisible();
  cachedClientCookies = await page.context().cookies(APP_URL);
}

test.describe("three isolated product planes", () => {
  test("publishes the complete public product surface", async ({ page }) => {
    await page.goto(PUBLIC_URL);
    await expect(page).toHaveURL(`${PUBLIC_URL}/`);
    await expect(
      page.getByRole("heading", {
        name: "Déployez vos applications sur vos propres serveurs.",
      }),
    ).toBeVisible();
    const hero = page.locator("main > section").first();
    await expect
      .poll(() =>
        hero.evaluate((element) => getComputedStyle(element).backgroundImage),
      )
      .toContain("radial-gradient");
    const sectionBorders = await page
      .locator("main > section")
      .evaluateAll((sections) =>
        sections.map((section) => {
          const style = getComputedStyle(section);
          return [style.borderTopWidth, style.borderBottomWidth];
        }),
      );
    expect(
      sectionBorders.every(
        ([top, bottom]) => top === "0px" && bottom === "0px",
      ),
    ).toBe(true);
    const platformTop = await page
      .locator("#plateforme")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(platformTop).toBeGreaterThanOrEqual(
      page.viewportSize()?.height ?? 720,
    );
    await expect(
      page.getByText("Espace personnel", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Organisation", { exact: true })).toBeVisible();
    await expect(page.getByText(/bêta privée/i)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Créer un compte" }).first(),
    ).toBeVisible();

    await page.goto(`${PUBLIC_URL}/pricing`);
    await expect(
      page.getByRole("heading", {
        name: "Commencez gratuitement.",
      }),
    ).toBeVisible();
    await expect(page.getByText("0 DT", { exact: true })).toBeVisible();
    await expect(page.getByText("1 projet", { exact: true })).toBeVisible();
    await expect(page.getByText("1 serveur", { exact: true })).toBeVisible();

    await page.goto(`${PUBLIC_URL}/docs`);
    await expect(
      page.getByRole("heading", { name: "Documentation" }),
    ).toBeVisible();

    await page.goto(`${PUBLIC_URL}/legal`);
    await expect(
      page.getByRole("heading", { name: "Mentions légales" }),
    ).toBeVisible();

    await page.goto(`${PUBLIC_URL}/security`);
    await expect(
      page.getByRole("heading", { name: "Sécurité de Sovrack" }),
    ).toBeVisible();
    await expect(
      page.getByText(/double authentification TOTP est facultative/i),
    ).toBeVisible();

    await page.goto(`${PUBLIC_URL}/status`);
    await expect(
      page.getByRole("heading", { name: "Disponibilité de Sovrack" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: /Tous les services essentiels sont opérationnels|Une indisponibilité est détectée/,
      }),
    ).toBeVisible();

    for (const path of ["/privacy", "/terms", "/cookies", "/acceptable-use"]) {
      const response = await page.request.get(`${PUBLIC_URL}${path}`);
      expect(response.ok(), `${path} should be public`).toBe(true);
    }

    const robots = await page.request.get(`${PUBLIC_URL}/robots.txt`);
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toContain("Sitemap:");
    const sitemap = await page.request.get(`${PUBLIC_URL}/sitemap.xml`);
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain(`${PUBLIC_URL}/docs`);
  });

  test("routes each host to its own authentication surface", async ({
    page,
  }) => {
    await page.goto(`${APP_URL}/`);
    await expect(page).toHaveURL(`${APP_URL}/login`);
    await expect(
      page.getByRole("heading", { name: "Connexion" }),
    ).toBeVisible();

    await page.goto(`${STAFF_URL}/`);
    await expect(page).toHaveURL(`${STAFF_URL}/staff/login`);
    await expect(
      page.getByRole("heading", { name: "Back-office" }),
    ).toBeVisible();

    await page.goto(`${PUBLIC_URL}/dashboard`);
    await expect(page).toHaveURL(`${APP_URL}/login?next=%2Fdashboard`);
  });

  test("shows the personal and organization registration contract", async ({
    page,
  }) => {
    await page.goto(`${APP_URL}/register`);
    await expect(
      page.getByRole("heading", { name: "Créer votre compte" }),
    ).toBeVisible();
    await expect(page.getByText("Aucun membre ni invitation.")).toBeVisible();
    await expect(page.getByText("La conversion est définitive.")).toBeVisible();
    await expect(page.getByText("Nom de l'organisation")).toHaveCount(0);

    await page.getByText("Organisation", { exact: true }).click();
    await expect(page.getByText("Nom de l'organisation")).toBeVisible();
    await expect(page.getByPlaceholder("Acme Engineering")).toBeVisible();
  });

  test("keeps the client cookie host-only and opens the public site in a new tab", async ({
    page,
    context,
  }) => {
    await loginClient(page);

    const clientCookies = await context.cookies(APP_URL);
    const authCookie = clientCookies.find(
      (cookie) => cookie.name === "deploy_automation_token",
    );
    expect(authCookie).toBeDefined();
    expect(authCookie?.httpOnly).toBe(true);
    expect(authCookie?.sameSite).toBe("Lax");
    expect(authCookie?.domain).toBe("app.sovrack.localhost");
    expect(
      (await context.cookies(PUBLIC_URL)).some(
        (cookie) => cookie.name === "deploy_automation_token",
      ),
    ).toBe(false);
    expect(
      (await context.cookies(STAFF_URL)).some(
        (cookie) => cookie.name === "deploy_automation_token",
      ),
    ).toBe(false);

    const [publicPage] = await Promise.all([
      page.waitForEvent("popup"),
      page
        .getByRole("link", {
          name: "Ouvrir le site public dans un nouvel onglet",
        })
        .click(),
    ]);
    await publicPage.waitForLoadState("domcontentloaded");
    await expect(publicPage).toHaveURL(`${PUBLIC_URL}/`);
    await expect(
      publicPage.getByRole("heading", {
        name: "Déployez vos applications sur vos propres serveurs.",
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${APP_URL}/dashboard`);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole("button", { name: "Ouvrir la navigation" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
    await expect(
      page.getByRole("complementary", { name: "Navigation principale" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fermer la navigation" }).click();
  });

  test("uses Sovrack branding and cycles the three dashboard themes", async ({
    page,
  }) => {
    await loginClient(page);
    await expect(
      page.getByText("Sovrack", { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain("brand");

    await page.getByRole("button", { name: "Passer au mode sombre" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .not.toContain("brand");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain("dark");

    await page.getByRole("button", { name: "Passer au mode clair" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain("light");

    await page
      .getByRole("button", { name: "Passer au mode sovrack" })
      .click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain("brand");
  });

  test("keeps general server automation outside the V1 UI and API surface", async ({
    page,
  }) => {
    await loginClient(page);
    await expect(page.getByRole("link", { name: "Automation" })).toHaveCount(0);

    await page.goto(`${APP_URL}/automation`);
    await expect(page).toHaveURL(`${APP_URL}/dashboard`);
    await expect(
      page.getByRole("heading", { name: /Bienvenue,/ }),
    ).toBeVisible();
  });

  test("offers a complete PAT-only GitHub provider flow", async ({ page }) => {
    await loginClient(page);
    await page.goto(`${APP_URL}/settings/git`);
    await expect(page.getByRole("img", { name: "GitLab" })).toBeVisible();
    await expect(page.getByRole("img", { name: "GitHub" })).toBeVisible();
    await page.getByRole("button", { name: "Ajouter un fournisseur" }).click();
    await page.getByRole("button").filter({ hasText: "GitHub" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page
      .getByPlaceholder("Ex. GitLab Cloud, GitLab de l’entreprise")
      .fill("GitHub test");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByText("OAuth", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Les deux", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Jeton d’accès personnel", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText("Permissions du jeton GitHub")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ajouter le fournisseur", exact: true }),
    ).toBeDisabled();
    await expect(page.getByText("Redirect URI", { exact: true })).toHaveCount(
      0,
    );
  });

  test("offers database services in the project creation wizard", async ({
    page,
  }) => {
    await loginClient(page);
    await page.goto(`${APP_URL}/projects/30000000-0000-4000-8000-000000000001`);
    await page.getByRole("button", { name: "Create Service" }).click();
    await expect(
      page.getByRole("heading", { name: "Choose a service type" }),
    ).toBeVisible();
    await expect(
      page.getByText("Base de données", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "PostgreSQL, MySQL, Redis, MongoDB ou RabbitMQ sur votre serveur",
      ),
    ).toBeVisible();
  });

  test("isolates staff authentication and exposes clients and workspaces", async ({
    page,
    context,
  }) => {
    await loginClient(page);
    await page.goto(`${STAFF_URL}/staff`);
    await expect(page).toHaveURL(`${STAFF_URL}/staff/login`);

    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.locator("#password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Accéder au back-office" }).click();
    await page
      .getByLabel("Code de sécurité")
      .fill(currentTotp(STAFF_MFA_SECRET));
    await page
      .getByRole("button", { name: "Vérifier le second facteur" })
      .click();
    await expect(page).toHaveURL(`${STAFF_URL}/staff`);
    await expect(
      page.getByRole("heading", { name: "Vue d'ensemble" }),
    ).toBeVisible();

    const staffCookie = (await context.cookies(STAFF_URL)).find(
      (cookie) => cookie.name === "deploy_staff_token",
    );
    expect(staffCookie?.httpOnly).toBe(true);
    expect(staffCookie?.domain).toBe("staff.sovrack.localhost");
    expect(
      (await context.cookies(APP_URL)).some(
        (cookie) => cookie.name === "deploy_staff_token",
      ),
    ).toBe(false);

    await page.goto(`${STAFF_URL}/staff/users`);
    await expect(
      page.getByRole("heading", { name: "Utilisateurs" }),
    ).toBeVisible();
    const clientUsersTable = page.getByRole("table");
    await expect(
      clientUsersTable.getByText(CLIENT_EMAIL, { exact: true }),
    ).toBeVisible();
    await expect(
      clientUsersTable.getByText(STAFF_EMAIL, { exact: true }),
    ).toHaveCount(0);

    await page
      .getByRole("link", { name: "Local Workspace Owner", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Local Workspace Owner" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Workspaces et droits" }),
    ).toBeVisible();
    await expect(
      page.getByText("Sovrack Local Workspace", { exact: true }),
    ).toBeVisible();

    await page.goto(`${STAFF_URL}/staff/teams`);
    await expect(page.getByRole("heading", { name: "Espaces" })).toBeVisible();
    await expect(
      page.getByText("Organisation", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Personnel", { exact: true })).toBeVisible();

    await page
      .getByRole("link", { name: "Sovrack Local Workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sovrack Local Workspace" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Membres" })).toBeVisible();
    await expect(page.getByText(CLIENT_EMAIL, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Invitations" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole("button", {
        name: "Ouvrir la navigation du back-office",
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Ouvrir la navigation du back-office" })
      .click();
    await expect(
      page.getByRole("complementary", {
        name: "Navigation du back-office",
      }),
    ).toBeVisible();
  });

  test("keeps customer MFA optional from activation through deactivation", async ({
    page,
  }) => {
    await loginClient(page);

    const setupResponse = await page.request.post(
      `${APP_URL}/backend-api/auth/settings/security/mfa/setup`,
      { headers: { Origin: APP_URL } },
    );
    expect(setupResponse.ok()).toBe(true);
    const setup = (await setupResponse.json()) as { secret: string };

    const enableResponse = await page.request.post(
      `${APP_URL}/backend-api/auth/settings/security/mfa/enable`,
      {
        headers: { Origin: APP_URL },
        data: { code: currentTotp(setup.secret) },
      },
    );
    expect(enableResponse.ok()).toBe(true);
    const enabled = (await enableResponse.json()) as {
      recoveryCodes: string[];
    };
    expect(enabled.recoveryCodes).toHaveLength(10);
    cachedClientCookies = null;

    await page.goto(`${APP_URL}/login`);
    await page.getByLabel("Email").fill(CLIENT_EMAIL);
    await page.locator("#password").fill(CLIENT_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    const secondFactor = page.getByLabel("Code de double authentification");
    await expect(secondFactor).toBeVisible();
    await secondFactor.fill(enabled.recoveryCodes[0]);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(`${APP_URL}/dashboard`);

    const disableResponse = await page.request.post(
      `${APP_URL}/backend-api/auth/settings/security/mfa/disable`,
      {
        headers: { Origin: APP_URL },
        data: {
          password: CLIENT_PASSWORD,
          code: enabled.recoveryCodes[1],
        },
      },
    );
    expect(disableResponse.ok()).toBe(true);
    cachedClientCookies = null;

    await page.goto(`${APP_URL}/login`);
    await expect(
      page.getByLabel("Code de double authentification"),
    ).toHaveCount(0);
    await page.getByLabel("Email").fill(CLIENT_EMAIL);
    await page.locator("#password").fill(CLIENT_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(`${APP_URL}/dashboard`);
    await expect(
      page.getByRole("heading", { name: /Bienvenue,/ }),
    ).toBeVisible();
  });
});
