import webpush from 'web-push';
import { config } from './config.js';
import { query } from './db.js';
import { logger } from './logger.js';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keys: VapidKeys | null = null;

/**
 * Carrega as chaves do Web Push: das variáveis de ambiente, se definidas;
 * senão, do banco — gerando um par na primeira execução. API e worker leem o mesmo par.
 */
export async function initVapid(): Promise<VapidKeys | null> {
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    keys = { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY };
  } else {
    try {
      const generated = webpush.generateVAPIDKeys();
      await query(`INSERT INTO app_secrets (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING`, [JSON.stringify(generated)]);
      const { rows } = await query(`SELECT value FROM app_secrets WHERE name = 'vapid'`);
      keys = JSON.parse(rows[0].value);
    } catch (err) {
      logger.warn({ err }, 'não foi possível preparar as chaves do Web Push');
      keys = null;
    }
  }
  if (keys) webpush.setVapidDetails(config.VAPID_SUBJECT, keys.publicKey, keys.privateKey);
  return keys;
}

export const getVapid = () => keys;
