import type { Metadata } from 'next';
import { ErrorBoundary } from '@/shared/common/error-boundary';
import { Providers } from '@/shared/providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'platform Deploy Platform',
  description: 'Deployment automation workspace powered by platform',
};

export const viewport = {
  width: 'device-width',
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
        var theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
        var root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        root.style.colorScheme = theme;
      } catch (_error) {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
      }
    })();
  `;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
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
