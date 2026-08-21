#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2] ?? "all";
const root = process.cwd();
const srcDir = path.join(root, "src");
const navigationFile = path.join(srcDir, "shared", "config", "navigation.ts");
const appRoot = path.join(srcDir, "app", "(app)");

const bannedColorPatterns = [
  /#7c3aed/gi,
  /#8b5cf6/gi,
  /#a855f7/gi,
  /\bpurple-\d{2,3}\b/gi,
  /\bviolet-\d{2,3}\b/gi,
  /\bfuchsia-\d{2,3}\b/gi,
  /\bfrom-(purple|violet|fuchsia)-\d{2,3}\b/gi,
  /\bto-(purple|violet|fuchsia)-\d{2,3}\b/gi,
];

function normalizeRouteToPagePath(route) {
  const clean = route.replace(/^\/+|\/+$/g, "");
  if (!clean) {
    return path.join(appRoot, "page.tsx");
  }
  return path.join(appRoot, ...clean.split("/"), "page.tsx");
}

function extractHrefs(source) {
  return [...source.matchAll(/href:\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(fullPath);
      }
      return [fullPath];
    }),
  );
  return files.flat();
}

async function checkNavigation() {
  const source = await fs.readFile(navigationFile, "utf8");
  const hrefs = extractHrefs(source);

  const unique = new Set();
  const duplicates = new Set();

  for (const href of hrefs) {
    if (unique.has(href)) {
      duplicates.add(href);
    } else {
      unique.add(href);
    }
  }

  const missingPages = [];
  for (const href of unique) {
    const expected = normalizeRouteToPagePath(href);
    // Navigation should only point to concrete pages.
    if (!(await fileExists(expected))) {
      missingPages.push({ href, expected });
    }
  }

  return {
    passed: duplicates.size === 0 && missingPages.length === 0,
    duplicates: [...duplicates],
    missingPages,
    routeCount: unique.size,
  };
}

function collectMatches(text, pattern) {
  const matches = [];
  let match = pattern.exec(text);
  while (match) {
    matches.push(match[0]);
    match = pattern.exec(text);
  }
  return matches;
}

async function checkColors() {
  const files = await listFilesRecursive(srcDir);
  const codeFiles = files.filter((file) => /\.(ts|tsx|css)$/.test(file));
  const violations = [];

  for (const filePath of codeFiles) {
    const content = await fs.readFile(filePath, "utf8");
    const hits = bannedColorPatterns
      .flatMap((pattern) => collectMatches(content, pattern))
      .filter(Boolean);

    if (hits.length > 0) {
      const uniqueHits = [...new Set(hits)];
      violations.push({
        filePath: path.relative(root, filePath),
        hits: uniqueHits,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    scanned: codeFiles.length,
  };
}

async function checkRedirectCycles() {
  const nextConfigPath = path.join(root, "next.config.mjs");
  const source = await fs.readFile(nextConfigPath, "utf8");
  const redirects = [
    ...source.matchAll(
      /source:\s*["']([^"']+)["'][\s\S]*?destination:\s*["']([^"']+)["']/g,
    ),
  ].map(([, from, to]) => ({ from, to }));
  const destinations = new Map(redirects.map(({ from, to }) => [from, to]));
  const cycles = [];

  for (const start of destinations.keys()) {
    const visited = new Set();
    let current = start;
    while (destinations.has(current)) {
      if (visited.has(current)) {
        cycles.push([...visited, current]);
        break;
      }
      visited.add(current);
      current = destinations.get(current);
    }
  }

  return { passed: cycles.length === 0, cycles, scanned: redirects.length };
}

function printNavigationReport(result) {
  console.log("Navigation Gate");
  console.log(`- Routes in navigation: ${result.routeCount}`);
  if (result.duplicates.length > 0) {
    console.log("- Duplicate href values detected:");
    result.duplicates.forEach((href) => console.log(`  • ${href}`));
  }
  if (result.missingPages.length > 0) {
    console.log("- Missing page files for configured href:");
    result.missingPages.forEach(({ href, expected }) =>
      console.log(`  • ${href} -> ${path.relative(root, expected)}`),
    );
  }
  if (result.passed) {
    console.log("- OK");
  }
  console.log("");
}

function printColorReport(result) {
  console.log("Color Gate");
  console.log(`- Files scanned: ${result.scanned}`);
  if (result.violations.length > 0) {
    console.log("- Banned colors/classes found:");
    result.violations.forEach((violation) => {
      console.log(`  • ${violation.filePath}: ${violation.hits.join(", ")}`);
    });
  }
  if (result.passed) {
    console.log("- OK");
  }
  console.log("");
}

function printRedirectReport(result) {
  console.log("Redirect Cycle Gate");
  console.log(`- Redirects scanned: ${result.scanned}`);
  result.cycles.forEach((cycle) =>
    console.log(`  • cycle: ${cycle.join(" -> ")}`),
  );
  if (result.passed) console.log("- OK");
  console.log("");
}

// Une feature n'importe une AUTRE feature que par son barrel (@/features/<x>),
// jamais ses internes (@/features/<x>/components|api|types/...).
async function checkFeatureIsolation() {
  const featuresDir = path.join(srcDir, "features");
  let features = [];
  try {
    features = (await fs.readdir(featuresDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return { passed: true, violations: [], scanned: 0 };
  }
  const violations = [];
  let scanned = 0;
  for (const feat of features) {
    const files = await listFilesRecursive(path.join(featuresDir, feat));
    for (const file of files) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      scanned += 1;
      const source = await fs.readFile(file, "utf8");
      const re = /@\/features\/([\w-]+)\/(?:components|api|types)\//g;
      let match;
      while ((match = re.exec(source)) !== null) {
        if (match[1] !== feat) {
          violations.push({
            file: path.relative(root, file),
            target: match[1],
          });
        }
      }
    }
  }
  return { passed: violations.length === 0, violations, scanned };
}

function printFeatureIsolationReport(result) {
  console.log("Feature Isolation Gate");
  console.log(`- Files scanned: ${result.scanned}`);
  if (result.violations.length > 0) {
    console.log(
      "- Import profond cross-feature (passe par le barrel @/features/<x>):",
    );
    result.violations.forEach((v) =>
      console.log(`  • ${v.file} -> @/features/${v.target}/internals`),
    );
  }
  if (result.passed) {
    console.log("- OK");
  }
  console.log("");
}

async function main() {
  const runNavigation = mode === "all" || mode === "navigation";
  const runColors = mode === "all" || mode === "colors";
  const runIsolation = mode === "all" || mode === "isolation";
  const runRedirects = mode === "all" || mode === "redirects";

  if (!runNavigation && !runColors && !runIsolation && !runRedirects) {
    console.error(
      "Usage: node scripts/quality-gates.mjs [all|navigation|colors|isolation|redirects]",
    );
    process.exit(1);
  }

  const results = [];

  if (runNavigation) {
    const navigation = await checkNavigation();
    printNavigationReport(navigation);
    results.push(navigation.passed);
  }

  if (runColors) {
    const colors = await checkColors();
    printColorReport(colors);
    results.push(colors.passed);
  }

  if (runIsolation) {
    const isolation = await checkFeatureIsolation();
    printFeatureIsolationReport(isolation);
    results.push(isolation.passed);
  }

  if (runRedirects) {
    const redirects = await checkRedirectCycles();
    printRedirectReport(redirects);
    results.push(redirects.passed);
  }

  if (results.every(Boolean)) {
    console.log("All requested quality gates passed.");
    process.exit(0);
  }

  console.error("Quality gate failure detected. Fix the issues above.");
  process.exit(1);
}

await main();
