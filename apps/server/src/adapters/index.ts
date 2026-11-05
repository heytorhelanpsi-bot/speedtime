import type { Config } from '../lib/config.js';
import { aliexpressAdapter } from './aliexpress.js';
import { amazonAdapter } from './amazon.js';
import { genericAdapter, structuredDataStore } from './generic.js';
import { mercadoLivreAdapter } from './mercadolivre.js';
import { shopeeAdapter } from './shopee.js';
import { AdapterError, type StoreAdapter } from './types.js';

// Temu e Shein não oferecem API pública de preços; usam o parser genérico.
// Ambas costumam bloquear acesso automatizado — o item aparece como "não foi possível verificar".
const temuAdapter = structuredDataStore('temu', 'Temu', /(^|\.)temu\.com$/i, 'A Temu não publica preço em dados estruturados para robôs');
const sheinAdapter = structuredDataStore('shein', 'Shein', /(^|\.)shein\.[a-z.]+$/i, 'A Shein não publica preço em dados estruturados para robôs');

/** Ordem importa: específicos primeiro, genérico por último. */
export const adapters: StoreAdapter[] = [
  mercadoLivreAdapter,
  amazonAdapter,
  shopeeAdapter,
  aliexpressAdapter,
  temuAdapter,
  sheinAdapter,
  genericAdapter,
];

export function parseProductUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AdapterError('unsupported_url', 'Link inválido');
  }
  if (!/^https?:$/.test(url.protocol)) throw new AdapterError('unsupported_url', 'Use um link http(s)');
  return url;
}

export function resolveAdapter(url: URL): StoreAdapter {
  return adapters.find((a) => a.matches(url))!;
}

export function adapterById(id: string): StoreAdapter {
  return adapters.find((a) => a.id === id) ?? genericAdapter;
}

export function describeStores(config: Config) {
  return adapters.map((a) => ({
    id: a.id,
    name: a.name,
    official: a.official,
    configured: a.isConfigured ? a.isConfigured(config) : true,
  }));
}

export { AdapterError };
