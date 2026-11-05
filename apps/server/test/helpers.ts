import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import type { AdapterContext, HttpClient, HttpResponse } from '../src/adapters/types.js';
import { config } from '../src/lib/config.js';

export const fixture = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');
export const silentLog = pino({ level: 'silent' });

/** HttpClient falso: responde por prefixo de URL e registra as chamadas. */
export function fakeHttp(routes: Record<string, Partial<HttpResponse> | ((url: string, init?: any) => Partial<HttpResponse>)>) {
  const calls: { url: string; init?: any }[] = [];
  const http: HttpClient = {
    async request(url, init) {
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.startsWith(k));
      if (!key) throw new Error(`rota não mapeada no teste: ${url}`);
      const r = routes[key];
      const res = typeof r === 'function' ? r(url, init) : r;
      return { status: 200, url, text: '', headers: {}, ...res };
    },
  };
  return { http, calls };
}

export function ctx(http: HttpClient, overrides: Partial<typeof config> = {}): AdapterContext {
  return { http, config: { ...config, ...overrides }, log: silentLog };
}

/** Redis mínimo em memória para testar o cliente HTTP. */
export function fakeRedis() {
  const store = new Map<string, { v: string; exp: number }>();
  const alive = (k: string) => {
    const e = store.get(k);
    if (e && e.exp && e.exp < Date.now()) store.delete(k);
    return store.get(k);
  };
  return {
    store,
    async get(k: string) { return alive(k)?.v ?? null; },
    async set(k: string, v: string, ...args: any[]) {
      let exp = 0;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === 'EX') exp = Date.now() + args[i + 1] * 1000;
        if (args[i] === 'PX') exp = Date.now() + args[i + 1];
      }
      if (args.includes('NX') && alive(k)) return null;
      store.set(k, { v, exp });
      return 'OK';
    },
    async pttl(k: string) { const e = alive(k); return e ? Math.max(e.exp - Date.now(), 0) : -2; },
  } as any;
}
