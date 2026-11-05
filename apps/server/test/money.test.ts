import { describe, expect, it } from 'vitest';
import { parsePrice } from '../src/lib/money.js';

describe('parsePrice', () => {
  it.each([
    ['R$ 1.299,90', 1299.9],
    ['R$ 249,90', 249.9],
    ['1.299', 1299],
    ['1,299.99', 1299.99],
    ['12.99', 12.99],
    ['12,5', 12.5],
    ['US$ 19.99', 19.99],
    ['2.499.000,00', 2499000],
    ['399', 399],
    [189.5, 189.5],
  ])('%s → %s', (input, expected) => expect(parsePrice(input)).toBe(expected));

  it.each([null, undefined, '', 'grátis', -5, NaN])('rejeita %s', (v) => expect(parsePrice(v)).toBeNull());
});
