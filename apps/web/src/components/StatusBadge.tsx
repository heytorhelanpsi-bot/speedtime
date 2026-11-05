import type { Item } from '../lib/api';
import { STATUS_LABEL } from '../lib/format';

export function StatusBadge({ item }: { item: Pick<Item, 'status'> }) {
  const reached = item.status === 'reached';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        reached
          ? 'border-accent/30 bg-accent-soft text-accent dark:border-accent-dark/30 dark:bg-accent-darksoft dark:text-accent-dark'
          : item.status === 'paused'
            ? 'border-gray-100 text-gray-700 dark:border-gray-700 dark:text-gray-400'
            : 'border-gray-100 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${reached ? 'bg-accent dark:bg-accent-dark' : item.status === 'paused' ? 'border border-gray-400' : 'bg-gray-400'}`}
        aria-hidden
      />
      {STATUS_LABEL[item.status]}
    </span>
  );
}

export function FailureNote({ item, compact = false }: { item: Pick<Item, 'last_error' | 'last_success_at' | 'last_error_at'>; compact?: boolean }) {
  if (!item.last_error) return null;
  const last = item.last_success_at
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.last_success_at))
    : null;
  return (
    <p className={`flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-400 ${compact ? '' : 'rounded-md border border-dashed border-gray-400 p-3'}`} role="note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-px shrink-0" aria-hidden>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
      </svg>
      <span>
        <strong className="font-medium text-gray-900 dark:text-gray-50">Não foi possível verificar.</strong>{' '}
        {last ? `Última verificação bem-sucedida: ${last}.` : 'Ainda sem nenhuma verificação bem-sucedida.'}
        {!compact && <span className="mt-1 block">{item.last_error}</span>}
      </span>
    </p>
  );
}
