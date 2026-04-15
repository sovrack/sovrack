import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  CONFIG_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  ANSIBLE_PLAYBOOKS_PATH: z.string(),
  ANSIBLE_SSH_KEY_PATH: z.string(),
  ANSIBLE_VENV_PATH: z.string(),
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
