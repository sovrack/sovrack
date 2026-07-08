/**
 * Shim for backward compatibility — re-exports from the canonical shared
 * location. All new code should import from `shared/webhook` directly.
 */
export type {
  IWebhookHandler,
  WebhookEndpointContext,
  WebhookHandleResult,
} from '../../../shared/webhook/webhook-handler.interface';
export { WEBHOOK_HANDLER } from '../../../shared/webhook/webhook-handler.interface';
