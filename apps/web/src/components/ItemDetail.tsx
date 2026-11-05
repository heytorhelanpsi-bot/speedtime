import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { dateTime, money, storeLabel, timeAgo } from '../lib/format';
import { useInvalidateItems, useItem, useLists, useUpdateItem } from '../lib/queries';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { PriceChart } from './PriceChart';
import { FailureNote, StatusBadge } from './StatusBadge';
import { TargetEditor } from './TargetEditor';
import { useToast } from './Toasts';

export function ItemDetail({ id }: { id: string }) {
  const { data: item, isLoading, error } = useItem(id);
  const lists = useLists();
  const update = useUpdateItem();
  const invalidate = useInvalidateItems();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) return <p className="muted p-8 text-sm">Carregando…</p>;
  if (error || !item) return <p className="p-8 text-sm">Produto não encontrado.</p>;

  const paused = item.status === 'paused';
  const savings = item.original_price && item.current_price ? item.original_price - item.current_price : null;
  const toTarget = item.current_price != null ? item.current_price - item.target_price : null;

  const checkNow = async () => {
    try {
      await api(`/items/${item.id}/check`, { body: {} });
      toast({ title: 'Verificação solicitada', body: 'O preço será atualizado em instantes.' });
    } catch (e: any) {
      toast({ title: 'Não foi possível verificar agora', body: e.message, tone: 'error' });
    }
  };

  const remove = async () => {
    await api(`/items/${item.id}`, { method: 'DELETE' });
    invalidate();
    navigate('/');
    toast({ title: 'Produto removido' });
  };

  return (
    <article aria-labelledby="item-title" className="space-y-8">
      <header>
        <Link to="/" className="btn-ghost -ml-3 mb-4 lg:hidden">
          <Icon name="back" size={16} /> Voltar
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge item={item} />
          <span className="muted text-xs">{storeLabel(item)}</span>
        </div>
        <h1 id="item-title" className="mt-3 text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{item.name}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn-primary" href={item.url} target="_blank" rel="noreferrer noopener">
            <Icon name="external" size={16} /> Abrir na loja
          </a>
          <button className="btn-outline" onClick={() => update.mutate({ id: item.id, status: paused ? 'monitoring' : 'paused' })}>
            <Icon name={paused ? 'play' : 'pause'} size={16} /> {paused ? 'Retomar' : 'Pausar'}
          </button>
          <button className="btn-outline" onClick={checkNow} disabled={paused}>
            <Icon name="refresh" size={16} /> Verificar agora
          </button>
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Excluir produto" title="Excluir">
            <Icon name="trash" size={16} />
          </button>
        </div>
      </header>

      <FailureNote item={item} />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-100 bg-gray-100 dark:border-gray-800 dark:bg-gray-800 sm:grid-cols-4">
        {[
          ['Preço atual', <span className={item.status === 'reached' ? 'text-accent dark:text-accent-dark' : ''}>{money(item.current_price, item.currency)}</span>],
          ['Preço-alvo', <TargetEditor item={item} />],
          ['Menor preço', money(item.lowest_price, item.currency)],
          ['Até o alvo', toTarget == null ? '—' : toTarget <= 0 ? 'Atingido' : money(toTarget, item.currency)],
        ].map(([label, value], i) => (
          <div key={i} className="bg-white p-4 dark:bg-gray-900">
            <dt className="muted text-xs">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="chart-title">
        <h2 id="chart-title" className="mb-3 text-sm font-semibold">Histórico de preços</h2>
        <PriceChart history={item.history} target={item.target_price} currency={item.currency} />
      </section>

      <section aria-labelledby="info-title" className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <h2 id="info-title" className="sr-only">Detalhes</h2>
        <Info label="Preço sem promoção" value={item.original_price ? `${money(item.original_price, item.currency)}${savings ? ` (economia de ${money(savings, item.currency)})` : ''}` : '—'} />
        <Info label="Frete" value={item.shipping_price == null ? 'Não informado' : item.shipping_price === 0 ? 'Grátis' : money(item.shipping_price, item.currency)} />
        <Info label="Estoque" value={item.in_stock == null ? 'Não informado' : item.in_stock ? 'Disponível' : 'Indisponível'} />
        <Info label="Menor preço em" value={dateTime(item.lowest_price_at)} />
        <Info label="Última verificação" value={`${dateTime(item.last_checked_at)} (${timeAgo(item.last_checked_at)})`} />
        <Info label="Próxima verificação" value={paused ? 'Pausado' : timeAgo(item.next_check_at)} />
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2 dark:border-gray-800">
          <label htmlFor="detail-interval" className="muted">Verificar a cada</label>
          <select
            id="detail-interval"
            className="input h-8 w-auto py-1 text-sm"
            value={item.interval_min}
            onChange={(e) => update.mutate({ id: item.id, intervalMin: Number(e.target.value) })}
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2 dark:border-gray-800">
          <label htmlFor="detail-list" className="muted">Lista</label>
          <select id="detail-list" className="input h-8 w-auto py-1 text-sm" value={item.list_id} onChange={(e) => update.mutate({ id: item.id, listId: e.target.value })}>
            {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </section>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Excluir produto">
        <p className="muted text-sm">O monitoramento e o histórico de preços de “{item.name}” serão apagados.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
          <button className="btn-primary" onClick={remove}>Excluir</button>
        </div>
      </Dialog>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2 dark:border-gray-800">
      <span className="muted">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
