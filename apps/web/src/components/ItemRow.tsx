import { Link } from 'react-router-dom';
import type { Item } from '../lib/api';
import { money, pct, storeLabel, timeAgo } from '../lib/format';
import { useUpdateItem } from '../lib/queries';
import { Icon } from './Icon';
import { FailureNote, StatusBadge } from './StatusBadge';
import { TargetEditor } from './TargetEditor';

/**
 * Linha de produto. O link "esticado" (after:inset-0) torna o cartão inteiro clicável,
 * enquanto as ações rápidas (z-10) continuam como botões independentes e acessíveis por teclado.
 */
export function ItemRow({ item, active }: { item: Item; active: boolean }) {
  const update = useUpdateItem();
  const paused = item.status === 'paused';
  const change = pct(item.change_pct);

  return (
    <li
      className={`group relative rounded-lg border px-4 py-3.5 transition-colors ${
        active
          ? 'border-gray-900 bg-gray-50 dark:border-gray-50 dark:bg-gray-800'
          : 'border-transparent hover:border-gray-100 hover:bg-gray-50 dark:hover:border-gray-800 dark:hover:bg-gray-800/60'
      }`}
    >
      <div className={`flex items-start justify-between gap-3 ${paused ? 'opacity-70' : ''}`}>
        <div className="min-w-0 flex-1">
          <Link
            to={`/item/${item.id}`}
            aria-current={active ? 'page' : undefined}
            className="block truncate rounded text-sm font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-gray-900 dark:focus-visible:after:ring-gray-50"
          >
            {item.name}
          </Link>
          <p className="muted mt-0.5 truncate text-xs">
            {storeLabel(item)} · {item.list_name} · verificado {timeAgo(item.last_checked_at)}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold tabular-nums ${item.status === 'reached' ? 'text-accent dark:text-accent-dark' : ''}`}>
            {money(item.current_price, item.currency)}
          </p>
          {change && <p className="muted text-xs tabular-nums">{change}</p>}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <StatusBadge item={item} />
          <span className="muted">alvo</span>
          <span className="relative z-10 tabular-nums">
            <TargetEditor item={item} />
          </span>
        </div>
        <div className="relative z-10 -my-1 -mr-2 flex items-center lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
          <button
            className="icon-btn h-8 w-8"
            onClick={() => update.mutate({ id: item.id, status: paused ? 'monitoring' : 'paused' })}
            aria-label={paused ? `Retomar monitoramento de ${item.name}` : `Pausar monitoramento de ${item.name}`}
            title={paused ? 'Retomar' : 'Pausar'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={15} />
          </button>
          <a
            className="icon-btn h-8 w-8"
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Abrir ${item.name} na loja (nova aba)`}
            title="Abrir na loja"
          >
            <Icon name="external" size={15} />
          </a>
        </div>
      </div>

      {item.last_error && (
        <div className="mt-2">
          <FailureNote item={item} compact />
        </div>
      )}
    </li>
  );
}
