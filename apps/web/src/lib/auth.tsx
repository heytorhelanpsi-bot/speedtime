import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokenStore } from './api';

interface User {
  id: string;
  email: string;
  name: string | null;
}
interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener('speedtime:logout', onLogout);
    return () => window.removeEventListener('speedtime:logout', onLogout);
  }, [logout]);

  const handle = async (path: string, body: object) => {
    const r = await api<{ token: string; user: User }>(path, { body });
    tokenStore.set(r.token);
    setUser(r.user);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        logout,
        login: (email, password) => handle('/auth/login', { email, password }),
        register: (email, password, name) => handle('/auth/register', { email, password, name }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
