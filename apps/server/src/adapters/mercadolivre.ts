import { parseStructuredData } from './generic.js';
import { AdapterError, type AdapterContext, type PriceResult, type StoreAdapter } from './types.js';

/** Extrai o id do item (MLB123...) ou do produto de catálogo (/p/MLB...). */
export function parseMercadoLivreUrl(url: URL): { kind: 'item' | 'product'; id: string } | null {
  const catalog = url.pathname.match(/\/p\/(MLB\d+)/i);
  if (catalog) return { kind: 'product', id: catalog[1].toUpperCase() };
  const wid = url.searchParams.get('wid') ?? url.searchParams.get('item_id');
  if (wid && /^MLB\d+$/i.test(wid)) return { kind: 'item', id: wid.toUpperCase() };
  const item = (url.pathname + url.hash).match(/(MLB)-?(\d{6,})/i);
  if (item) return { kind: 'item', id: `MLB${item[2]}` };
  return null;
}

/** Converte a resposta de /items/{id} da API oficial. */
export function parseMercadoLivreItem(json: any): PriceResult {
  if (typeof json?.price !== 'number') throw new AdapterError('parse_error', 'Resposta da API do Mercado Livre sem preço');
  return {
    price: json.price,
    currency: json.currency_id ?? 'BRL',
    originalPrice: typeof json.original_price === 'number' && json.original_price > json.price ? json.original_price : null,
    shipping: json.shipping?.free_shipping ? 0 : null,
    inStock: json.status ? json.status === 'active' && (json.available_quantity ?? 1) > 0 : null,
    title: json.title ?? null,
  };
}

/** Converte a resposta de /products/{id} (catálogo): usa o vencedor da "buy box". */
export function parseMercadoLivreProduct(json: any): PriceResult {
  const box = json?.buy_box_winner;
  if (!box || typeof box.price !== 'number') {
    throw new AdapterError('parse_error', 'Produto de catálogo sem vendedor ativo no momento');
  }
  return {
    price: box.price,
    currency: box.currency_id ?? 'BRL',
    originalPrice: typeof box.original_price === 'number' && box.original_price > box.price ? box.original_price : null,
    shipping: box.shipping?.free_shipping ? 0 : null,
    inStock: (box.available_quantity ?? 1) > 0,
    title: json.name ?? null,
  };
}

async function viaApi(ref: { kind: 'item' | 'product'; id: string }, ctx: AdapterContext) {
  const path = ref.kind === 'item' ? `items/${ref.id}` : `products/${ref.id}`;
  const headers: Record<string, string> = {};
  if (ctx.config.ML_ACCESS_TOKEN) headers.authorization = `Bearer ${ctx.config.ML_ACCESS_TOKEN}`;
  const res = await ctx.http.request(`https://api.mercadolibre.com/${path}`, { api: true, headers });
  if (res.status === 401 || res.status === 403) return null; // sem permissão → tenta a página
  if (res.status >= 400) throw new AdapterError('network', `API do Mercado Livre respondeu HTTP ${res.status}`);
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new AdapterError('parse_error', 'API do Mercado Livre retornou JSON inválido');
  }
  return ref.kind === 'item' ? parseMercadoLivreItem(json) : parseMercadoLivreProduct(json);
}

export const mercadoLivreAdapter: StoreAdapter = {
  id: 'mercadolivre',
  name: 'Mercado Livre',
  official: true,
  matches: (url) => /(^|\.)mercado(livre|libre)\.com(\.[a-z]{2})?$/i.test(url.hostname),
  async fetchPrice(url, ctx) {
    const ref = parseMercadoLivreUrl(url);
    if (ref) {
      const r = await viaApi(ref, ctx);
      if (r) return r;
      ctx.log.debug({ id: ref.id }, 'API do Mercado Livre sem permissão; usando dados estruturados da página');
    }
    // Fallback: a página do produto publica JSON-LD schema.org
    const page = await ctx.http.request(url.toString());
    return parseStructuredData(page.text);
  },
};
