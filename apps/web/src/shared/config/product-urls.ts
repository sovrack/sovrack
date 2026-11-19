function normalizeOrigin(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export const productUrls = {
  publicSite: normalizeOrigin(process.env.NEXT_PUBLIC_PUBLIC_SITE_URL),
  customerApp: normalizeOrigin(process.env.NEXT_PUBLIC_CUSTOMER_APP_URL),
  staffApp: normalizeOrigin(process.env.NEXT_PUBLIC_STAFF_APP_URL),
};

export function publicSitePath(path = "/"): string {
  return productUrls.publicSite ? `${productUrls.publicSite}${path}` : path;
}

export function customerAppPath(path = "/"): string {
  return productUrls.customerApp ? `${productUrls.customerApp}${path}` : path;
}

export function staffAppPath(path = "/staff"): string {
  return productUrls.staffApp ? `${productUrls.staffApp}${path}` : path;
}
