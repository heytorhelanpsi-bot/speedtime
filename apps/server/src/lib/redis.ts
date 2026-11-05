import { Redis } from 'ioredis';
import { config } from './config.js';

/** Conexão compartilhada (comandos comuns). BullMQ exige maxRetriesPerRequest=null. */
export function createRedis() {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}
export const redis = createRedis();

export const channels = {
  userEvents: (userId: string) => `events:user:${userId}`,
};
