import { z } from 'zod';

const envSchema = z.object({
  // Servidor
  PORT: z.coerce.number().int().positive().default(5001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // BD
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL es obligatoria'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET debe tener al menos 32 caracteres'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  ADMIN_EMAILS: z
    .string()
    .min(1, 'ADMIN_EMAILS es obligatoria')
    .transform((val) =>
      val
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    )
    .pipe(z.array(z.string().email()).min(1, 'Al menos un email admin')),

  // CORS
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((val) => val.split(',').map((o) => o.trim()).filter((o) => o.length > 0)),

  // Swagger UI
  SWAGGER_USER: z.string().min(1).default('admin'),
  SWAGGER_PASS: z.string().min(8, 'SWAGGER_PASS debe tener al menos 8 caracteres'),

  // Negocio
  TIMEZONE: z.string().default('Atlantic/Canary'),

  // Telegram (opcional en Fase A)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`\n[env] Variables de entorno inválidas:\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
