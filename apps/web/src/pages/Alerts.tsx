import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { money, timeAgo } from '../lib/format';
import { useAlerts, useMarkRead } from '../lib/queries';

const KIND = { target_reached: 'Preço-alvo atingido', new_low: 'Novo menor preço', test: 'Notificação de teste' } as const;

export function AlertsPage() {
  const { data, isLoading } = useAlerts();
  const mark = useMarkRead();

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Alertas</h1>
            <p className="muted mt-1 text-sm">{data ? `${data.unread} não lido${data.unread === 1 ? '' : 's'}` : ' '}</p>
          </div>
          {!!data?.unread && (
            <button className="btn-outline" onClick={() => mark.mutate('all')}>Marcar todos como lidos</button>
          )}
        </div>

        {isLoading && <p className="muted mt-8 text-sm">Carregando…</p>}
        {data && !data.alerts.length && (
          <div className="muted mt-8 rounded-lg border border-dashed border-gray-100 px-6 py-12 text-center text-sm dark:border-gray-800">
            Nenhum alerta ainda. Você será avisado quando um preço chegar ao alvo.
          </div>
        )}

        <ul className="mt-6 divide-y divide-gray-100 dark:divide-gray-800">
          {data?.alerts.map((a) => {
            const unread = !a.read_at;
            return (
              <li key={a.id} className="flex items-start gap-3 py-4">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? (a.kind === 'test' ? 'bg-gray-900 dark:bg-gray-50' : 'bg-accent dark:bg-accent-dark') : 'bg-transparent'}`}
                  aria-label={unread ? 'Não lido' : undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>{KIND[a.kind]}</p>
                  {a.item_id ? (
                    <Link to={`/item/${a.item_id}`} onClick={() => unread && mark.mutate(a.id)} className="muted mt-0.5 block truncate text-sm hover:underline">
                      {a.item_name} — {money(a.price, a.currency ?? 'BRL')} <span>(alvo {money(a.target_price, a.currency ?? 'BRL')})</span>
                    </Link>
                  ) : (
                    <p className="muted mt-0.5 text-sm">Canais de notificação funcionando.</p>
                  )}
                  <p className="muted mt-1 text-xs">{timeAgo(a.created_at)}</p>
                </div>
                {unread && (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => mark.mutate(a.id)}>Marcar como lido</button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
