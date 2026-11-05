import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseAliExpressDetail, parseAliExpressId, signAliExpress, aliexpressAdapter } from '../src/adapters/aliexpress.js';
import { amazonAdapter, parseAmazonGetItems, parseAsin } from '../src/adapters/amazon.js';
import { genericAdapter, parseStructuredData } from '../src/adapters/generic.js';
import { parseProductUrl, resolveAdapter } from '../src/adapters/index.js';
import { mercadoLivreAdapter, parseMercadoLivreUrl } from '../src/adapters/mercadolivre.js';
import { parseShopeeOffer, parseShopeeUrl, shopeeAdapter, shopeeAuthHeader } from '../src/adapters/shopee.js';
import { AdapterError } from '../src/adapters/types.js';
import { ctx, fakeHttp, fixture } from './helpers.js';

const u = (s: string) => new URL(s);

describe('roteamento de lojas', () => {
  it.each([
    ['https://produto.mercadolivre.com.br/MLB-3456789012-smartphone', 'mercadolivre'],
    ['https://www.mercadolivre.com.br/console/p/MLB19615326', 'mercadolivre'],
    ['https://www.amazon.com.br/dp/B0ABCDE123', 'amazon'],
    ['https://shopee.com.br/Garrafa-i.112233.22334455', 'shopee'],
    ['https://pt.aliexpress.com/item/1005006123456789.html', 'aliexpress'],
    ['https://www.temu.com/br/produto-g-601099.html', 'temu'],
    ['https://br.shein.com/vestido-p-12345.html', 'shein'],
    ['https://www.magazineluiza.com.br/fone/p/123/', 'generic'],
  ])('%s → %s', (url, id) => expect(resolveAdapter(u(url)).id).toBe(id));

  it('rejeita links inválidos', () => {
    expect(() => parseProductUrl('não é link')).toThrow(AdapterError);
    expect(() => parseProductUrl('ftp://x.com/a')).toThrow(AdapterError);
  });
});

describe('parser genérico (dados estruturados)', () => {
  it('lê JSON-LD com @graph, ignorando blocos inválidos', () => {
    expect(parseStructuredData(fixture('jsonld-product.html'))).toEqual({
      price: 249.9, currency: 'BRL', originalPrice: null, shipping: 0, inStock: true, title: 'Fone de Ouvido Bluetooth XYZ',
    });
  });

  it('lê AggregateOffer (menor preço, preço "de" e estoque)', () => {
    const r = parseStructuredData(fixture('aggregate-offer.html'));
    expect(r).toMatchObject({ price: 399.9, originalPrice: 529, inStock: false, title: 'Air Fryer 4L' });
  });

  it('cai para meta tags quando não há JSON-LD', () => {
    expect(parseStructuredData(fixture('meta-tags.html'))).toMatchObject({ price: 1299, currency: 'BRL', title: 'Cafeteira Expresso' });
  });

  it('cai para microdata', () => {
    expect(parseStructuredData(fixture('microdata.html'))).toMatchObject({ price: 189.5, title: 'Mochila Urbana' });
  });

  it('lança parse_error quando não acha preço (sem derrubar o processo)', async () => {
    const { http } = fakeHttp({ 'https://loja.com': { text: fixture('no-price.html') } });
    await expect(genericAdapter.fetchPrice(u('https://loja.com/p/1'), ctx(http))).rejects.toMatchObject({ code: 'parse_error' });
  });
});

describe('Mercado Livre', () => {
  it('extrai ids de item e de catálogo', () => {
    expect(parseMercadoLivreUrl(u('https://produto.mercadolivre.com.br/MLB-3456789012-smartphone-_JM'))).toEqual({ kind: 'item', id: 'MLB3456789012' });
    expect(parseMercadoLivreUrl(u('https://www.mercadolivre.com.br/console/p/MLB19615326?pdp_filters=x'))).toEqual({ kind: 'product', id: 'MLB19615326' });
    expect(parseMercadoLivreUrl(u('https://www.mercadolivre.com.br/x/up/MLBU1?wid=MLB777888999'))).toEqual({ kind: 'item', id: 'MLB777888999' });
  });

  it('usa a API oficial de itens (com token quando configurado)', async () => {
    const { http, calls } = fakeHttp({ 'https://api.mercadolibre.com/items/MLB3456789012': { text: fixture('ml-item.json') } });
    const r = await mercadoLivreAdapter.fetchPrice(u('https://produto.mercadolivre.com.br/MLB-3456789012-x'), ctx(http, { ML_ACCESS_TOKEN: 'tok' }));
    expect(r).toEqual({ price: 1499, currency: 'BRL', originalPrice: 1899, shipping: 0, inStock: true, title: 'Smartphone Exemplo 128GB' });
    expect(calls[0].init.headers.authorization).toBe('Bearer tok');
    expect(calls[0].init.api).toBe(true);
  });

  it('usa a buy box para produtos de catálogo', async () => {
    const { http } = fakeHttp({ 'https://api.mercadolibre.com/products/MLB19615326': { text: fixture('ml-product.json') } });
    const r = await mercadoLivreAdapter.fetchPrice(u('https://www.mercadolivre.com.br/c/p/MLB19615326'), ctx(http));
    expect(r).toMatchObject({ price: 3299.9, shipping: null, title: 'Console Exemplo 1TB' });
  });

  it('sem permissão na API, lê o JSON-LD da página', async () => {
    const page = 'https://produto.mercadolivre.com.br/MLB-3456789012-x';
    const { http, calls } = fakeHttp({
      'https://api.mercadolibre.com': { status: 403, text: '{"message":"forbidden"}' },
      [page]: { text: fixture('jsonld-product.html') },
    });
    const r = await mercadoLivreAdapter.fetchPrice(u(page), ctx(http, { ML_ACCESS_TOKEN: undefined }));
    expect(r.price).toBe(249.9);
    expect(calls.map((c) => c.url)).toEqual(['https://api.mercadolibre.com/items/MLB3456789012', page]);
  });
});

describe('Amazon (PA-API 5)', () => {
  it('extrai o ASIN', () => {
    expect(parseAsin(u('https://www.amazon.com.br/Kindle/dp/B0ABCDE123/ref=sr_1_1'))).toBe('B0ABCDE123');
    expect(parseAsin(u('https://www.amazon.com.br/gp/product/B0ABCDE123'))).toBe('B0ABCDE123');
    expect(parseAsin(u('https://www.amazon.com.br/s?k=kindle'))).toBeNull();
  });

  it('converte GetItems', () => {
    expect(parseAmazonGetItems(JSON.parse(fixture('amazon-getitems.json')))).toEqual({
      price: 449.1, currency: 'BRL', originalPrice: 499, shipping: 0, inStock: true, title: 'Kindle Exemplo',
    });
  });

  it('sem credenciais: not_configured, sem nenhuma requisição', async () => {
    const { http, calls } = fakeHttp({});
    await expect(
      amazonAdapter.fetchPrice(u('https://www.amazon.com.br/dp/B0ABCDE123'), ctx(http, { AMAZON_PAAPI_ACCESS_KEY: undefined })),
    ).rejects.toMatchObject({ code: 'not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('assina a requisição com SigV4', async () => {
    const { http, calls } = fakeHttp({ 'https://webservices.amazon.com.br/paapi5/getitems': { text: fixture('amazon-getitems.json') } });
    const r = await amazonAdapter.fetchPrice(
      u('https://www.amazon.com.br/dp/B0ABCDE123'),
      ctx(http, { AMAZON_PAAPI_ACCESS_KEY: 'AKIA', AMAZON_PAAPI_SECRET_KEY: 'secret', AMAZON_PARTNER_TAG: 'tag-20' }),
    );
    expect(r.price).toBe(449.1);
    const h = calls[0].init.headers;
    expect(h.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA\/\d{8}\/us-east-1\/ProductAdvertisingAPI\/aws4_request, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=[0-9a-f]{64}$/);
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ ItemIds: ['B0ABCDE123'], PartnerTag: 'tag-20' });
  });
});

describe('Shopee (API de Afiliados)', () => {
  it('extrai shopId/itemId', () => {
    expect(parseShopeeUrl(u('https://shopee.com.br/Garrafa-Termica-i.112233.22334455?sp_atk=1'))).toEqual({ shopId: '112233', itemId: '22334455' });
    expect(parseShopeeUrl(u('https://shopee.com.br/product/112233/22334455'))).toEqual({ shopId: '112233', itemId: '22334455' });
  });

  it('assina conforme a documentação (sha256 de appId+timestamp+payload+secret)', () => {
    const expected = createHash('sha256').update('1231700000000{}abc').digest('hex');
    expect(shopeeAuthHeader('123', 'abc', '{}', 1700000000)).toBe(`SHA256 Credential=123, Timestamp=1700000000, Signature=${expected}`);
  });

  it('converte a oferta e calcula o preço "de" pelo desconto', () => {
    expect(parseShopeeOffer(JSON.parse(fixture('shopee-offer.json')))).toEqual({ price: 59.9, currency: 'BRL', originalPrice: 99.83, title: 'Garrafa Térmica 1L' });
  });

  it('sem credenciais: not_configured', async () => {
    const { http } = fakeHttp({});
    await expect(shopeeAdapter.fetchPrice(u('https://shopee.com.br/x-i.1.2'), ctx(http))).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('AliExpress', () => {
  it('extrai o id do produto', () => {
    expect(parseAliExpressId(u('https://pt.aliexpress.com/item/1005006123456789.html?spm=a'))).toBe('1005006123456789');
  });

  it('assina parâmetros ordenados com HMAC-SHA256 em maiúsculas', () => {
    const sig = signAliExpress({ b: '2', a: '1' }, 'secret');
    expect(sig).toBe(createHmac('sha256', 'secret').update('a1b2').digest('hex').toUpperCase());
  });

  it('converte productdetail', () => {
    expect(parseAliExpressDetail(JSON.parse(fixture('aliexpress-detail.json')))).toEqual({
      price: 312.45, currency: 'BRL', originalPrice: 590.12, title: 'Mini Projetor Exemplo',
    });
  });

  it('sem credenciais, tenta os dados estruturados da página', async () => {
    const page = 'https://pt.aliexpress.com/item/1005006123456789.html';
    const { http } = fakeHttp({ [page]: { text: fixture('meta-tags.html') } });
    expect((await aliexpressAdapter.fetchPrice(u(page), ctx(http))).price).toBe(1299);
  });
});
