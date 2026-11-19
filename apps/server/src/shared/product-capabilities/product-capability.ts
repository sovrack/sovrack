export const ProductCapabilities = {
  GOOGLE_AUTHENTICATION: 'googleAuthentication',
  MANAGED_INFRASTRUCTURE: 'managedInfrastructure',
  PERSISTENT_VOLUMES: 'persistentVolumes',
  SERVER_AUTOMATION: 'serverAutomation',
  SELF_SERVICE_BILLING: 'selfServiceBilling',
  SERVICE_TEMPLATES: 'serviceTemplates',
  DEPLOYMENT_ROLLBACK: 'deploymentStrategiesAndRollback',
} as const;

export type ProductCapability =
  (typeof ProductCapabilities)[keyof typeof ProductCapabilities];

/**
 * Server-authoritative V1 contract.
 * Planned capabilities stay unreachable even if a client calls the API
 * directly. Enabling one requires a reviewed backend change and tests.
 */
export const ENABLED_PRODUCT_CAPABILITIES = new Set<ProductCapability>([
  ProductCapabilities.SELF_SERVICE_BILLING,
  ProductCapabilities.GOOGLE_AUTHENTICATION,
  ProductCapabilities.SERVICE_TEMPLATES,
]);

export function isProductCapabilityEnabled(
  capability: ProductCapability,
): boolean {
  if (capability === ProductCapabilities.SELF_SERVICE_BILLING) {
    if (process.env.BILLING_ENABLED === 'false') return false;
    return true;
  }
  if (capability === ProductCapabilities.GOOGLE_AUTHENTICATION) {
    if (process.env.GOOGLE_AUTH_ENABLED === 'false') return false;
    return true;
  }
  return ENABLED_PRODUCT_CAPABILITIES.has(capability);
}
