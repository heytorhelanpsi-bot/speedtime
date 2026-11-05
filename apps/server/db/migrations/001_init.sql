-- SpeedTime — esquema inicial
-- Valores monetários em NUMERIC(12,2); datas sempre em timestamptz (UTC).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Usuários -------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  name           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_settings (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_interval_min  int  NOT NULL DEFAULT 30 CHECK (default_interval_min IN (15, 30, 60)),
  push_enabled          boolean NOT NULL DEFAULT true,
  email_enabled         boolean NOT NULL DEFAULT false,
  email_address         citext,
  telegram_enabled      boolean NOT NULL DEFAULT false,
  telegram_chat_id      text,
  telegram_link_code    text UNIQUE,
  theme                 text NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);

-- Listas e itens ---------------------------------------------------------------
CREATE TABLE lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id               uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  url                   text NOT NULL,
  store                 text NOT NULL,             -- id do adaptador: mercadolivre, amazon, generic...
  currency              char(3) NOT NULL DEFAULT 'BRL',
  target_price          numeric(12,2) NOT NULL CHECK (target_price > 0),

  -- último preço coletado (promoção e frete separados)
  current_price         numeric(12,2),
  original_price        numeric(12,2),             -- preço "de" quando há promoção
  shipping_price        numeric(12,2),             -- NULL = desconhecido, 0 = grátis
  in_stock              boolean,
  previous_price        numeric(12,2),             -- preço da coleta anterior (para "variação")
  lowest_price          numeric(12,2),
  lowest_price_at       timestamptz,

  status                text NOT NULL DEFAULT 'monitoring'
                        CHECK (status IN ('monitoring', 'reached', 'paused')),
  interval_min          int NOT NULL DEFAULT 30 CHECK (interval_min IN (15, 30, 60)),
  next_check_at         timestamptz NOT NULL DEFAULT now(),

  -- saúde da verificação
  last_checked_at       timestamptz,               -- última tentativa (sucesso ou falha)
  last_success_at       timestamptz,
  last_error            text,
  last_error_code       text,
  last_error_at         timestamptz,
  consecutive_failures  int NOT NULL DEFAULT 0,

  -- anti-spam
  alert_armed           boolean NOT NULL DEFAULT true,
  last_alert_price      numeric(12,2),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_user_idx ON items(user_id);
CREATE INDEX items_list_idx ON items(list_id);
CREATE INDEX items_due_idx  ON items(next_check_at) WHERE status <> 'paused';

CREATE TABLE price_history (
  id              bigserial PRIMARY KEY,
  item_id         uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price           numeric(12,2) NOT NULL,
  original_price  numeric(12,2),
  shipping_price  numeric(12,2),
  currency        char(3) NOT NULL,
  in_stock        boolean,
  captured_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_history_item_idx ON price_history(item_id, captured_at DESC);

-- Alertas ----------------------------------------------------------------------
CREATE TABLE alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id       uuid REFERENCES items(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('target_reached', 'new_low', 'test')),
  price         numeric(12,2),
  target_price  numeric(12,2),
  currency      char(3),
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_user_idx   ON alerts(user_id, created_at DESC);
CREATE INDEX alerts_unread_idx ON alerts(user_id) WHERE read_at IS NULL;

CREATE TABLE alert_deliveries (
  id          bigserial PRIMARY KEY,
  alert_id    uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('push', 'email', 'telegram')),
  status      text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  detail      text,
  attempts    int NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, channel)
);
