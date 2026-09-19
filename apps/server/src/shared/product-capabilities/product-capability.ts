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
export const ENABLED_PRODUCT_CAPABILITIES = new Set<ProductCapability>();

export function isProductCapabilityEnabled(
  capability: ProductCapability,
): boolean {
  return ENABLED_PRODUCT_CAPABILITIES.has(capability);
}
