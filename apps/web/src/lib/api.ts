export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_KEY = 'speedtime.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor');
  }
  if (res.status === 401 && token) {
    tokenStore.set(null);
    window.dispatchEvent(new Event('speedtime:logout'));
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Erro ${res.status}`);
  return data as T;
}

// Tipos ----------------------------------------------------------------------
export type ItemStatus = 'monitoring' | 'reached' | 'paused';

export interface List {
  id: string;
  name: string;
  position: number;
  item_count: number;
  reached_count: number;
}

export interface Item {
  id: string;
  list_id: string;
  list_name: string;
  name: string;
  url: string;
  store: string;
  currency: string;
  target_price: number;
  current_price: number | null;
  original_price: number | null;
  shipping_price: number | null;
  in_stock: boolean | null;
  previous_price: number | null;
  lowest_price: number | null;
  lowest_price_at: string | null;
  status: ItemStatus;
  interval_min: 15 | 30 | 60;
  next_check_at: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_code: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
  change_pct: number | null;
  created_at: string;
}

export interface PricePoint {
  price: number;
  original_price: number | null;
  shipping_price: number | null;
  currency: string;
  in_stock: boolean | null;
  captured_at: string;
}

export interface ItemDetail extends Item {
  history: PricePoint[];
}

export interface Alert {
  id: string;
  kind: 'target_reached' | 'new_low' | 'test';
  price: number | null;
  target_price: number | null;
  currency: string | null;
  read_at: string | null;
  created_at: string;
  item_id: string | null;
  item_name: string | null;
  item_url: string | null;
  item_store: string | null;
}

export interface Settings {
  default_interval_min: 15 | 30 | 60;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
  telegram_enabled: boolean;
  telegram_linked: boolean;
  theme: 'system' | 'light' | 'dark';
  push_devices: number;
  capabilities: { push: boolean; email: boolean; telegram: boolean };
  stores: { id: string; name: string; official: boolean; configured: boolean }[];
}
