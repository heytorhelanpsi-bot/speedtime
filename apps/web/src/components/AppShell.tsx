import { useCallback, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { Alert } from '../lib/api';
import { useLiveEvents } from '../lib/events';
import { useAlerts } from '../lib/queries';
import { AddItemDialog } from './AddItemDialog';
import { Icon, type IconName } from './Icon';
import { useToast } from './Toasts';

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" className="fill-gray-900 dark:fill-gray-50" />
        <path d="M14 40 L26 28 L34 36 L50 20" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="stroke-white dark:stroke-gray-900" />
      </svg>
      SpeedTime
    </span>
  );
}

function UnreadBadge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-semibold text-white dark:bg-gray-50 dark:text-gray-900">
      {n > 99 ? '99+' : n}
    </span>
  );
}

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Listas', icon: 'list', end: true },
  { to: '/search', label: 'Busca', icon: 'search' },
  { to: '/alerts', label: 'Alertas', icon: 'bell' },
  { to: '/settings', label: 'Ajustes', icon: 'settings' },
];

export function AppShell({ children, listId }: { children: ReactNode; listId?: string | null }) {
  const alerts = useAlerts();
  const unread = alerts.data?.unread ?? 0;
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const onAlert = useCallback(
    (a: Alert, t: { title: string; body: string }) => toast({ ...t, href: a.item_id ? `/item/${a.item_id}` : undefined, tone: 'success' }),
    [toast],
  );
  useLiveEvents(onAlert);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable fixed left-4 top-4 z-50 btn-primary">Pular para o conteúdo</a>
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
          <Link to="/" aria-label="SpeedTime — início"><Logo /></Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `relative btn-ghost ${isActive ? 'bg-gray-50 text-gray-900 dark:bg-gray-800 dark:text-gray-50' : ''}`
                }
              >
                <span className="relative"><Icon name={n.icon} size={16} />{n.to === '/alerts' && <UnreadBadge n={unread} />}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Link to="/alerts" className="icon-btn relative lg:hidden" aria-label={`Alertas, ${unread} não lidos`}>
              <Icon name="bell" />
              <UnreadBadge n={unread} />
            </Link>
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> <span className="hidden sm:inline">Novo produto</span>
              <span className="sm:hidden sr-only">Novo produto</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
        {children}
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900 lg:hidden" aria-label="Navegação inferior">
        <ul className="grid grid-cols-4">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-gray-900 dark:text-gray-50' : 'text-gray-700 dark:text-gray-400'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon name={n.icon} size={20} className={isActive ? 'stroke-[2.25]' : ''} />
                      {n.to === '/alerts' && <UnreadBadge n={unread} />}
                    </span>
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <AddItemDialog open={adding} onClose={() => setAdding(false)} defaultListId={listId ?? undefined} />
    </div>
  );
}
