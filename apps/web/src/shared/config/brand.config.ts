/**
 * Neutral brand configuration
 * Override via environment variables or apply-brand.ps1
 */
export const BRAND_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Sovrack',
  slug: process.env.NEXT_PUBLIC_APP_SLUG || 'sovrack',
  domain: process.env.NEXT_PUBLIC_APP_DOMAIN || 'sovrack.com',
  appUrl: process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || 'https://app.sovrack.com',
  staffUrl: process.env.NEXT_PUBLIC_STAFF_APP_URL || 'https://staff.sovrack.com',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'https://app.sovrack.com/backend-api',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'wss://app.sovrack.com/backend-api',
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/sovrack/sovrack',
  docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.sovrack.com',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@sovrack.com',
} as const;

export default BRAND_CONFIG;
