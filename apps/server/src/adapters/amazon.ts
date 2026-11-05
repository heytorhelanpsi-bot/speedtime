import { signV4 } from '../net/sigv4.js';
import { AdapterError, type PriceResult, type StoreAdapter } from './types.js';

export function parseAsin(url: URL): string | null {
  const m = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Converte a resposta do GetItems (PA-API 5). Função pura. */
export function parseAmazonGetItems(json: any): PriceResult {
  const errors = json?.Errors;
  if (Array.isArray(errors) && errors.length) {
    const code = errors[0]?.Code ?? '';
    if (/ItemNotAccessible|InvalidParameterValue|NotFound/i.test(code)) throw new AdapterError('not_found', `Amazon: ${errors[0]?.Message ?? code}`);
    throw new AdapterError('network', `Amazon PA-API: ${errors[0]?.Message ?? code}`);
  }
  const item = json?.ItemsResult?.Items?.[0];
  const listing = item?.Offers?.Listings?.[0];
  const amount = listing?.Price?.Amount;
  if (typeof amount !== 'number') throw new AdapterError('parse_error', 'Amazon: produto sem oferta disponível');
  const basis = listing?.SavingBasis?.Amount;
  const availability = listing?.Availability?.Type;
  return {
    price: amount,
    currency: listing.Price.Currency ?? 'BRL',
    originalPrice: typeof basis === 'number' && basis > amount ? basis : null,
    shipping: listing?.DeliveryInfo?.IsFreeShippingEligible ? 0 : null,
    inStock: availability ? availability === 'Now' : null,
    title: item?.ItemInfo?.Title?.DisplayValue ?? null,
  };
}

/**
 * Amazon via Product Advertising API 5 (programa de Associados).
 * Não fazemos scraping das páginas da Amazon: os termos de uso proíbem.
 */
export const amazonAdapter: StoreAdapter = {
  id: 'amazon',
  name: 'Amazon',
  official: true,
  matches: (url) => /(^|\.)amazon\.[a-z.]+$/i.test(url.hostname) || /(^|\.)amzn\.to$/i.test(url.hostname),
  isConfigured: (c) => !!(c.AMAZON_PAAPI_ACCESS_KEY && c.AMAZON_PAAPI_SECRET_KEY && c.AMAZON_PARTNER_TAG),
  async fetchPrice(url, ctx) {
    const c = ctx.config;
    if (!amazonAdapter.isConfigured!(c)) {
      throw new AdapterError('not_configured', 'Amazon exige credenciais da PA-API (AMAZON_PAAPI_ACCESS_KEY, AMAZON_PAAPI_SECRET_KEY, AMAZON_PARTNER_TAG)');
    }
    const asin = parseAsin(url);
    if (!asin) throw new AdapterError('unsupported_url', 'Não encontramos o código ASIN no link da Amazon (use o link com /dp/XXXXXXXXXX)');

    const path = '/paapi5/getitems';
    const body = JSON.stringify({
      ItemIds: [asin],
      PartnerTag: c.AMAZON_PARTNER_TAG,
      PartnerType: 'Associates',
      Marketplace: c.AMAZON_MARKETPLACE,
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price',
        'Offers.Listings.SavingBasis',
        'Offers.Listings.Availability.Type',
        'Offers.Listings.DeliveryInfo.IsFreeShippingEligible',
      ],
    });
    const headers = signV4({
      method: 'POST',
      host: c.AMAZON_PAAPI_HOST,
      path,
      region: c.AMAZON_PAAPI_REGION,
      service: 'ProductAdvertisingAPI',
      accessKey: c.AMAZON_PAAPI_ACCESS_KEY!,
      secretKey: c.AMAZON_PAAPI_SECRET_KEY!,
      body,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-encoding': 'amz-1.0',
        'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
      },
    });
    delete (headers as any).host; // fetch define o host
    const res = await ctx.http.request(`https://${c.AMAZON_PAAPI_HOST}${path}`, { method: 'POST', api: true, headers, body });
    let json: any;
    try {
      json = JSON.parse(res.text);
    } catch {
      throw new AdapterError('parse_error', `Amazon PA-API retornou resposta inválida (HTTP ${res.status})`);
    }
    return parseAmazonGetItems(json);
  },
};
