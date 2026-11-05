import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

interface Toast {
  id: number;
  title: string;
  body?: string;
  href?: string;
  tone?: 'default' | 'success' | 'error';
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), t.tone === 'success' ? 8000 : 5000);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {toasts.map((t) => (
          <div key={t.id} role="status" className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 p-4">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                t.tone === 'success' ? 'bg-accent dark:bg-accent-dark' : t.tone === 'error' ? 'bg-gray-900 dark:bg-gray-50' : 'bg-gray-400'
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.body && <p className="muted mt-0.5 text-sm">{t.body}</p>}
              {t.href && (
                <Link to={t.href} onClick={() => dismiss(t.id)} className="mt-2 inline-block text-sm font-medium underline underline-offset-4">
                  Ver produto
                </Link>
              )}
            </div>
            <button className="icon-btn -m-2 h-8 w-8" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
