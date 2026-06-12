import { GitProviderType } from '@prisma/client';

/**
 * Resolved webhook endpoint context, handed to every {@link IWebhookHandler}.
 *
 * This is THE source of truth for identity. It is resolved O(1) from the
 * unique `webhookToken` in the public URL (`POST /webhooks/incoming/:token`)
 * — never re-derived from the payload. Handlers must use `projectId` /
 * `serviceEnvId` to know *who* the event belongs to, and the raw payload
 * only to know *what* happened (branch, commit, pipeline status…).
 *
 * Consequence: renaming a repo on the provider side never breaks routing,
 * because routing does not depend on the repo path at all.
 */
export interface WebhookEndpointContext {
  id: string;
  projectId: string;
  /** Bound ServiceEnvironment when the webhook targets a specific service/env. */
  serviceEnvId: string | null;
  provider: GitProviderType;
  isActive: boolean;
}

export type WebhookHandleResult = { status: 'ok' | 'ignored' };

/**
 * Provider-agnostic webhook reception contract. Each source provider
 * (GitLab, GitHub, future Bitbucket/Gitea…) implements ONE handler and
 * registers it under the {@link WEBHOOK_HANDLER} token. The unified
 * `IncomingWebhookController` picks the handler whose `provider` matches
 * the resolved endpoint — adding a provider means adding a handler, never
 * a new route or a new `switch` case.
 */
export interface IWebhookHandler {
  /** Discriminant used by the controller to route to this handler. */
  readonly provider: GitProviderType;

  /**
   * Process an incoming event for an already-resolved, active endpoint.
   * `options.verified` reports whether the controller could validate the
   * provider signature (reserved for future signature wiring; handlers
   * may log but should not hard-fail on `false` today).
   */
  handleIncoming(
    endpoint: WebhookEndpointContext,
    payload: Record<string, unknown>,
    options?: { verified: boolean; signatureError?: string },
  ): Promise<WebhookHandleResult>;
}

/**
 * DI token for the multi-provider webhook handler registry. Injected as
 * `@Inject(WEBHOOK_HANDLER) handlers: IWebhookHandler[]`.
 */
export const WEBHOOK_HANDLER = Symbol('WEBHOOK_HANDLER');
