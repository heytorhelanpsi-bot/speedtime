import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type List } from '../lib/api';
import { useLists } from '../lib/queries';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { useToast } from './Toasts';

/** Seletor de listas (chips) com criar, renomear e excluir. */
export function ListsBar({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const lists = useLists();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<null | { mode: 'create' } | { mode: 'rename'; list: List } | { mode: 'delete'; list: List }>(null);
  const [error, setError] = useState<string | null>(null);
  const active = lists.data?.find((l) => l.id === value);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['lists'] });
    qc.invalidateQueries({ queryKey: ['items'] });
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '');
    setError(null);
    try {
      if (dialog?.mode === 'create') {
        const l = await api<List>('/lists', { body: { name } });
        onChange(l.id);
      } else if (dialog?.mode === 'rename') {
        await api(`/lists/${dialog.list.id}`, { method: 'PATCH', body: { name } });
      }
      refresh();
      setDialog(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const remove = async (list: List) => {
    try {
      await api(`/lists/${list.id}`, { method: 'DELETE' });
      onChange(null);
      refresh();
      setDialog(null);
      toast({ title: `Lista "${list.name}" excluída` });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const chip = (selected: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
      selected
        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-50 dark:bg-gray-50 dark:text-gray-900'
        : 'border-gray-100 text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-400'
    }`;

  return (
    <div>
      <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Listas">
        <button role="tab" aria-selected={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
          Todas
        </button>
        {lists.data?.map((l) => (
          <button key={l.id} role="tab" aria-selected={value === l.id} className={chip(value === l.id)} onClick={() => onChange(l.id)}>
            {l.name}
            <span className="ml-1.5 tabular-nums opacity-70">{l.item_count}</span>
          </button>
        ))}
      </div>
        <button className="icon-btn mb-1 h-8 w-8 shrink-0 rounded-full border border-dashed border-gray-400" onClick={() => { setError(null); setDialog({ mode: 'create' }); }} aria-label="Nova lista" title="Nova lista">
          <Icon name="plus" size={16} />
        </button>
      </div>

      {active && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setError(null); setDialog({ mode: 'rename', list: active }); }}>
            <Icon name="edit" size={13} /> Renomear
          </button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setError(null); setDialog({ mode: 'delete', list: active }); }}>
            <Icon name="trash" size={13} /> Excluir
          </button>
        </div>
      )}

      <Dialog
        open={dialog?.mode === 'create' || dialog?.mode === 'rename'}
        onClose={() => setDialog(null)}
        title={dialog?.mode === 'rename' ? 'Renomear lista' : 'Nova lista'}
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="list-name">Nome da lista</label>
            <input
              id="list-name"
              name="name"
              required
              maxLength={60}
              autoFocus
              className="input"
              placeholder="Ex.: Eletrônicos"
              defaultValue={dialog?.mode === 'rename' ? dialog.list.name : ''}
            />
          </div>
          {error && <p role="alert" className="text-sm font-medium">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setDialog(null)}>Cancelar</button>
            <button className="btn-primary">Salvar</button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog?.mode === 'delete'} onClose={() => setDialog(null)} title="Excluir lista">
        {dialog?.mode === 'delete' && (
          <div className="space-y-5">
            <p className="muted text-sm">
              A lista <strong className="text-gray-900 dark:text-gray-50">{dialog.list.name}</strong> e seus {dialog.list.item_count} produto(s) serão
              excluídos, junto com o histórico de preços. Essa ação não pode ser desfeita.
            </p>
            {error && <p role="alert" className="text-sm font-medium">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDialog(null)}>Cancelar</button>
              <button className="btn-primary" onClick={() => remove(dialog.list)}>Excluir lista</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
