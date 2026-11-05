import { createHash } from 'node:crypto';
import { AdapterError, type PriceResult, type StoreAdapter } from './types.js';
import { parsePrice } from '../lib/money.js';

/** shopee.com.br/Nome-i.{shopId}.{itemId}  ou  shopee.com.br/product/{shopId}/{itemId} */
export function parseShopeeUrl(url: URL): { shopId: string; itemId: string } | null {
  const a = url.pathname.match(/-i\.(\d+)\.(\d+)/);
  if (a) return { shopId: a[1], itemId: a[2] };
  const b = url.pathname.match(/\/product\/(\d+)\/(\d+)/);
  if (b) return { shopId: b[1], itemId: b[2] };
  return null;
}

export function shopeeAuthHeader(appId: string, secret: string, payload: string, timestamp: number) {
  const signature = createHash('sha256').update(`${appId}${timestamp}${payload}${secret}`).digest('hex');
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export function parseShopeeOffer(json: any): PriceResult {
  if (json?.errors?.length) throw new AdapterError('network', `Shopee: ${json.errors[0]?.message ?? 'erro na API'}`);
  const node = json?.data?.productOfferV2?.nodes?.[0];
  if (!node) throw new AdapterError('not_found', 'Shopee: produto não encontrado no programa de afiliados');
  const price = parsePrice(node.priceMin ?? node.price);
  if (price == null) throw new AdapterError('parse_error', 'Shopee: resposta sem preço');
  const rate = Number(node.priceDiscountRate ?? 0);
  return {
    price,
    currency: 'BRL',
    originalPrice: rate > 0 && rate < 100 ? Math.round((price / (1 - rate / 100)) * 100) / 100 : null,
    title: node.productName ?? null,
  };
}

/** Shopee via API de Afiliados (GraphQL). As páginas bloqueiam acesso automatizado, por isso não há scraping. */
export const shopeeAdapter: StoreAdapter = {
  id: 'shopee',
  name: 'Shopee',
  official: true,
  matches: (url) => /(^|\.)shopee\.[a-z.]+$/i.test(url.hostname),
  isConfigured: (c) => !!(c.SHOPEE_AFFILIATE_APP_ID && c.SHOPEE_AFFILIATE_SECRET),
  async fetchPrice(url, ctx) {
    const c = ctx.config;
    if (!shopeeAdapter.isConfigured!(c)) {
      throw new AdapterError('not_configured', 'Shopee exige credenciais da API de Afiliados (SHOPEE_AFFILIATE_APP_ID, SHOPEE_AFFILIATE_SECRET)');
    }
    const ref = parseShopeeUrl(url);
    if (!ref) throw new AdapterError('unsupported_url', 'Link da Shopee sem identificador do produto');
    const payload = JSON.stringify({
      query: `{ productOfferV2(shopId: ${Number(ref.shopId)}, itemId: ${Number(ref.itemId)}, limit: 1) { nodes { itemId productName price priceMin priceMax priceDiscountRate } } }`,
    });
    const ts = Math.floor(Date.now() / 1000);
    const res = await ctx.http.request(c.SHOPEE_AFFILIATE_ENDPOINT, {
      method: 'POST',
      api: true,
      body: payload,
      headers: {
        'content-type': 'application/json',
        authorization: shopeeAuthHeader(c.SHOPEE_AFFILIATE_APP_ID!, c.SHOPEE_AFFILIATE_SECRET!, payload, ts),
      },
    });
    try {
      return parseShopeeOffer(JSON.parse(res.text));
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      throw new AdapterError('parse_error', `Shopee retornou resposta inválida (HTTP ${res.status})`);
    }
  },
};
