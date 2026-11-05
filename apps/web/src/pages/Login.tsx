import { useState, type FormEvent } from 'react';
import { Logo } from '../components/AppShell';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const email = String(f.get('email')), password = String(f.get('password'));
      if (mode === 'login') await login(email, password);
      else await register(email, password, String(f.get('name') || '') || undefined);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="card p-8">
          <h1 className="text-lg font-semibold">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
          <p className="muted mt-1 text-sm">
            {mode === 'login' ? 'Acompanhe seus produtos e receba alertas de preço.' : 'Leva menos de um minuto.'}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="name">Nome (opcional)</label>
                <input id="name" name="name" autoComplete="name" className="input" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="password">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="input"
                aria-describedby={mode === 'register' ? 'pw-hint' : undefined}
              />
              {mode === 'register' && <p id="pw-hint" className="muted mt-1.5 text-xs">Mínimo de 8 caracteres.</p>}
            </div>
            {error && <p role="alert" className="text-sm font-medium">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
        </div>
        <p className="muted mt-6 text-center text-sm">
          {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
          <button className="font-medium text-gray-900 underline underline-offset-4 dark:text-gray-50" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </div>
    </main>
  );
}
