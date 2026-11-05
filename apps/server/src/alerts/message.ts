import { formatMoney } from '../lib/money.js';

export interface AlertView {
  id: string;
  kind: 'target_reached' | 'new_low' | 'test';
  price: number | null;
  target_price: number | null;
  currency: string | null;
  item_id: string | null;
  item_name: string | null;
  item_url: string | null;
}

export function alertText(a: AlertView) {
  const price = formatMoney(a.price, a.currency ?? 'BRL');
  const target = formatMoney(a.target_price, a.currency ?? 'BRL');
  switch (a.kind) {
    case 'target_reached':
      return { title: `Preço atingido: ${a.item_name}`, body: `Agora por ${price} (alvo ${target}).` };
    case 'new_low':
      return { title: `Novo menor preço: ${a.item_name}`, body: `Caiu ainda mais: ${price} (alvo ${target}).` };
    default:
      return { title: 'SpeedTime: teste de notificação', body: 'Se você recebeu esta mensagem, o canal está funcionando.' };
  }
}
