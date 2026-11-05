import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toasts';
import { api, type Settings } from '../lib/api';
import { useAuth } from '../lib/auth';
import { disablePush, enablePush, hasPushSubscription, pushSupported } from '../lib/push';
import { useSettings } from '../lib/queries';
import { applyTheme, getTheme, type Theme } from '../lib/theme';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-gray-100 py-8 dark:border-gray-800 md:grid-cols-[220px_1fr] md:gap-10">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="muted mt-1 text-sm">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Toggle({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint && <p id={`${id}-hint`} className="muted mt-0.5 text-xs">{hint}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
          checked ? 'border-gray-900 bg-gray-900 dark:border-gray-50 dark:bg-gray-50' : 'border-gray-400 bg-gray-100 dark:border-gray-700 dark:bg-gray-800'
        }`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-subtle transition-transform dark:bg-gray-900 ${checked ? 'translate-x-6' : 'translate-x-1 dark:bg-gray-400'}`} />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { data: s } = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [pushOn, setPushOn] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => { hasPushSubscription().then(setPushOn); }, []);
  useEffect(() => { if (s) setEmail(s.email_address ?? ''); }, [s?.email_address]);

  const save = async (patch: Partial<Settings> & { apply_interval_to_all?: boolean }, message?: string) => {
    try {
      const next = await api<Partial<Settings>>('/settings', { method: 'PUT', body: patch });
      qc.setQueryData<Settings>(['settings'], (old) => (old ? { ...old, ...next } : old));
      if (patch.apply_interval_to_all) qc.invalidateQueries({ queryKey: ['items'] });
      if (message) toast({ title: message });
    } catch (e: any) {
      toast({ title: 'Não foi possível salvar', body: e.message, tone: 'error' });
    }
  };

  const togglePush = async (on: boolean) => {
    try {
      if (on) await enablePush();
      else await disablePush();
      setPushOn(on);
      await save({ push_enabled: on });
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e: any) {
      toast({ title: 'Notificações push', body: e.message, tone: 'error' });
    }
  };

  const linkTelegram = async () => {
    try {
      const { url } = await api<{ url: string }>('/settings/telegram/link', { body: {} });
      window.open(url, '_blank', 'noopener');
      toast({ title: 'Abra o bot e toque em “Começar”', body: 'Depois volte aqui; o vínculo é automático.' });
      setTimeout(() => qc.invalidateQueries({ queryKey: ['settings'] }), 15_000);
    } catch (e: any) {
      toast({ title: 'Telegram', body: e.message, tone: 'error' });
    }
  };

  const test = async () => {
    try {
      await api('/settings/test-notification', { body: {} });
      toast({ title: 'Teste enviado', body: 'Confira os canais ativos em alguns segundos.' });
    } catch (e: any) {
      toast({ title: 'Falha no teste', body: e.message, tone: 'error' });
    }
  };

  if (!s) return <AppShell><p className="muted text-sm">Carregando…</p></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
        <p className="muted mt-1 text-sm">{user?.email}</p>

        <Section title="Notificações" description="Escolha onde receber alertas. Cada queda gera um só aviso por canal.">
          <Toggle
            id="push"
            label="Push no navegador"
            hint={!s.capabilities.push ? 'Indisponível: servidor sem chaves VAPID.' : !pushSupported() ? 'Navegador sem suporte. No iPhone, adicione à Tela de Início.' : pushOn ? `Ativo neste dispositivo · ${s.push_devices} dispositivo(s) no total` : 'Funciona mesmo com a aba fechada.'}
            checked={pushOn}
            disabled={!s.capabilities.push || !pushSupported()}
            onChange={togglePush}
          />
          <Toggle
            id="email"
            label="E-mail"
            hint={s.capabilities.email ? undefined : 'Indisponível: servidor sem RESEND_API_KEY.'}
            checked={s.email_enabled}
            disabled={!s.capabilities.email}
            onChange={(v) => save({ email_enabled: v })}
          />
          {s.email_enabled && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save({ email_address: email || null }, 'E-mail salvo'); }}>
              <label htmlFor="email-address" className="sr-only">E-mail para alertas</label>
              <input id="email-address" type="email" className="input" placeholder={user?.email} value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn-outline shrink-0">Salvar</button>
            </form>
          )}
          <Toggle
            id="telegram"
            label="Telegram"
            hint={!s.capabilities.telegram ? 'Indisponível: servidor sem bot configurado.' : s.telegram_linked ? 'Conta vinculada.' : 'Vincule sua conta para ativar. Mais confiável que push no iPhone.'}
            checked={s.telegram_enabled}
            disabled={!s.capabilities.telegram || !s.telegram_linked}
            onChange={(v) => save({ telegram_enabled: v })}
          />
          {s.capabilities.telegram && (
            <div className="flex gap-2">
              {s.telegram_linked ? (
                <button className="btn-ghost -ml-3" onClick={async () => { await api('/settings/telegram', { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['settings'] }); }}>
                  Desvincular Telegram
                </button>
              ) : (
                <button className="btn-outline" onClick={linkTelegram}>Vincular Telegram</button>
              )}
            </div>
          )}
          <div className="pt-2">
            <button className="btn-outline" onClick={test}><Icon name="bell" size={16} /> Enviar notificação de teste</button>
          </div>
        </Section>

        <Section title="Verificação" description="Frequência padrão para novos produtos. Verificações respeitam limites de cada loja.">
          <fieldset>
            <legend className="sr-only">Intervalo padrão</legend>
            <div className="inline-flex rounded-md border border-gray-100 p-0.5 dark:border-gray-700">
              {[15, 30, 60].map((m) => (
                <label key={m} className={`cursor-pointer rounded px-4 py-1.5 text-sm ${s.default_interval_min === m ? 'bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900' : 'text-gray-700 dark:text-gray-400'} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-900`}>
                  <input type="radio" name="interval" value={m} className="sr-only" checked={s.default_interval_min === m} onChange={() => save({ default_interval_min: m as 15 | 30 | 60 })} />
                  {m} min
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-ghost -ml-3" onClick={() => save({ default_interval_min: s.default_interval_min, apply_interval_to_all: true }, 'Intervalo aplicado a todos os produtos')}>
            Aplicar a todos os produtos existentes
          </button>
        </Section>

        <Section title="Aparência">
          <fieldset>
            <legend className="sr-only">Tema</legend>
            <div className="inline-flex rounded-md border border-gray-100 p-0.5 dark:border-gray-700">
              {([['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']] as const).map(([v, label]) => (
                <label key={v} className={`cursor-pointer rounded px-4 py-1.5 text-sm ${theme === v ? 'bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900' : 'text-gray-700 dark:text-gray-400'} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-900`}>
                  <input type="radio" name="theme" value={v} className="sr-only" checked={theme === v} onChange={() => { setTheme(v); applyTheme(v); save({ theme: v }); }} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title="Lojas" description="Lojas com API oficial são mais estáveis. As demais leem dados estruturados da página e podem ser bloqueadas.">
          <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {s.stores.map((st) => (
              <li key={st.id} className="flex items-center justify-between py-2">
                <span>{st.name}</span>
                <span className="muted text-xs">{st.official ? (st.configured ? 'API oficial' : 'API não configurada') : 'Dados da página'}</span>
              </li>
            ))}
          </ul>
        </Section>

        <div className="py-8">
          <button className="btn-outline" onClick={logout}><Icon name="logout" size={16} /> Sair</button>
        </div>
      </div>
    </AppShell>
  );
}
