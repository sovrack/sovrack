import type { Metadata } from "next";
import { ErrorBoundary } from "@/shared/common/error-boundary";
import { Providers } from "@/shared/providers";
import "@/styles/globals.css";

const publicSiteUrl =
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://sovrack.com";

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: {
    default: "Sovrack — Déployez sur vos propres serveurs",
    template: "%s | Sovrack",
  },
  description:
    "Plateforme de déploiement et d'exploitation d'applications sur vos serveurs.",
  applicationName: "Sovrack",
  keywords: [
    "déploiement Docker",
    "VPS",
    "GitHub",
    "GitLab",
    "self-hosted",
    "CI/CD",
  ],
  authors: [{ name: "Sovrack", url: publicSiteUrl }],
  creator: "Sovrack",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: publicSiteUrl,
    siteName: "Sovrack",
    title: "Sovrack — Déployez sur vos propres serveurs",
    description:
      "Centralisez vos sources Git, VPS, déploiements Docker, domaines HTTPS et journaux opérationnels.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sovrack — Déployez sur vos propres serveurs",
    description:
      "Centralisez vos sources Git, VPS, déploiements Docker, domaines HTTPS et journaux opérationnels.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themeScript = `
    (function () {
      try {
        var key = 'sovrack-theme';
        var legacyKey = 'deploy-automation-theme';
        var saved = localStorage.getItem(key) || localStorage.getItem(legacyKey);
        var theme = saved === 'brand' || saved === 'light' || saved === 'dark' ? saved : 'brand';
        var root = document.documentElement;
        root.classList.remove('brand', 'light', 'dark');
        if (theme === 'brand') root.classList.add('dark', 'brand');
        else root.classList.add(theme);
        root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
      } catch (_error) {
        document.documentElement.classList.add('dark', 'brand');
        document.documentElement.style.colorScheme = 'dark';
      }
    })();
  `;

  return (
    <html lang="fr" className="dark brand" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="app-shell">
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
