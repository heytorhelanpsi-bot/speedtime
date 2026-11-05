import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL, tokenStore, type Alert } from './api';
import { money } from './format';

/** Conecta ao SSE do servidor: novos alertas viram toast + contador; itens atualizados recarregam. */
export function useLiveEvents(onAlert: (a: Alert, text: { title: string; body: string }) => void) {
  const qc = useQueryClient();
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    const es = new EventSource(`${API_URL}/api/events?token=${encodeURIComponent(token)}`);
    es.addEventListener('alert', (e) => {
      const a = JSON.parse((e as MessageEvent).data) as Alert;
      qc.invalidateQueries({ queryKey: ['alerts'] });
      const price = money(a.price, a.currency ?? 'BRL');
      if (a.kind === 'test') onAlert(a, { title: 'Notificação de teste', body: 'O app recebeu o alerta em tempo real.' });
      else onAlert(a, { title: a.kind === 'new_low' ? 'Novo menor preço' : 'Preço-alvo atingido', body: `${a.item_name} por ${price}` });
    });
    es.addEventListener('item', (e) => {
      const { itemId } = JSON.parse((e as MessageEvent).data);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['lists'] });
      qc.invalidateQueries({ queryKey: ['item', itemId] });
    });
    return () => es.close();
  }, [qc, onAlert]);
}
