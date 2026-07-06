import { z } from 'zod';

const envSchema = z.object({
  // ── App ──────────────────────────────────────────────────────────────────
  PORT: z.string().default('3001'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // ── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.string(),

  // ── Secrets ──────────────────────────────────────────────────────────────
  CONFIG_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // ── Auth cookie ──────────────────────────────────────────────────────────
  AUTH_COOKIE_NAME: z.string().optional(),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_COOKIE_SECURE: z.string().optional(),
  AUTH_COOKIE_SAME_SITE: z.string().optional(),
  AUTH_COOKIE_MAX_AGE_MS: z.string().optional(),

  // ── CORS / frontend ──────────────────────────────────────────────────────
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  FRONTEND_URLS: z.string().optional(),

  // ── Redis (required — BullMQ + distributed rate-limiting) ────────────────
  REDIS_URL: z.string(),

  // ── Reverse proxy ────────────────────────────────────────────────────────
  TRUST_PROXY: z.string().optional(),

  // ── GitLab webhooks ──────────────────────────────────────────────────────
  GITLAB_WEBHOOK_AUTO_CONFIGURE: z.string().optional(),
  GITLAB_WEBHOOK_MAX_RETRIES: z.string().optional(),
  GITLAB_WEBHOOK_RETRY_DELAY_MS: z.string().optional(),
  WEBHOOK_URL: z.string().optional(),

  // ── Ansible ──────────────────────────────────────────────────────────────
  // Optionnels : défaut sûr (ansible/playbooks embarqués dans le backend) ;
  // venv = dev only → en prod repli auto sur l'ansible système de l'image.
  ANSIBLE_PLAYBOOKS_PATH: z.string().optional(),
  ANSIBLE_SSH_KEY_PATH: z.string().optional(),
  ANSIBLE_VENV_PATH: z.string().optional(),
  ANSIBLE_STRICT_HOST_KEY_CHECKING: z.string().optional(),
  ANSIBLE_KNOWN_HOSTS_PATH: z.string().optional(),
  ANSIBLE_HOST_KEY_TRUST_ON_FIRST_USE: z.string().optional(),

  // ── Server preparation ───────────────────────────────────────────────────
  SERVER_JOB_TIMEOUT_MS: z.string().optional(),
  SERVER_SETUP_TIMEOUT_MS: z.string().optional(),
  SERVER_AUTO_CONFIGURE_SUDOERS: z.string().optional(),
  SERVER_LEGACY_API_ENABLED: z.string().optional(),
  SERVER_LEGACY_API_SUNSET_DATE: z.string().optional(),

  // ── Deployment health-check ──────────────────────────────────────────────
  DEPLOY_HEALTHCHECK_ENABLED: z.string().optional(),
  DEPLOY_HEALTHCHECK_TIMEOUT_MS: z.string().optional(),
  DEPLOY_HEALTHCHECK_RETRIES: z.string().optional(),
  DEPLOY_HEALTHCHECK_RETRY_DELAY_MS: z.string().optional(),
  DEPLOY_STARTUP_GRACE_MS: z.string().optional(),
  DEPLOY_HEALTHCHECK_INTERVAL_MS: z.string().optional(),
  DEPLOY_HEALTHCHECK_CONSECUTIVE: z.string().optional(),

  // ── Timeouts ─────────────────────────────────────────────────────────────
  DEPLOYMENT_ANSIBLE_TIMEOUT_MS: z.string().default('900000'),
  AUTOMATION_TARGET_TIMEOUT_MS: z.string().optional(),
  TERMINAL_SSH_INACTIVITY_TIMEOUT_MS: z.string().optional(),
  DOCKER_BUILD_TIMEOUT_MS: z.string().default('900000'), // 15 min
  DOCKER_PULL_TIMEOUT_MS: z.string().default('300000'), // 5 min
});

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);

  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues
    .map((issue) => {
      const path = issue.path.join('.') || 'env';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

  throw new Error(`Configuration .env invalide: ${details}`);
}
