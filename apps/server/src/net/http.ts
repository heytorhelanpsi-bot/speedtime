import robotsParser from 'robots-parser';
import type { Redis } from 'ioredis';
import { AdapterError, type HttpClient, type HttpRequest, type HttpResponse } from '../adapters/types.js';
import type { Config } from '../lib/config.js';
import type { Logger } from '../lib/logger.js';

const BOT_NAME = 'SpeedTimeBot';

// Pequeno conjunto de User-Agents reais, rotacionados de forma moderada (um por host/hora).
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
];

export function pickUserAgent(host: string, now = Date.now()) {
  const hour = Math.floor(now / 3_600_000);
  let h = hour;
  for (const c of host) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${USER_AGENTS[h % USER_AGENTS.length]} ${BOT_NAME}/1.0`;
}

/** Sinais de captcha / anti-bot. Nunca tentamos contornar: apenas reportamos "blocked". */
const BLOCK_MARKERS = [
  /captcha/i,
  /are you a robot/i,
  /verifique que você não é um robô/i,
  /access denied/i,
  /cf-chl-|challenge-platform/i,
  /perimeterx|px-captcha/i,
  /datadome/i,
];

export function looksBlocked(status: number, body: string) {
  if (status === 403 || status === 429 || status === 503) return true;
  if (status === 200 && body.length < 200_000) {
    // páginas de bloqueio são pequenas e não têm dados de produto
    const hasProductData = /application\/ld\+json|og:price|product:price/i.test(body);
    return !hasProductData && BLOCK_MARKERS.some((re) => re.test(body));
  }
  return false;
}

export interface HttpClientDeps {
  redis: Redis;
  config: Config;
  log: Logger;
  fetchImpl?: typeof fetch;
}

/**
 * Cliente HTTP "educado":
 *  - respeita robots.txt (cache de 24h);
 *  - intervalo mínimo entre requisições ao mesmo host (lock no Redis, vale para todos os workers);
 *  - cache de respostas (vários usuários monitorando o mesmo link geram uma só requisição);
 *  - timeout e detecção de bloqueio.
 */
export function createHttpClient({ redis, config, log, fetchImpl = fetch }: HttpClientDeps): HttpClient {
  async function rawFetch(url: string, req: HttpRequest, ua: string) {
    try {
      const res = await fetchImpl(url, {
        method: req.method ?? 'GET',
        body: req.body,
        redirect: 'follow',
        signal: AbortSignal.timeout(config.FETCH_TIMEOUT_MS),
        headers: {
          'user-agent': ua,
          accept: req.api ? 'application/json' : 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
          ...req.headers,
        },
      });
      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k] = v));
      return { status: res.status, url: res.url || url, text, headers } satisfies HttpResponse;
    } catch (err: any) {
      const reason = err?.name === 'TimeoutError' ? 'tempo esgotado' : err?.cause?.code ?? err?.message ?? 'erro de rede';
      throw new AdapterError('network', `Falha de rede: ${reason}`);
    }
  }

  async function robotsAllows(target: URL, ua: string) {
    if (!config.FETCH_RESPECT_ROBOTS) return true;
    const key = `robots:${target.origin}`;
    let body = await redis.get(key);
    if (body === null) {
      try {
        const res = await rawFetch(`${target.origin}/robots.txt`, { api: true }, ua);
        // 4xx = sem restrições; 5xx = trata como "tudo bloqueado" por precaução (RFC 9309)
        body = res.status >= 500 ? 'User-agent: *\nDisallow: /' : res.status >= 400 ? '' : res.text;
      } catch {
        body = ''; // falha de rede ao buscar robots: não bloqueia, a requisição principal reporta o erro
      }
      await redis.set(key, body, 'EX', 86_400);
    }
    const robots = robotsParser(`${target.origin}/robots.txt`, body);
    return robots.isAllowed(target.toString(), BOT_NAME) !== false;
  }

  async function acquireHostSlot(host: string) {
    const key = `ratelimit:host:${host}`;
    const ok = await redis.set(key, '1', 'PX', config.FETCH_MIN_HOST_INTERVAL_MS, 'NX');
    if (ok) return;
    const ttl = await redis.pttl(key);
    throw new AdapterError('rate_limited', `Aguardando intervalo mínimo para ${host}`, Math.max(ttl, 250));
  }

  return {
    async request(url, req = {}) {
      const target = new URL(url);
      const ua = req.api ? `${BOT_NAME}/1.0 (+${config.APP_URL})` : pickUserAgent(target.host);
      const cacheable = (req.method ?? 'GET') === 'GET';
      const cacheKey = `httpcache:${url}`;

      if (cacheable) {
        const hit = await redis.get(cacheKey);
        if (hit) {
          log.debug({ url }, 'cache hit');
          return JSON.parse(hit) as HttpResponse;
        }
      }

      if (!req.api && !(await robotsAllows(target, ua))) {
        throw new AdapterError('robots_disallowed', `robots.txt de ${target.host} não permite verificar esta página`);
      }

      await acquireHostSlot(target.host);
      const started = Date.now();
      const res = await rawFetch(url, req, ua);
      log.info({ url: target.origin + target.pathname, status: res.status, ms: Date.now() - started }, 'http');

      if (!req.api && looksBlocked(res.status, res.text)) {
        throw new AdapterError('blocked', `A loja bloqueou a verificação automática (HTTP ${res.status})`);
      }
      if (res.status === 404 || res.status === 410) throw new AdapterError('not_found', 'Produto não encontrado (link quebrado?)');
      if (res.status === 429) throw new AdapterError('blocked', 'Limite de requisições da API atingido (HTTP 429)');

      if (cacheable && res.status === 200) {
        await redis.set(cacheKey, JSON.stringify(res), 'EX', req.cacheTtlS ?? config.FETCH_CACHE_TTL_S);
      }
      return res;
    },
  };
}
