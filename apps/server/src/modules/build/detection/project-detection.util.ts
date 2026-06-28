// Pure detection helpers extracted from BuildDetectorService (P2 split).
// No I/O, no `this` — operate on already-fetched repo file signals → unit-testable.

export type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

export type ParsedProjectSignals = {
  packageJson: PackageJson | null;
  requirementsTxt: string | null;
  pyprojectToml: string | null;
  composerJson: string | null;
  goMod: string | null;
  pomXml: string | null;
  buildGradle: string | null;
  dockerfile: string | null;
  dockerCompose: string | null;
};

/** Safe JSON parse — returns null on empty or invalid input. */
export function parseJsonSafely<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Merge prod + dev dependency names into a single Set. */
export function mergeDependencies(
  packageJson: PackageJson | null,
): Set<string> {
  if (!packageJson) return new Set<string>();
  return new Set<string>([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
}

/** Detect the Node package manager from lockfiles / package.json presence. */
export function detectPackageManager(
  fileSet: Set<string>,
  signals: ParsedProjectSignals,
): string {
  if (fileSet.has('pnpm-lock.yaml')) return 'pnpm';
  if (fileSet.has('yarn.lock')) return 'yarn';
  if (fileSet.has('bun.lockb') || fileSet.has('bun.lock')) return 'bun';
  if (fileSet.has('package-lock.json')) return 'npm';
  if (signals.packageJson) return 'npm';
  return 'unknown';
}

/** Detect the Python package manager from lockfiles / project files. */
export function resolvePythonPackageManager(
  fileSet: Set<string>,
  signals: ParsedProjectSignals,
): string {
  if (fileSet.has('poetry.lock')) return 'poetry';
  if (fileSet.has('pipfile.lock') || fileSet.has('pipfile')) return 'pipenv';
  if (signals.pyprojectToml) return 'pip';
  if (signals.requirementsTxt) return 'pip';
  return 'unknown';
}

/** Case-insensitive "does raw contain any of these markers". */
export function containsAny(raw: string | null, markers: string[]): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return markers.some((marker) => lower.includes(marker.toLowerCase()));
}

/** True if a Dockerfile declares 2+ FROM stages (multi-stage build). */
export function isMultiStageDockerfile(raw: string | null): boolean {
  if (!raw) return false;
  const matches = raw.match(/^\s*from\s+/gim);
  return Boolean(matches && matches.length >= 2);
}
