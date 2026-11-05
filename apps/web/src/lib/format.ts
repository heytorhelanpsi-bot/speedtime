export function money(value: number | null | undefined, currency = 'BRL') {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'nunca';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'agora';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function pct(v: number | null | undefined) {
  if (v == null || v === 0) return null;
  return `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export const STORE_NAMES: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
  aliexpress: 'AliExpress',
  temu: 'Temu',
  shein: 'Shein',
  generic: 'Loja',
};

export function storeLabel(item: { store: string; url: string }) {
  if (item.store !== 'generic') return STORE_NAMES[item.store] ?? item.store;
  try {
    return new URL(item.url).hostname.replace(/^www\./, '');
  } catch {
    return 'Loja';
  }
}

export const STATUS_LABEL = { monitoring: 'Monitorando', reached: 'Atingido', paused: 'Pausado' } as const;
