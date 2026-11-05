import { useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ItemDetail } from '../components/ItemDetail';
import { ItemsBrowser } from '../components/ItemsBrowser';
import { ListsBar } from '../components/ListsBar';
import { useItems } from '../lib/queries';

/**
 * Desktop: duas colunas (listas + produtos à esquerda, detalhes à direita).
 * Mobile: uma coluna — a lista, ou o detalhe quando há um produto aberto.
 */
export function DashboardPage({ search = false }: { search?: boolean }) {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const listId = params.get('list');
  const items = useItems();
  const setList = (v: string | null) =>
    setParams((p) => {
      v ? p.set('list', v) : p.delete('list');
      return p;
    }, { replace: true });

  const reached = items.data?.filter((i) => i.status === 'reached').length ?? 0;

  return (
    <AppShell listId={listId}>
      <div className="lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10">
        <div className={`${id ? 'hidden lg:block' : ''} space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-2`}>
          {!search ? (
            <>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Minhas listas</h1>
                <p className="muted mt-1 text-sm">
                  {items.data ? `${items.data.length} produtos monitorados${reached ? ` · ${reached} no preço-alvo` : ''}` : ' '}
                </p>
              </div>
              <ListsBar value={listId} onChange={setList} />
            </>
          ) : (
            <h1 className="text-xl font-semibold tracking-tight">Busca</h1>
          )}
          <ItemsBrowser activeId={id} listId={search ? null : listId} autoFocus={search} />
        </div>

        <div className={`${id ? '' : 'hidden lg:block'} min-w-0`}>
          {id ? (
            <ItemDetail key={id} id={id} />
          ) : (
            <div className="muted flex h-full min-h-[50vh] items-center justify-center rounded-lg border border-dashed border-gray-100 p-10 text-center text-sm dark:border-gray-800">
              Selecione um produto para ver o histórico de preços e os detalhes.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
