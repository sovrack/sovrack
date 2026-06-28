import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001',
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    return [
      {
        source: '/backend-api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
  // Legacy routes unified elsewhere. Server-side redirects keep old bookmarks
  // working without shipping client-side redirect "stub" pages.
  async redirects() {
    return [
      { source: '/profile', destination: '/settings', permanent: true },
      { source: '/settings/profile', destination: '/settings', permanent: true },
      { source: '/settings/account', destination: '/settings', permanent: true },
      { source: '/admin/settings', destination: '/settings', permanent: true },
      { source: '/settings/terminal', destination: '/terminal', permanent: true },
      { source: '/deployments/new', destination: '/deployments', permanent: true },
      { source: '/projects/new', destination: '/projects', permanent: true },
    ];
  },
};

export default nextConfig;
