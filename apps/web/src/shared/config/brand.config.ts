/**
 * Neutral brand configuration
 * Override via environment variables or apply-brand.ps1
 */
export const BRAND_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Platform',
  slug: process.env.NEXT_PUBLIC_APP_SLUG || 'platform',
  domain: process.env.NEXT_PUBLIC_APP_DOMAIN || 'example.com',
  appUrl: process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || 'https://app.example.com',
  staffUrl: process.env.NEXT_PUBLIC_STAFF_APP_URL || 'https://staff.example.com',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'https://app.example.com/backend-api',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'wss://app.example.com/backend-api',
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/platform-org/platform',
  docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.example.com',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@example.com',
} as const;

export default BRAND_CONFIG;
