// Config en .mjs (pas .ts) : `next start` charge la config AU RUNTIME — en
// .ts il exige `typescript` dans l'image de prod (le runner fait
// `npm ci --omit=dev`) et tente un auto-install au boot → crash-loop du
// conteneur déployé. Découvert lors du déploiement réel complet.
// JSDoc garde l'autocomplétion/typage en dev sans dépendance runtime.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001',
  },
  async rewrites() {
    // Le proxy /backend-api tourne CÔTÉ SERVEUR Next : en déploiement
    // conteneurisé il doit joindre le backend par le réseau Docker interne
    // (alias stable, ex. http://backend:3001) — pas par le domaine public
    // (TLS self-signed/labo → undici rejette → « Internal Server Error » sur
    // TOUS les appels API de l'app, dont le client utilise /backend-api).
    // BACKEND_INTERNAL_URL est une variable RUNTIME du conteneur ; en dev
    // local le fallback NEXT_PUBLIC_API_URL (http://localhost:3001) suffit.
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3001';

    return [
      {
        source: '/backend-api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
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
            // Les images utilisateurs peuvent venir de sources distantes.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' ws: wss:",
              "frame-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
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
