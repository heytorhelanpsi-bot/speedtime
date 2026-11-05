import 'dotenv/config';
import { z } from 'zod';

const optional = z.string().trim().min(1).optional().catch(undefined);
const bool = (def: 'true' | 'false') => z.enum(['true', 'false']).default(def).transform((v) => v === 'true');

// No Render, RENDER_EXTERNAL_URL é a URL pública do serviço (ex.: https://speedtime.onrender.com)
const publicUrl = process.env.RENDER_EXTERNAL_URL ?? process.env.PUBLIC_URL;

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/speedtime'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-please'),
  WEB_ORIGIN: z.string().default(publicUrl ? `${publicUrl},http://localhost:5173` : 'http://localhost:5173'),
  APP_URL: z.string().default(publicUrl ?? 'http://localhost:5173'),
  /** true = o processo da API também roda o worker (deploy com um único serviço). */
  RUN_WORKER: bool('false'),
  /** true = aplica as migrações do banco ao iniciar a API. */
  AUTO_MIGRATE: bool('true'),

  // Coleta
  FETCH_MIN_HOST_INTERVAL_MS: z.coerce.number().default(5000),
  FETCH_CACHE_TTL_S: z.coerce.number().default(300),
  FETCH_TIMEOUT_MS: z.coerce.number().default(15000),
  FETCH_RESPECT_ROBOTS: bool('true'),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  ALERT_REARM_HYSTERESIS: z.coerce.number().default(0.005),

  // Web Push
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: z.string().default('mailto:admin@speedtime.app'),

  // E-mail (Resend)
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default('SpeedTime <alertas@speedtime.app>'),

  // Telegram
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_BOT_USERNAME: optional,
  TELEGRAM_WEBHOOK_SECRET: optional,

  // Lojas
  ML_ACCESS_TOKEN: optional,
  AMAZON_PAAPI_ACCESS_KEY: optional,
  AMAZON_PAAPI_SECRET_KEY: optional,
  AMAZON_PARTNER_TAG: optional,
  AMAZON_PAAPI_HOST: z.string().default('webservices.amazon.com.br'),
  AMAZON_PAAPI_REGION: z.string().default('us-east-1'),
  AMAZON_MARKETPLACE: z.string().default('www.amazon.com.br'),
  SHOPEE_AFFILIATE_APP_ID: optional,
  SHOPEE_AFFILIATE_SECRET: optional,
  SHOPEE_AFFILIATE_ENDPOINT: z.string().default('https://open-api.affiliate.shopee.com.br/graphql'),
  ALIEXPRESS_APP_KEY: optional,
  ALIEXPRESS_APP_SECRET: optional,
  ALIEXPRESS_TRACKING_ID: optional,
});

export type Config = z.infer<typeof schema>;
export const config: Config = schema.parse(process.env);

if (config.NODE_ENV === 'production' && config.JWT_SECRET === 'dev-secret-change-me-please') {
  throw new Error('JWT_SECRET precisa ser definido em produção');
}
