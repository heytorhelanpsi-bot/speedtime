import { describe, expect, it, vi } from 'vitest';
import { config } from '../src/lib/config.js';
import { createHttpClient, looksBlocked, pickUserAgent } from '../src/net/http.js';
import { fakeRedis, fixture, silentLog } from './helpers.js';

function client(handler: (url: string) => { status?: number; body?: string }, overrides: Partial<typeof config> = {}) {
  const fetchImpl = vi.fn(async (url: any) => {
    const r = handler(String(url));
    return new Response(r.body ?? '', { status: r.status ?? 200 });
  });
  const redis = fakeRedis();
  const http = createHttpClient({ redis, config: { ...config, FETCH_MIN_HOST_INTERVAL_MS: 5000, ...overrides }, log: silentLog, fetchImpl: fetchImpl as any });
  return { http, fetchImpl, redis };
}

describe('cliente HTTP', () => {
  it('respeita robots.txt', async () => {
    const { http } = client((url) =>
      url.endsWith('/robots.txt') ? { body: 'User-agent: *\nDisallow: /privado/' } : { body: fixture('jsonld-product.html') },
    );
    await expect(http.request('https://loja.com/privado/p1')).rejects.toMatchObject({ code: 'robots_disallowed' });
  });

  it('aplica intervalo mínimo por host e reaproveita cache', async () => {
    const { http, fetchImpl } = client(() => ({ body: fixture('jsonld-product.html') }));
    await http.request('https://loja.com/p/1');
    // mesma URL: vem do cache, sem nova requisição
    await http.request('https://loja.com/p/1');
    expect(fetchImpl.mock.calls.filter(([u]) => !String(u).endsWith('robots.txt'))).toHaveLength(1);
    // outra URL do mesmo host dentro do intervalo: rate_limited com tempo de espera
    await expect(http.request('https://loja.com/p/2')).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: expect.any(Number) });
    // host diferente não é afetado
    await expect(http.request('https://outra.com/p/1')).resolves.toMatchObject({ status: 200 });
  });

  it('detecta captcha/bloqueio sem tentar contornar', async () => {
    const { http } = client((url) => (url.endsWith('robots.txt') ? { status: 404 } : { body: fixture('captcha.html') }));
    await expect(http.request('https://loja.com/p/1')).rejects.toMatchObject({ code: 'blocked' });
  });

  it('404 vira not_found', async () => {
    const { http } = client((url) => (url.endsWith('robots.txt') ? { status: 404 } : { status: 404 }));
    await expect(http.request('https://loja.com/p/1')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('erro de rede vira network', async () => {
    const redis = fakeRedis();
    const http = createHttpClient({ redis, config, log: silentLog, fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as any });
    await expect(http.request('https://loja.com/p/1', { api: true })).rejects.toMatchObject({ code: 'network' });
  });

  it('looksBlocked não confunde página de produto que menciona "captcha"', () => {
    expect(looksBlocked(200, fixture('jsonld-product.html') + '<script>captcha</script>')).toBe(false);
    expect(looksBlocked(429, '')).toBe(true);
  });

  it('rotação moderada de User-Agent: estável por host durante a hora', () => {
    const t = Date.UTC(2026, 0, 1, 10, 5);
    expect(pickUserAgent('a.com', t)).toBe(pickUserAgent('a.com', t + 30 * 60_000));
    expect(pickUserAgent('a.com', t)).toMatch(/SpeedTimeBot/);
  });
});
