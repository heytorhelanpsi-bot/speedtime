import { createHmac } from 'node:crypto';
import { genericAdapter } from './generic.js';
import { parsePrice } from '../lib/money.js';
import { AdapterError, type PriceResult, type StoreAdapter } from './types.js';

export function parseAliExpressId(url: URL): string | null {
  return url.pathname.match(/\/item\/(?:[^/]*?)(\d{8,})\.html/)?.[1] ?? null;
}

/** Assinatura do AliExpress Open Platform (sign_method=sha256): HMAC-SHA256 dos pares ordenados. */
export function signAliExpress(params: Record<string, string>, secret: string) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

export function parseAliExpressDetail(json: any): PriceResult {
  if (json?.error_response) throw new AdapterError('network', `AliExpress: ${json.error_response.msg ?? 'erro na API'}`);
  const result = json?.aliexpress_affiliate_productdetail_get_response?.resp_result;
  const p = result?.result?.products?.product?.[0];
  if (!p) throw new AdapterError('not_found', 'AliExpress: produto não disponível no programa de afiliados');
  const price = parsePrice(p.target_sale_price ?? p.sale_price);
  if (price == null) throw new AdapterError('parse_error', 'AliExpress: resposta sem preço');
  const original = parsePrice(p.target_original_price ?? p.original_price);
  return {
    price,
    currency: p.target_sale_price_currency ?? p.sale_price_currency ?? 'BRL',
    originalPrice: original && original > price ? original : null,
    title: p.product_title ?? null,
  };
}

/** AliExpress: API de afiliados quando configurada; sem credenciais, tenta dados estruturados da página. */
export const aliexpressAdapter: StoreAdapter = {
  id: 'aliexpress',
  name: 'AliExpress',
  official: true,
  matches: (url) => /(^|\.)aliexpress\.[a-z.]+$/i.test(url.hostname),
  isConfigured: (c) => !!(c.ALIEXPRESS_APP_KEY && c.ALIEXPRESS_APP_SECRET),
  async fetchPrice(url, ctx) {
    const c = ctx.config;
    const id = parseAliExpressId(url);
    if (!aliexpressAdapter.isConfigured!(c) || !id) return genericAdapter.fetchPrice(url, ctx);
    const params: Record<string, string> = {
      method: 'aliexpress.affiliate.productdetail.get',
      app_key: c.ALIEXPRESS_APP_KEY!,
      sign_method: 'sha256',
      timestamp: String(Date.now()),
      product_ids: id,
      target_currency: 'BRL',
      target_language: 'PT',
      country: 'BR',
    };
    if (c.ALIEXPRESS_TRACKING_ID) params.tracking_id = c.ALIEXPRESS_TRACKING_ID;
    params.sign = signAliExpress(params, c.ALIEXPRESS_APP_SECRET!);
    const res = await ctx.http.request(`https://api-sg.aliexpress.com/sync?${new URLSearchParams(params)}`, {
      api: true,
      cacheTtlS: 0,
    });
    try {
      return parseAliExpressDetail(JSON.parse(res.text));
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      throw new AdapterError('parse_error', `AliExpress retornou resposta inválida (HTTP ${res.status})`);
    }
  },
};
