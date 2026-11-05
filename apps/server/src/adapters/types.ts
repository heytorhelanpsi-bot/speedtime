import type { Logger } from '../lib/logger.js';
import type { Config } from '../lib/config.js';

export interface PriceResult {
  price: number;
  currency: string;
  /** Preço "de" (sem promoção), quando a loja informa. */
  originalPrice?: number | null;
  /** Frete: null = desconhecido, 0 = grátis. */
  shipping?: number | null;
  inStock?: boolean | null;
  title?: string | null;
}

export type AdapterErrorCode =
  | 'blocked'            // loja respondeu com captcha / 403 / 429
  | 'not_found'          // produto removido / 404
  | 'parse_error'        // página carregou mas não achamos o preço
  | 'robots_disallowed'  // robots.txt não permite
  | 'not_configured'     // API oficial exige credenciais ausentes
  | 'rate_limited'       // aguardando intervalo mínimo do host
  | 'network'            // timeout, DNS, conexão
  | 'unsupported_url';

export class AdapterError extends Error {
  constructor(
    public code: AdapterErrorCode,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface HttpResponse {
  status: number;
  url: string;
  text: string;
  headers: Record<string, string>;
}

export interface HttpRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** true = chamada a API oficial (pula robots.txt e cache de página). */
  api?: boolean;
  /** Quanto tempo o resultado pode ser reaproveitado (s). */
  cacheTtlS?: number;
}

export interface HttpClient {
  request(url: string, req?: HttpRequest): Promise<HttpResponse>;
}

export interface AdapterContext {
  http: HttpClient;
  config: Config;
  log: Logger;
}

export interface StoreAdapter {
  id: string;
  name: string;
  /** Usa API oficial / programa de afiliados? */
  official: boolean;
  matches(url: URL): boolean;
  /** Quando false, o adaptador avisa o que falta configurar. */
  isConfigured?(config: Config): boolean;
  fetchPrice(url: URL, ctx: AdapterContext): Promise<PriceResult>;
}
