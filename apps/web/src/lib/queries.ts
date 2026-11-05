import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Alert, type Item, type ItemDetail, type List, type Settings } from './api';

export const useLists = () => useQuery({ queryKey: ['lists'], queryFn: () => api<List[]>('/lists') });
export const useItems = () => useQuery({ queryKey: ['items'], queryFn: () => api<Item[]>('/items'), refetchInterval: 60_000 });
export const useItem = (id: string | undefined) =>
  useQuery({ queryKey: ['item', id], queryFn: () => api<ItemDetail>(`/items/${id}`), enabled: !!id });
export const useAlerts = () =>
  useQuery({ queryKey: ['alerts'], queryFn: () => api<{ alerts: Alert[]; unread: number }>('/alerts'), refetchInterval: 120_000 });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });

/** Invalida tudo que depende de itens (lista, detalhe, contadores das listas). */
export function useInvalidateItems() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ['items'] });
    qc.invalidateQueries({ queryKey: ['lists'] });
    if (id) qc.invalidateQueries({ queryKey: ['item', id] });
  };
}

export function useUpdateItem() {
  const invalidate = useInvalidateItems();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; targetPrice?: number; status?: 'monitoring' | 'paused'; name?: string; listId?: string; intervalMin?: number }) =>
      api<Item>(`/items/${id}`, { method: 'PATCH', body }),
    onMutate: async ({ id, ...patch }) => {
      // atualização otimista: a lista responde na hora
      await qc.cancelQueries({ queryKey: ['items'] });
      const prev = qc.getQueryData<Item[]>(['items']);
      qc.setQueryData<Item[]>(['items'], (items) =>
        items?.map((i) =>
          i.id === id
            ? {
                ...i,
                ...(patch.targetPrice ? { target_price: patch.targetPrice } : {}),
                ...(patch.status ? { status: patch.status } : {}),
                ...(patch.name ? { name: patch.name } : {}),
              }
            : i,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, c) => c?.prev && qc.setQueryData(['items'], c.prev),
    onSettled: (_d, _e, v) => invalidate(v.id),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? api('/alerts/read-all', { body: {} }) : api(`/alerts/${id}/read`, { body: {} })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
