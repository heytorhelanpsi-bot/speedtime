import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Item } from '../lib/api';
import { storeLabel } from '../lib/format';
import { useItems } from '../lib/queries';
import { Icon } from './Icon';
import { ItemRow } from './ItemRow';

type StatusFilter = 'all' | 'monitoring' | 'reached' | 'paused' | 'error';
type Sort = 'date' | 'price' | 'change' | 'checked';

const STATUS_FILTERS: [StatusFilter, string][] = [
  ['all', 'Todos'],
  ['reached', 'Atingidos'],
  ['monitoring', 'Monitorando'],
  ['paused', 'Pausados'],
  ['error', 'Com falha'],
];

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtra no cliente: a busca responde a cada tecla, sem esperar o servidor. */
export function filterItems(items: Item[], opts: { q: string; status: StatusFilter; listId: string | null; sort: Sort }) {
  const q = normalize(opts.q.trim());
  const out = items.filter((i) => {
    if (opts.listId && i.list_id !== opts.listId) return false;
    if (opts.status === 'error' ? !i.last_error : opts.status !== 'all' && i.status !== opts.status) return false;
    if (!q) return true;
    return normalize(`${i.name} ${storeLabel(i)} ${i.list_name}`).includes(q);
  });
  const key: Record<Sort, (i: Item) => number> = {
    date: (i) => -new Date(i.created_at).getTime(),
    price: (i) => i.current_price ?? Infinity,
    change: (i) => i.change_pct ?? Infinity, // maiores quedas primeiro
    checked: (i) => -new Date(i.last_checked_at ?? 0).getTime(),
  };
  return out.sort((a, b) => key[opts.sort](a) - key[opts.sort](b));
}

export function ItemsBrowser({ activeId, listId, autoFocus = false }: { activeId?: string; listId: string | null; autoFocus?: boolean }) {
  const items = useItems();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('status') as StatusFilter) ?? 'all';
  const sort = (params.get('sort') as Sort) ?? 'date';

  const set = (k: string, v: string, def: string) =>
    setParams((p) => {
      v === def ? p.delete(k) : p.set(k, v);
      return p;
    }, { replace: true });

  const filtered = useMemo(() => filterItems(items.data ?? [], { q, status, listId, sort }), [items.data, q, status, listId, sort]);

  return (
    <section aria-label="Produtos" className="flex min-h-0 flex-col">
      <div className="space-y-3">
        <div className="relative">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Buscar por produto, loja ou lista"
            aria-label="Buscar produtos"
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => set('q', e.target.value, '')}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar por status">
            {STATUS_FILTERS.map(([v, label]) => (
              <button
                key={v}
                aria-pressed={status === v}
                onClick={() => set('status', v, 'all')}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  status === v ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-1 mt-4 flex items-center justify-between gap-2">
        <p className="muted text-xs" aria-live="polite">
          {items.isLoading ? 'Carregando…' : `${filtered.length} produto${filtered.length === 1 ? '' : 's'}`}
        </p>
        <div>
            <label className="sr-only" htmlFor="sort">Ordenar por</label>
            <select id="sort" className="input h-8 w-auto border-transparent py-1 pl-2 pr-7 text-xs hover:border-gray-100 dark:border-transparent" value={sort} onChange={(e) => set('sort', e.target.value, 'date')}>
              <option value="date">Mais recentes</option>
              <option value="price">Menor preço</option>
              <option value="change">Maior queda</option>
              <option value="checked">Última verificação</option>
            </select>
        </div>
      </div>

      {items.error && <p className="text-sm">Não foi possível carregar os produtos. {(items.error as Error).message}</p>}
      {!items.isLoading && !filtered.length && (
        <div className="muted rounded-lg border border-dashed border-gray-100 px-6 py-10 text-center text-sm dark:border-gray-800">
          {items.data?.length ? 'Nenhum produto corresponde aos filtros.' : 'Nenhum produto ainda. Use “Novo produto” para começar.'}
        </div>
      )}
      <ul className="-mx-1 space-y-1">
        {filtered.map((i) => (
          <ItemRow key={i.id} item={i} active={i.id === activeId} />
        ))}
      </ul>
    </section>
  );
}
