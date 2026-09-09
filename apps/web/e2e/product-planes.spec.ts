import { expect, test, type Page } from "@playwright/test";

const PUBLIC_URL =
  process.env.PLAYWRIGHT_PUBLIC_SITE_URL ??
  "http://sovrack.localhost:13080";
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
  process.env.PLAYWRIGHT_STAFF_EMAIL ?? "operator.staff@sovrack.test";
const STAFF_PASSWORD =
  process.env.PLAYWRIGHT_STAFF_PASSWORD ?? "Local-Operator-2026!";

async function loginClient(page: Page) {
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("Email").fill(CLIENT_EMAIL);
  await page.locator("#password").fill(CLIENT_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(`${APP_URL}/dashboard`);
  await expect(
    page.getByRole("heading", { name: /Bienvenue,/ }),
  ).toBeVisible();
}

test.describe("three isolated product planes", () => {
  test("keeps public marketing reachable and commercial content disabled", async ({
    page,
  }) => {
    await page.goto(PUBLIC_URL);
    await expect(page).toHaveURL(`${PUBLIC_URL}/`);
    await expect(
      page.getByRole("heading", {
        name: "Déployez vos applications sur vos propres serveurs.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Espace personnel", { exact: true })).toBeVisible();
    await expect(page.getByText("Organisation", { exact: true })).toBeVisible();

    await page.goto(`${PUBLIC_URL}/pricing`);
    await expect(
      page.getByRole("heading", {
        name: "Sovrack n'est pas encore commercialisé",
      }),
    ).toBeVisible();
    await expect(page.getByText("99 DT")).toHaveCount(0);

    await page.goto(`${PUBLIC_URL}/docs`);
    await expect(
      page.getByRole("heading", {
        name: "La documentation publique est temporairement masquée",
      }),
    ).toBeVisible();

    await page.goto(`${PUBLIC_URL}/legal`);
    await expect(
      page.getByRole("heading", {
        name: "Le contenu juridique est en cours de validation",
      }),
    ).toBeVisible();
  });

  test("routes each host to its own authentication surface", async ({ page }) => {
    await page.goto(`${APP_URL}/`);
    await expect(page).toHaveURL(`${APP_URL}/login`);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();

    await page.goto(`${STAFF_URL}/`);
    await expect(page).toHaveURL(`${STAFF_URL}/staff/login`);
    await expect(page.getByRole("heading", { name: "Back-office" })).toBeVisible();

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
  });

  test("uses Sovrack branding and cycles the three dashboard themes", async ({
    page,
  }) => {
    await loginClient(page);
    await expect(page.getByText("Sovrack", { exact: true }).first()).toBeVisible();
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

    await page.getByRole("button", { name: "Passer au mode sovrack" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain("brand");
  });

  test("isolates staff authentication from customer authentication", async ({
    page,
    context,
  }) => {
    await loginClient(page);
    await page.goto(`${STAFF_URL}/staff`);
    await expect(page).toHaveURL(`${STAFF_URL}/staff/login`);

    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.locator("#password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Accéder au back-office" }).click();
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
  });
});
