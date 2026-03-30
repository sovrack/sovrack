import type { Metadata } from 'next';
import { Sora, IBM_Plex_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  weight: ['400', '500', '600', '700'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'DevOps Platform',
  description: 'Deployment automation platform for developers',
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
  return (
    <html lang="en">
      <body className={`${sora.variable} ${plexMono.variable} app-shell`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
