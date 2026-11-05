import * as cheerio from 'cheerio';
import { parsePrice } from '../lib/money.js';
import { AdapterError, type PriceResult, type StoreAdapter } from './types.js';

type Json = any;

function* walk(node: Json): Generator<Json> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === 'object') {
    yield node;
    if (node['@graph']) yield* walk(node['@graph']);
  }
}

const isType = (n: Json, t: string) => {
  const type = n?.['@type'];
  return Array.isArray(type) ? type.includes(t) : type === t;
};

function availability(v: unknown): boolean | null {
  if (typeof v !== 'string') return null;
  if (/InStock|LimitedAvailability|OnlineOnly|PreOrder/i.test(v)) return true;
  if (/OutOfStock|SoldOut|Discontinued/i.test(v)) return false;
  return null;
}

function fromOffers(offers: Json): Omit<PriceResult, 'title'> | null {
  const list = Array.isArray(offers) ? offers : [offers];
  let best: Omit<PriceResult, 'title'> | null = null;
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const price =
      parsePrice(o.price) ??
      parsePrice(o.lowPrice) ??
      parsePrice(o.priceSpecification?.price) ??
      parsePrice(Array.isArray(o.priceSpecification) ? o.priceSpecification[0]?.price : undefined);
    if (price == null || price === 0) continue;
    const currency = o.priceCurrency ?? o.priceSpecification?.priceCurrency ?? 'BRL';
    const shippingRate = o.shippingDetails?.shippingRate?.value ?? o.shippingDetails?.[0]?.shippingRate?.value;
    const candidate = {
      price,
      currency: String(currency).toUpperCase(),
      originalPrice: parsePrice(o.highPrice) && parsePrice(o.highPrice)! > price ? parsePrice(o.highPrice) : null,
      shipping: shippingRate != null ? parsePrice(shippingRate) : null,
      inStock: availability(o.availability),
    };
    if (!best || candidate.price < best.price) best = candidate;
  }
  return best;
}

/** Lê preço de dados estruturados (JSON-LD schema.org) e meta tags. Função pura — testável com fixtures. */
export function parseStructuredData(html: string): PriceResult {
  const $ = cheerio.load(html);

  // 1) JSON-LD
  let title: string | null = null;
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let data: Json;
    try {
      data = JSON.parse($(el).contents().text().trim());
    } catch {
      continue; // JSON-LD inválido em uma tag não derruba as demais
    }
    for (const node of walk(data)) {
      const isProduct = isType(node, 'Product') || isType(node, 'ProductGroup');
      if (!isProduct) continue;
      title ??= typeof node.name === 'string' ? node.name : null;
      const offers = node.offers ?? node.hasVariant?.flatMap?.((v: Json) => v.offers ?? []);
      const r = offers ? fromOffers(offers) : null;
      if (r) return { ...r, title };
    }
  }

  // 2) Meta tags (Open Graph / Facebook product)
  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr('content') ?? $(`meta[name="${name}"]`).attr('content');
  const metaPrice = parsePrice(meta('product:price:amount') ?? meta('og:price:amount') ?? meta('product:sale_price:amount'));
  if (metaPrice) {
    return {
      price: metaPrice,
      currency: (meta('product:price:currency') ?? meta('og:price:currency') ?? 'BRL').toUpperCase(),
      originalPrice: parsePrice(meta('product:original_price:amount')),
      inStock: availability(meta('product:availability') ?? meta('og:availability')),
      title: title ?? meta('og:title') ?? null,
    };
  }

  // 3) Microdata
  const itemprop = $('[itemprop="price"]').first();
  const microPrice = parsePrice(itemprop.attr('content') ?? itemprop.text());
  if (microPrice) {
    return {
      price: microPrice,
      currency: ($('[itemprop="priceCurrency"]').first().attr('content') ?? 'BRL').toUpperCase(),
      title: title ?? $('[itemprop="name"]').first().text().trim() ?? null,
    };
  }

  throw new AdapterError('parse_error', 'Não encontramos o preço nos dados estruturados da página');
}

export const genericAdapter: StoreAdapter = {
  id: 'generic',
  name: 'Loja genérica (dados estruturados)',
  official: false,
  matches: () => true,
  async fetchPrice(url, ctx) {
    const res = await ctx.http.request(url.toString());
    if (res.status >= 400) throw new AdapterError('network', `A loja respondeu HTTP ${res.status}`);
    return parseStructuredData(res.text);
  },
};

/** Fábrica para lojas sem API pública: mesmo parser genérico, só muda o domínio e o nome exibido. */
export function structuredDataStore(id: string, name: string, hosts: RegExp, note?: string): StoreAdapter {
  return {
    id,
    name,
    official: false,
    matches: (url) => hosts.test(url.hostname),
    async fetchPrice(url, ctx) {
      try {
        return await genericAdapter.fetchPrice(url, ctx);
      } catch (err) {
        if (err instanceof AdapterError && err.code === 'parse_error' && note) {
          throw new AdapterError('parse_error', `${err.message}. ${note}`);
        }
        throw err;
      }
    },
  };
}
