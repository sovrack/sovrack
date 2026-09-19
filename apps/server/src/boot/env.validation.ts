import { z } from 'zod';

const envSchema = z
  .object({
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
    // Secret d'authentification du back-office (staff). REQUIS et distinct de
    // JWT_SECRET : deux plans d'auth isolés — le fallback silencieux vers
    // JWT_SECRET a été supprimé (si JWT_SECRET fuitait, le staff serait compromis).
    STAFF_JWT_SECRET: z.string().min(32),
    STAFF_JWT_EXPIRES_IN: z.string().default('12h'),
    // Clé HMAC dédiée aux codes à usage unique (activation/récupération).
    // La séparer du JWT permet de renouveler l'une sans compromettre l'autre.
    STAFF_OTP_SECRET: z.string().min(32),
    // HMAC des codes de secours de la MFA client facultative. Cette clé est
    // indépendante des secrets JWT, staff et de chiffrement.
    CUSTOMER_MFA_SECRET: z.string().min(32),
    // Rôles qui doivent activer la MFA avant d'accéder aux opérations du
    // back-office. L'inscription initiale reste possible via les seules routes
    // d'enrôlement MFA.
    STAFF_MFA_REQUIRED_ROLES: z.string().default('ROOT,ADMIN'),

    // ── Auth cookie ──────────────────────────────────────────────────────────
    AUTH_COOKIE_NAME: z.string().optional(),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    AUTH_COOKIE_SECURE: z.string().optional(),
    AUTH_COOKIE_SAME_SITE: z.string().optional(),
    AUTH_COOKIE_MAX_AGE_MS: z.string().optional(),

    // ── CORS / frontend ──────────────────────────────────────────────────────
    FRONTEND_URL: z.url().default('http://localhost:3000'),
    FRONTEND_URLS: z.string().optional(),
    PUBLIC_SITE_URL: z.url().optional(),
    CUSTOMER_APP_URL: z.url().optional(),
    STAFF_APP_URL: z.url().optional(),
    HOST_PLANE_ENFORCEMENT: z.enum(['true', 'false']).optional(),
    // Exact hostnames/IPs allowed when a self-hosted Git provider is private.
    // Empty by default: localhost, RFC1918, link-local and metadata targets are
    // rejected to prevent SSRF.
    OUTBOUND_PRIVATE_HOST_ALLOWLIST: z.string().optional(),

    // ── Google OAuth (Se connecter avec Google) ───────────────────────────────
    // Optionnels : sans GOOGLE_CLIENT_ID/SECRET, la connexion Google est
    // désactivée (le login email/mot de passe reste pleinement fonctionnel).
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().optional(),

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
    // Réseau source autorisé à joindre l'API Docker mTLS des serveurs gérés.
    // Obligatoire au moment d'exécuter le rôle docker_tls.
    DOCKER_TLS_ALLOWED_CIDR: z
      .string()
      .regex(
        /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)\/(3[0-2]|[12]?\d)$/,
      )
      .optional(),

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

    // ── Email (factures, notifications de facturation) ───────────────────────
    // Optionnels : si absents, les mails de facturation sont désactivés
    // (le paiement est toujours possible depuis le dashboard).
    SMTP_CONFIG_SOURCE: z.enum(['database', 'environment']).optional(),
    SMTP_ENABLED: z.enum(['true', 'false']).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z
      .string()
      .regex(/^\d+$/)
      .refine((value) => Number(value) >= 1 && Number(value) <= 65_535, {
        message: 'SMTP_PORT doit être compris entre 1 et 65535',
      })
      .optional(),
    SMTP_SECURITY: z.enum(['none', 'starttls', 'tls']).optional(),
    SMTP_SECURE: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_TO: z.string().optional(),
    SMTP_ALLOWED_HOSTS: z.string().optional(),

    // ── Paiement (Stripe) ────────────────────────────────────────────────────
    // Optionnels : sans clé, le billing fonctionne en mode facturation manuelle
    // (factures PENDING → marquées PAID par l'admin).
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_FREE: z.string().optional(),
    STRIPE_PRICE_STARTER: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
    STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // Chaque usage cryptographique possède sa propre clé. Une égalité ou une
    // dérivation triviale par préfixe est refusée ici aussi, indépendamment du
    // preflight d'infrastructure, afin qu'un lancement manuel ne puisse pas
    // contourner cette séparation.
    const independentSecrets = [
      ['JWT_SECRET', env.JWT_SECRET],
      ['STAFF_JWT_SECRET', env.STAFF_JWT_SECRET],
      ['STAFF_OTP_SECRET', env.STAFF_OTP_SECRET],
      ['CUSTOMER_MFA_SECRET', env.CUSTOMER_MFA_SECRET],
      ['CONFIG_SECRET', env.CONFIG_SECRET],
    ] as const;

    for (let index = 0; index < independentSecrets.length; index += 1) {
      const [name, secret] = independentSecrets[index];
      for (
        let otherIndex = index + 1;
        otherIndex < independentSecrets.length;
        otherIndex += 1
      ) {
        const [otherName, otherSecret] = independentSecrets[otherIndex];
        if (
          secret === otherSecret ||
          secret.startsWith(otherSecret) ||
          otherSecret.startsWith(secret)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [otherName],
            message: `${otherName} doit être un secret indépendant de ${name}.`,
          });
        }
      }
    }

    if (
      env.SMTP_CONFIG_SOURCE === 'environment' &&
      env.SMTP_ENABLED === 'true'
    ) {
      if (!env.SMTP_HOST?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_HOST'],
          message: 'SMTP_HOST est requis quand SMTP est activé',
        });
      }
      if (!env.SMTP_FROM?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_FROM'],
          message: 'SMTP_FROM est requis quand SMTP est activé',
        });
      }
      if (env.SMTP_USER?.trim() && !env.SMTP_PASS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_PASS'],
          message: 'SMTP_PASS est requis avec SMTP_USER',
        });
      }
    }
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
