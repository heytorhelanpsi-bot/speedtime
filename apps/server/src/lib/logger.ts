import pino from 'pino';
import { config } from './config.js';

/** Logs estruturados em JSON (um objeto por linha). */
export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME ?? (/worker/.test(process.argv[1] ?? '') ? 'speedtime-worker' : 'speedtime-api') },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', '*.password', '*.token'],
});
export type Logger = typeof logger;
