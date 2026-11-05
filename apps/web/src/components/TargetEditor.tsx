import { useEffect, useRef, useState } from 'react';
import type { Item } from '../lib/api';
import { money } from '../lib/format';
import { useUpdateItem } from '../lib/queries';
import { useToast } from './Toasts';

/** Edição do preço-alvo direto na lista: clique, digite, Enter salva, Esc cancela. */
export function TargetEditor({ item, className = '' }: { item: Item; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const update = useUpdateItem();
  const toast = useToast();

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const save = () => {
    const n = Number(value.replace(/\./g, '').replace(',', '.'));
    setEditing(false);
    if (!Number.isFinite(n) || n <= 0 || n === item.target_price) return;
    update.mutate({ id: item.id, targetPrice: n }, { onError: (e) => toast({ title: 'Não foi possível salvar', body: e.message, tone: 'error' }) });
  };

  if (editing) {
    return (
      <input
        ref={input}
        inputMode="decimal"
        aria-label={`Novo preço-alvo para ${item.name}`}
        className="input h-8 w-28 px-2 py-1 text-right"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={save}
      />
    );
  }
  return (
    <button
      type="button"
      className={`rounded px-1 -mx-1 text-left underline decoration-gray-400 decoration-dotted underline-offset-4 hover:decoration-gray-900 dark:hover:decoration-gray-50 ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setValue(String(item.target_price).replace('.', ','));
        setEditing(true);
      }}
      title="Editar preço-alvo"
      aria-label={`Preço-alvo ${money(item.target_price, item.currency)}. Clique para editar`}
    >
      {money(item.target_price, item.currency)}
    </button>
  );
}
