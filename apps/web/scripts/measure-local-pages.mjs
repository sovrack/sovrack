import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const appUrl =
  process.env.PLAYWRIGHT_CUSTOMER_APP_URL ??
  "http://app.sovrack.localhost:13080";
const email = process.env.PLAYWRIGHT_CLIENT_EMAIL ?? "owner@sovrack.test";
const password =
  process.env.PLAYWRIGHT_CLIENT_PASSWORD ?? "Local-Client-2026!";
const iterations = Number(process.env.PERF_ITERATIONS ?? 7);
const maximumP95Ms = Number(process.env.PERF_MAX_P95_MS ?? 3000);
const outputPath =
  process.env.PERF_OUTPUT ?? "test-results/performance-local.json";

if (!Number.isInteger(iterations) || iterations < 3 || iterations > 30) {
  throw new Error("PERF_ITERATIONS must be an integer between 3 and 30.");
}

const targets = [
  {
    name: "my-account",
    path: "/settings/account",
    ready: (page) =>
      page.locator("h1").filter({ hasText: /My Account|Mon compte/i }),
  },
  {
    name: "workspaces",
    path: "/admin/teams",
    ready: (page) =>
      page.getByRole("heading", { name: "Espaces de travail" }),
  },
];

function percentile(values, percentage) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)
  ];
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${appUrl}/dashboard`);
  await page.getByRole("heading", { name: /Bienvenue,/ }).waitFor();

  const results = [];
  for (const target of targets) {
    await page.goto(`${appUrl}${target.path}`);
    await target.ready(page).waitFor();

    const samplesMs = [];
    for (let index = 0; index < iterations; index += 1) {
      const samplePage = await context.newPage();
      try {
        const startedAt = performance.now();
        await samplePage.goto(`${appUrl}${target.path}`, {
          waitUntil: "domcontentloaded",
        });
        await target.ready(samplePage).waitFor();
        samplesMs.push(
          Math.round((performance.now() - startedAt) * 100) / 100,
        );
      } finally {
        await samplePage.close();
      }
    }

    results.push({
      name: target.name,
      path: target.path,
      samplesMs,
      medianMs: percentile(samplesMs, 0.5),
      p95Ms: percentile(samplesMs, 0.95),
      budgetP95Ms: maximumP95Ms,
      withinBudget: percentile(samplesMs, 0.95) <= maximumP95Ms,
    });
  }

  const report = {
    measuredAt: new Date().toISOString(),
    origin: appUrl,
    browser: "chromium",
    iterations,
    methodology:
      "Warm authenticated Chromium pages, from request start to the page heading becoming visible; a fresh page isolates each sample while reusing the browser cache and session.",
    results,
  };

  await mkdir(outputPath.split("/").slice(0, -1).join("/") || ".", {
    recursive: true,
  });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const result of results) {
    console.log(
      `${result.name}: median=${result.medianMs}ms p95=${result.p95Ms}ms budget=${result.budgetP95Ms}ms`,
    );
  }

  if (results.some((result) => !result.withinBudget)) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
