// Config en .mjs (pas .ts) : `next start` charge la config AU RUNTIME — en
// .ts il exige `typescript` dans l'image de prod (le runner fait
// `npm ci --omit=dev`) et tente un auto-install au boot → crash-loop du
// conteneur déployé. Découvert lors du déploiement réel complet.
// JSDoc garde l'autocomplétion/typage en dev sans dépendance runtime.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001',
    NEXT_PUBLIC_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || '',
    NEXT_PUBLIC_CUSTOMER_APP_URL: process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || '',
    NEXT_PUBLIC_STAFF_APP_URL: process.env.NEXT_PUBLIC_STAFF_APP_URL || '',
  },
  async rewrites() {
    // Dynamic runtime proxy is handled natively by src/app/backend-api/[...path]/route.ts
    return [];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // CSP : directives compatibles Next.js 15 (styles + scripts inline
            // nécessaires à l'hydratation) et WebSocket pour les logs temps réel.
            // En mode dev, Next.js Fast Refresh requiert 'unsafe-eval' pour évaluer les chunks.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              process.env.NODE_ENV === 'production'
                ? "script-src 'self' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*",
              "frame-src 'none'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_UPGRADE_INSECURE_REQUESTS === 'true' ? ["upgrade-insecure-requests"] : []),
            ].join('; '),
          },
        ],
      },
    ];
  },
  // Legacy routes unified elsewhere. Server-side redirects keep old bookmarks
  // working without shipping client-side redirect "stub" pages.
  async redirects() {
    return [
      { source: '/profile', destination: '/settings', permanent: true },
      { source: '/settings/profile', destination: '/settings', permanent: true },
      { source: '/admin/settings', destination: '/settings', permanent: true },
      { source: '/settings/terminal', destination: '/terminal', permanent: true },
      { source: '/deployments/new', destination: '/deployments', permanent: true },
      { source: '/projects/new', destination: '/projects', permanent: true },
    ];
  },
};

export default nextConfig;
