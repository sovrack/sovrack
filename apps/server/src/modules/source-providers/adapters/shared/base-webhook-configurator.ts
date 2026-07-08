import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import type { WebhookConfigResult } from '../../contracts/git-provider.contract';

/**
 * A provider hook normalized to the fields the shared flow needs: its id,
 * the URL it points to, and the current secret/token (used to detect if an
 * already-registered hook needs its secret updated).
 */
export interface NormalizedHook {
  id: number | string;
  url: string;
  /** Current secret/token configured on the provider side, if readable. */
  currentSecret?: string | null;
}

/**
 * Everything the shared flow needs to talk to ONE provider's hooks API:
 * a human label for logs, the hooks endpoint URL, and the auth headers.
 * Built per-provider by {@link BaseWebhookConfigurator.resolveContext}.
 */
export interface WebhookRequestContext {
  label: string;
  hooksUrl: string;
  headers: Record<string, string>;
}

/**
 * Shared webhook-registration flow for ALL Git providers (Template Method).
 *
 * This class owns the parts that MUST be identical everywhere and were,
 * historically, copy-pasted per provider — with each copy drifting:
 *   - GitLab had retry but NOT idempotence (blind POST → duplicate hooks).
 *   - GitHub had idempotence but NOT retry.
 * Centralising the flow here guarantees BOTH for every provider, and makes
 * a new provider a matter of implementing 3 small methods — it cannot forget
 * idempotence, because the base does it.
 *
 * The flow is strictly:
 *   1. resolveContext()      — provider-specific (where + how to reach the API)
 *   2. findExistingHook()    — SHARED: GET hooks, match by URL → reuse if found
 *   3. createHook() w/ retry — provider-specific create, shared retry/backoff
 *
 * Concrete providers implement only {@link resolveContext}, {@link listHooks}
 * and {@link createHook}; they may override {@link retryConfig},
 * {@link isRetryable} and {@link mapError} for provider-specific behaviour.
 */
export abstract class BaseWebhookConfigurator {
  protected abstract readonly logger: Logger;

  protected constructor(protected readonly http: HttpService) {}

  // ─── Provider-specific hooks (must implement) ──────────────────────────────

  /** Resolve the repo + credentials into a ready-to-use request context. */
  protected abstract resolveContext(
    projectId: string,
    serviceId?: string,
  ): Promise<WebhookRequestContext>;

  /** List existing hooks, normalized to {@link NormalizedHook} (id + url). */
  protected abstract listHooks(
    ctx: WebhookRequestContext,
  ): Promise<NormalizedHook[]>;

  /** Create the hook on the provider, returning its id. */
  protected abstract createHook(
    ctx: WebhookRequestContext,
    webhookUrl: string,
    secret: string,
  ): Promise<number | string>;

  // ─── Provider-specific hooks (optional overrides) ──────────────────────────

  /** Retry policy for the create call. Default: single attempt (no retry). */
  protected retryConfig(): { maxAttempts: number; baseDelayMs: number } {
    return { maxAttempts: 1, baseDelayMs: 0 };
  }

  /** Whether a create error is worth retrying. Default: never. */
  protected isRetryable(_err: unknown): boolean {
    return false;
  }

  /** Translate a fatal create error into a user-facing exception. */
  protected mapError(err: unknown): never {
    throw err instanceof Error ? err : new Error(String(err));
  }

  /**
   * Update the secret on an existing hook. Override per-provider when the
   * provider's API supports updating a hook's secret (GitLab: PUT, GitHub:
   * PATCH). Default no-op — existing hooks keep their current secret.
   */
  protected async updateHookSecret(
    _ctx: WebhookRequestContext,
    _hookId: number | string,
    _secret: string,
  ): Promise<void> {
    // no-op by default
  }

  // ─── Shared template method ────────────────────────────────────────────────

  /**
   * Register (or reuse) a webhook for `webhookUrl`. IDEMPOTENT by design:
   * an existing hook with the same URL is reused, never duplicated — so this
   * is safe to call any number of times (e.g. repeated "Re-register" clicks).
   *
   * When a hook already exists AND the provider returns its current secret
   * (via {@link NormalizedHook.currentSecret}), the secret is synchronised
   * automatically — this fixes the historic bug where old hooks retained a
   * stale token (e.g. `webhookToken` UUID instead of the proper secret).
   */
  async configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
    serviceId?: string,
  ): Promise<WebhookConfigResult> {
    const ctx = await this.resolveContext(projectId, serviceId);

    const existing = await this.findExistingHookWithSecret(ctx, webhookUrl);
    if (existing !== null) {
      if (existing.currentSecret !== secret) {
        await this.updateHookSecret(ctx, existing.id, secret);
        this.logger.log(
          `Webhook secret updated (hookId=${existing.id}) for ${ctx.label}.`,
        );
      } else {
        this.logger.log(
          `Webhook already registered with correct secret (hookId=${existing.id}) for ${ctx.label} — reusing (idempotent).`,
        );
      }
      return { hookId: existing.id, url: webhookUrl };
    }

    const { maxAttempts, baseDelayMs } = this.retryConfig();
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const hookId = await this.createHook(ctx, webhookUrl, secret);
        this.logger.log(`Webhook created (hookId=${hookId}) for ${ctx.label}.`);
        return { hookId, url: webhookUrl };
      } catch (err: unknown) {
        lastErr = err;
        if (attempt < maxAttempts && this.isRetryable(err)) {
          const backoff = baseDelayMs * attempt;
          this.logger.warn(
            `Webhook create attempt ${attempt}/${maxAttempts} for ${ctx.label} failed. Retrying in ${backoff}ms…`,
          );
          await this.sleep(backoff);
          continue;
        }
        this.mapError(err);
      }
    }
    // Unreachable: the loop always returns or mapError throws.
    return this.mapError(lastErr);
  }

  /**
   * SHARED idempotence check: list the provider's hooks and return the first
   * one already pointing at `webhookUrl`, including its current secret so the
   * caller can decide whether to sync it. Best-effort — a listing failure
   * returns null so the caller falls through to create (never worse than
   * before, and the provider's own create-side dedup, if any, still applies).
   */
  protected async findExistingHookWithSecret(
    ctx: WebhookRequestContext,
    webhookUrl: string,
  ): Promise<NormalizedHook | null> {
    try {
      const hooks = await this.listHooks(ctx);
      return hooks.find((h) => h.url === webhookUrl) ?? null;
    } catch {
      return null;
    }
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
