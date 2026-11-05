-- Segredos gerados automaticamente pelo próprio app (ex.: chaves VAPID do Web Push),
-- para que o deploy funcione sem configurar variáveis de ambiente.
CREATE TABLE app_secrets (
  name        text PRIMARY KEY,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
