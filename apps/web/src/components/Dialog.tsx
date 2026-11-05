import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Modal acessível baseado em <dialog> nativo (foco preso, Esc fecha). */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className="w-[calc(100%-2rem)] max-w-md rounded-lg border border-gray-100 bg-white p-0 text-gray-900 shadow-subtle backdrop:bg-gray-900/30 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-50"
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 id="dialog-title" className="text-base font-semibold">{title}</h2>
            <button className="icon-btn -mr-2" onClick={onClose} aria-label="Fechar">
              <Icon name="x" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
