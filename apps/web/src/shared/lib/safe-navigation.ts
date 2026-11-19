/** Resolve a same-origin application path and reject external/open redirects. */
export function resolveSafeInternalPath(
  candidate: string | null | undefined,
  fallback: string,
): string {
  const value = candidate?.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://sovrack.local");
    if (parsed.origin !== "http://sovrack.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
