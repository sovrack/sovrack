import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  CONFIG_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  AUTH_COOKIE_NAME: z.string().optional(),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_COOKIE_SECURE: z.string().optional(),
  AUTH_COOKIE_SAME_SITE: z.string().optional(),
  AUTH_COOKIE_MAX_AGE_MS: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  // Optionnels : défaut sûr (ansible/playbooks embarqués dans le backend) ;
  // venv = dev only → en prod repli auto sur l'ansible système de l'image.
  ANSIBLE_PLAYBOOKS_PATH: z.string().optional(),
  ANSIBLE_SSH_KEY_PATH: z.string().optional(),
  ANSIBLE_VENV_PATH: z.string().optional(),
  ANSIBLE_STRICT_HOST_KEY_CHECKING: z.string().optional(),
  ANSIBLE_KNOWN_HOSTS_PATH: z.string().optional(),
  ANSIBLE_HOST_KEY_TRUST_ON_FIRST_USE: z.string().optional(),
  SERVER_PREPARATION_TIMEOUT_MS: z.string().optional(),
  SERVER_AUTO_CONFIGURE_SUDOERS: z.string().optional(),
  SERVER_LEGACY_API_ENABLED: z.string().optional(),
  SERVER_LEGACY_API_SUNSET_DATE: z.string().optional(),
  DEPLOY_HEALTHCHECK_ENABLED: z.string().optional(),
  DEPLOY_HEALTHCHECK_TIMEOUT_MS: z.string().optional(),
  DEPLOY_HEALTHCHECK_RETRIES: z.string().optional(),
  DEPLOY_HEALTHCHECK_RETRY_DELAY_MS: z.string().optional(),
  DEPLOY_STARTUP_GRACE_MS: z.string().optional(),
  DEPLOY_HEALTHCHECK_INTERVAL_MS: z.string().optional(),
  DEPLOY_HEALTHCHECK_CONSECUTIVE: z.string().optional(),
  DEPLOYMENT_ANSIBLE_TIMEOUT_MS: z.string().default('900000'), // 15 minutes default
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
