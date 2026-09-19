import type { MetadataRoute } from "next";

const publicSiteUrl =
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://sovrack.tech";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/register", "/dashboard", "/staff", "/admin"],
    },
    sitemap: `${publicSiteUrl}/sitemap.xml`,
    host: publicSiteUrl,
  };
}
