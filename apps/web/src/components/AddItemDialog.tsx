import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Item } from '../lib/api';
import { useInvalidateItems, useLists, useSettings } from '../lib/queries';
import { Dialog } from './Dialog';
import { useToast } from './Toasts';

const CURRENCIES = ['BRL', 'USD', 'EUR'];

export function AddItemDialog({ open, onClose, defaultListId }: { open: boolean; onClose: () => void; defaultListId?: string }) {
  const lists = useLists();
  const settings = useSettings();
  const invalidate = useInvalidateItems();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const item = await api<Item>('/items', {
        body: {
          name: f.get('name'),
          url: f.get('url'),
          targetPrice: Number(String(f.get('target')).replace(/\./g, '').replace(',', '.')),
          currency: f.get('currency'),
          listId: f.get('list'),
          intervalMin: Number(f.get('interval')),
        },
      });
      invalidate();
      toast({ title: 'Produto adicionado', body: 'A primeira verificação já está na fila.' });
      onClose();
      navigate(`/item/${item.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Novo produto">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="add-url">Link do produto</label>
          <input id="add-url" name="url" type="url" required placeholder="https://www.loja.com.br/produto" className="input" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="add-name">Nome</label>
          <input id="add-name" name="name" required maxLength={200} placeholder="Ex.: Fone Bluetooth" className="input" />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="label" htmlFor="add-target">Preço-alvo</label>
            <input id="add-target" name="target" required inputMode="decimal" pattern="[0-9.,]+" placeholder="0,00" className="input tabular-nums" />
          </div>
          <div>
            <label className="label" htmlFor="add-currency">Moeda</label>
            <select id="add-currency" name="currency" className="input" defaultValue="BRL">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="add-list">Lista</label>
            <select id="add-list" name="list" required className="input" defaultValue={defaultListId ?? lists.data?.[0]?.id}>
              {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="add-interval">Verificar a cada</label>
            <select id="add-interval" name="interval" className="input" defaultValue={settings.data?.default_interval_min ?? 30} key={settings.data?.default_interval_min}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-gray-900 dark:text-gray-50">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !lists.data?.length}>{busy ? 'Adicionando…' : 'Adicionar'}</button>
        </div>
      </form>
    </Dialog>
  );
}
