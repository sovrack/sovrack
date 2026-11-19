import type { MetadataRoute } from "next";

const publicSiteUrl =
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://sovrack.tech";

const paths = [
  "",
  "/pricing",
  "/docs",
  "/status",
  "/security",
  "/legal",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path, index) => ({
    url: `${publicSiteUrl}${path}`,
    lastModified: new Date("2026-09-17"),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : path === "/docs" ? 0.8 : 0.6,
  }));
}
