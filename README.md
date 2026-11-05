# SpeedTime

Monitor de preços: monte listas de produtos, defina um preço-alvo e receba um alerta (push no navegador, e-mail ou Telegram) quando o preço cair. A verificação roda 24/7 em segundo plano, a cada 15, 30 ou 60 minutos.

## Funcionalidades

- **Listas**: criar, renomear e excluir (ex.: Eletrônicos, Casa, Presentes). Cada produto tem preço atual, preço-alvo, menor preço, status (monitorando / atingido / pausado) e data da última verificação.
- **Busca instantânea** por nome, loja ou lista, com filtros por status (inclusive "com falha") e ordenação por preço, variação ou data.
- **Histórico de preços**: gráfico de linha em SVG com a linha do alvo e os pontos de queda marcados.
- **Alertas em tempo real**: Web Push (funciona com a aba fechada), toast no app via SSE com contador de não lidos, e-mail (Resend) e Telegram opcionais.
- **Anti-spam**: um alerta por queda. Um novo alerta só sai se o preço bater um novo mínimo, ou se subir acima do alvo e cair de novo (com histerese de 0,5%, para variações de centavos não gerarem avisos).
- **Ações rápidas**: pausar/retomar, editar o preço-alvo direto na lista, abrir na loja, verificar agora, marcar alerta como lido.
- **Falha visível**: se a loja bloquear ou o link quebrar, o item mostra "Não foi possível verificar" com a hora da última verificação bem-sucedida. Os demais itens continuam normalmente, e o item com falha entra em backoff (2×, 4×, até 8× o intervalo).
- Design minimalista em branco e cinzas, com um único acento verde para "atingido". Modo escuro, duas colunas no desktop, uma coluna com navegação inferior no mobile. Navegável por teclado, com contraste AA.

## Estrutura

```
speedtime/
├── apps/
│   ├── server/                    API (Express) + worker (BullMQ), em TypeScript
│   │   ├── db/migrations/         Esquema SQL (001_init.sql)
│   │   ├── scripts/               migrate.ts, vapid.ts
│   │   ├── src/
│   │   │   ├── adapters/          Um adaptador por loja, com parser isolado
│   │   │   │   ├── types.ts       Interface StoreAdapter + AdapterError
│   │   │   │   ├── generic.ts     JSON-LD / meta tags / microdata (qualquer loja)
│   │   │   │   ├── mercadolivre.ts  API oficial → fallback JSON-LD
│   │   │   │   ├── amazon.ts      Product Advertising API 5 (SigV4)
│   │   │   │   ├── shopee.ts      API de Afiliados (GraphQL)
│   │   │   │   ├── aliexpress.ts  API de Afiliados → fallback página
│   │   │   │   └── index.ts       Registro e roteamento por domínio (Temu e Shein usam o genérico)
│   │   │   ├── alerts/
│   │   │   │   ├── antispam.ts    Regra de alerta (função pura, testada)
│   │   │   │   ├── dispatcher.ts  Entrega por canal com registro e retentativa
│   │   │   │   └── channels/      webpush.ts, email.ts (Resend), telegram.ts
│   │   │   ├── api/               Rotas: auth, lists, items, alerts, settings, push, telegram, events (SSE)
│   │   │   ├── net/http.ts        Cliente HTTP: robots.txt, limite por host, cache, detecção de bloqueio
│   │   │   ├── worker/            Agendador + verificação de itens
│   │   │   └── lib/               config (env validado com zod), db, redis, filas, logger (pino)
│   │   └── test/                  Vitest + fixtures HTML/JSON
│   └── web/                       React + Vite + Tailwind
│       ├── public/sw.js           Service worker (Web Push)
│       └── src/
│           ├── pages/             Login, Dashboard (listas + detalhe), Busca, Alertas, Configurações
│           ├── components/        ItemRow, ItemDetail, PriceChart, ListsBar, AddItemDialog…
│           └── lib/               api, auth, queries (React Query), push, eventos SSE, tema
├── render.yaml                    Blueprint do Render (API + worker + Postgres + Redis)
└── railway.json                   Config do Railway (serviço da API)
```

## Como funciona a coleta

1. A cada minuto o **agendador** pega os itens vencidos (`next_check_at <= now()`), com `FOR UPDATE SKIP LOCKED` e um lease de 10 minutos, e coloca cada um na fila `price-checks`. Isso funciona com vários workers em paralelo.
2. O **worker** escolhe o adaptador da loja e busca o preço:
   - **APIs oficiais primeiro**: Mercado Livre, Amazon PA-API, Shopee Afiliados, AliExpress Afiliados.
   - Sem API, o **parser genérico** lê dados estruturados (schema.org JSON-LD, Open Graph ou microdata). Ele funciona em boa parte das lojas brasileiras (Magalu, KaBuM!, Americanas etc.). Uma mudança de layout não derruba o sistema, porque o parser não depende de seletores CSS.
3. O **cliente HTTP** respeita o `robots.txt` (cache de 24h) e espera um intervalo mínimo por host (lock no Redis, compartilhado entre os workers). Ele guarda em cache as respostas (vários usuários com o mesmo link geram uma única requisição) e alterna moderadamente o User-Agent (um por host por hora, identificado como `SpeedTimeBot`). Se encontrar captcha ou receber 403/429, marca o item como **bloqueado** e não tenta contornar.
4. O preço é gravado em `price_history` com moeda, preço "de" (promoção), frete e estoque, separadamente. A regra anti-spam decide se dispara alerta, tudo dentro de uma transação com `SELECT … FOR UPDATE`.
5. O alerta vai para a fila `notifications`. Cada canal é registrado em `alert_deliveries`, então uma retentativa nunca reenvia um canal que já deu certo. Assinaturas push expiradas (404/410) são removidas.

### Lojas suportadas

| Loja | Método | Precisa de |
|---|---|---|
| Mercado Livre | API oficial (`/items`, `/products`), com fallback para o JSON-LD da página | `ML_ACCESS_TOKEN` (opcional) |
| Amazon | Product Advertising API 5 (sem scraping, que é proibido pelos termos) | Conta de Associados com acesso à PA-API |
| Shopee | API de Afiliados (as páginas bloqueiam robôs) | App ID e Secret de afiliado |
| AliExpress | API de Afiliados, com fallback para dados estruturados | App Key e Secret (opcional) |
| Temu, Shein | Parser genérico. Essas lojas costumam bloquear robôs, e então o item mostra "não foi possível verificar" | — |
| Qualquer outra | Parser genérico (JSON-LD / meta tags / microdata) | — |

Para adicionar uma loja, crie `src/adapters/minhaloja.ts` implementando `StoreAdapter` (`matches` + `fetchPrice`), registre em `adapters/index.ts` antes do `genericAdapter` e adicione fixtures e testes em `test/`.

## Rodando localmente

Pré-requisitos: Node 20+, PostgreSQL 14+ e Redis 6+. Com Docker:

```bash
docker run -d --name st-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=speedtime -p 5432:5432 postgres:16
docker run -d --name st-redis -p 6379:6379 redis:7
```

```bash
npm install
cp apps/server/.env.example apps/server/.env
npm run vapid -w apps/server >> apps/server/.env   # chaves do Web Push (apague as linhas VAPID vazias acima)
npm run migrate
npm run dev        # API :4000, worker e frontend :5173 (o Vite faz proxy de /api)
```

Abra http://localhost:5173 e crie uma conta. Três listas de exemplo são criadas automaticamente.

Testes e checagem de tipos:

```bash
npm test           # adaptadores (com fixtures), anti-spam, parser de preço, cliente HTTP
npm run typecheck
```

## Deploy

### Frontend na Vercel
1. Importe o repositório e defina **Root Directory** = `apps/web`.
2. Em `apps/web/vercel.json`, troque `https://SUA-API.up.railway.app` pela URL da sua API. O rewrite deixa `/api` na mesma origem.
   Outra opção: defina `VITE_API_URL=https://sua-api…` e libere essa origem em `WEB_ORIGIN` na API.

### API e worker no Railway
1. Crie um projeto e adicione **PostgreSQL** e **Redis**.
2. Serviço **api**: aponte para o repositório. O `railway.json` já roda as migrações e inicia a API. Defina as variáveis de `apps/server/.env.example` (use `${{Postgres.DATABASE_URL}}` e `${{Redis.REDIS_URL}}`).
3. Serviço **worker**: mesmo repositório, com Start Command `npm run start:worker -w apps/server`, sem healthcheck e as mesmas variáveis.
4. Ajuste `WEB_ORIGIN` e `APP_URL` para o domínio da Vercel.

### Ou no Render
Use o `render.yaml` (Blueprint). Ele cria a API, o worker, o Postgres e o Redis com `noeviction`, que o BullMQ exige.

### Problema comum: "Erro 404" / "Servidor indisponível" ao entrar
A Vercel publica **só o frontend**. Login, listas e alertas dependem da API e do worker, que precisam estar publicados (Railway ou Render, com Postgres e Redis). Confira:
1. Abra `https://SUA-API/health` no navegador. Ele deve responder `{"ok":true}`.
2. Em `apps/web/vercel.json`, o rewrite de `/api` deve apontar para essa URL (e não para o `SUA-API` de exemplo). Faça um novo deploy na Vercel depois de mudar.
   Alternativa: defina `VITE_API_URL` na Vercel e coloque o domínio da Vercel em `WEB_ORIGIN` na API.
3. Na Vercel, o **Root Directory** precisa ser `apps/web`, senão o `vercel.json` é ignorado.

### Telegram (opcional)
1. Crie um bot com o @BotFather e defina `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` e `TELEGRAM_WEBHOOK_SECRET`.
2. Registre o webhook:
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://SUA-API/api/telegram/webhook&secret_token=<SECRET>"`
3. No app, em Configurações, use **Vincular Telegram**. O bot confirma o vínculo automaticamente.

> No iPhone, o Web Push só funciona com o app adicionado à Tela de Início (iOS 16.4+). Nesse caso, o Telegram costuma ser mais confiável.

## Banco de dados

O esquema completo está em `apps/server/db/migrations/001_init.sql`:
`users`, `user_settings`, `push_subscriptions`, `lists`, `items` (estado atual + saúde da verificação + estado anti-spam), `price_history`, `alerts` e `alert_deliveries`.
