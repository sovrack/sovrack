import type { Metadata } from "next";
import { ErrorBoundary } from "@/shared/common/error-boundary";
import { Providers } from "@/shared/providers";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Sovrack",
  description:
    "Plateforme de déploiement et d'exploitation d'applications sur vos serveurs.",
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
        var key = 'deploy-automation-theme';
        var saved = localStorage.getItem(key);
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
