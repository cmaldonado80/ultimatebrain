import { z } from 'zod'

/**
 * Server-side environment variable validation.
 *
 * Import `env` instead of reading `process.env` directly so that
 * missing or malformed values are caught at startup rather than
 * at request-time.
 */
const envSchema = z.object({
  // ── Database ────────────────────────────────────────────────
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),

  // ── Node ────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // ── Key Vault (required when encrypting/decrypting API keys) ─
  VAULT_SECRET: z.string().min(16, 'VAULT_SECRET must be at least 16 characters').optional(),

  // ── Brain identity ─────────────────────────────────────────
  BRAIN_VERSION: z.string().default('1.0.0'),
  BRAIN_NAME: z.string().default('UltimateBrain'),

  // ── Brain SDK ──────────────────────────────────────────────
  BRAIN_API_KEY: z.string().optional(),
  BRAIN_URL: z.string().url().optional(),

  // ── OpenClaw daemon ────────────────────────────────────────
  OPENCLAW_WS: z.string().url().optional(),

  // ── Observability ──────────────────────────────────────────
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

  // ── LLM provider keys (initial setup, stored encrypted) ───
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // ── Public (exposed to the browser via Next.js) ───────────
  NEXT_PUBLIC_API_BASE_URL: z.string().url().optional(),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(
      `❌ Invalid environment variables:\n${formatted}\n\nPlease check your .env.local file.`,
    )
  }

  return result.data
}

export const env = validateEnv()
