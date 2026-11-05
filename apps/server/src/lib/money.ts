/**
 * Converte textos de preço para número.
 * Aceita "R$ 1.299,90", "1,299.90", "1299.9", "US$ 19.99", "€ 12,50".
 */
export function parsePrice(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? round2(input) : null;
  if (typeof input !== 'string') return null;
  let s = input.replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // o separador que aparece por último é o decimal
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1 || lastDot > -1) {
    const sep = lastComma > -1 ? ',' : '.';
    const parts = s.split(sep);
    // "1.299" / "1,299" / "1.299.000" => milhar ; "12,9" / "12.99" => decimal
    const thousands = parts.length > 2 || parts[parts.length - 1].length === 3;
    s = thousands ? parts.join('') : parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatMoney(value: number | null | undefined, currency = 'BRL') {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
