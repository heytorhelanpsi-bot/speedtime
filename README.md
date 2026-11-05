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

## Deploy gratuito (Render + Supabase)

O SpeedTime roda como **um serviço só**: o mesmo endereço mostra o site, responde a API e roda o worker 24/7. As tabelas, o segredo de login e as chaves do Web Push são criados automaticamente.

**Parte 1: banco de dados no Supabase (grátis)**
1. Entre em https://supabase.com → **Start your project** → faça login com o GitHub.
2. Clique em **New project**. Escolha um nome (ex.: `speedtime`) e uma **senha só com letras e números** (anote), na região **South America (São Paulo)**. Depois clique em **Create new project** e espere 1 a 2 minutos.
3. No topo do projeto, clique em **Connect**. Na lista, procure **Session pooler** e copie a URI, que se parece com
   `postgresql://postgres.abcd1234:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.
4. Troque `[YOUR-PASSWORD]` pela senha que você criou (sem os colchetes).

**Parte 2: app no Render (grátis)**
1. Entre em https://render.com com **Sign in with GitHub**.
2. Clique em **New +** → **Blueprint** e escolha o repositório **speedtime**.
3. O Render mostra **speedtime** e **speedtime-redis** e pede **DATABASE_URL**: cole a URI do Supabase da parte 1.
4. Clique em **Deploy Blueprint** e espere ficar **Live** (cerca de 5 minutos).
5. Abra o endereço `https://speedtime-xxxx.onrender.com` e crie sua conta.

**Limitações do plano gratuito**
- O plano Free do Render desliga o app após 15 minutos sem acessos. Para evitar isso, o próprio app acessa o seu endereço a cada 10 minutos (`KEEP_ALIVE`). Um único serviço cabe nas 750 h/mês gratuitas.
- Se o Render reiniciar o servidor e o app ficar fora do ar, ele volta no próximo acesso, o que leva cerca de 1 minuto. Para garantir, crie um monitor grátis em https://cron-job.org ou https://uptimerobot.com que acesse `https://speedtime-xxxx.onrender.com/health` a cada 10 minutos.
- O Supabase Free pausa projetos sem atividade por 7 dias. Como o worker consulta o banco a cada minuto, isso não deve acontecer enquanto o app estiver no ar.
- O Redis Free do Render não guarda dados em disco. Só a fila de tarefas fica nele, e ela é recriada sozinha.
- Os limites dos planos gratuitos podem mudar. Confira nos sites do Render e do Supabase.

### Versão paga (mais robusta, ~US$ 13/mês)
Use **New +** → **Blueprint** e, em **Blueprint Path**, informe `render.paid.yaml`. Ele cria o app no plano Starter (sempre ligado) e o Postgres no próprio Render, sem precisar do Supabase.

### Opcional: e-mail e outras lojas
No Render, abra o serviço **speedtime** → **Environment** e adicione só o que quiser usar (veja `apps/server/.env.example`): `RESEND_API_KEY` para alertas por e-mail, `TELEGRAM_*` para o Telegram, e as chaves de afiliado da Amazon, Shopee e AliExpress.

### Alternativas avançadas
- **Frontend na Vercel e API separada:** use `apps/web/vercel.json` (troque `SUA-API` pela URL da API) ou defina `VITE_API_URL` e coloque o domínio da Vercel em `WEB_ORIGIN`.
- **Worker em processo separado** (para escalar): rode `npm run start:worker -w apps/server` em outro serviço e deixe `RUN_WORKER=false` na API.
- **Railway:** crie Postgres e Redis, um serviço a partir do repositório com `npm ci --include=dev && npm run build` e `npm start`, e defina `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `RUN_WORKER=true` e `PUBLIC_URL` (a URL pública).

### Problemas comuns
- **"Erro 404" / "Servidor indisponível" ao entrar:** o site foi publicado **sem** a API, por exemplo só o frontend na Vercel. Use o deploy do Render acima, que publica tudo junto.
- **Deploy falha com erro de conexão com o banco:** confira se você usou a URI do **Session pooler** (porta 5432, host `…pooler.supabase.com`) e se trocou `[YOUR-PASSWORD]` pela senha.

### Telegram (opcional)
1. Crie um bot com o @BotFather e defina `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` e `TELEGRAM_WEBHOOK_SECRET`.
2. Registre o webhook:
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://SUA-API/api/telegram/webhook&secret_token=<SECRET>"`
3. No app, em Configurações, use **Vincular Telegram**. O bot confirma o vínculo automaticamente.

> No iPhone, o Web Push só funciona com o app adicionado à Tela de Início (iOS 16.4+). Nesse caso, o Telegram costuma ser mais confiável.

## Banco de dados

O esquema completo está em `apps/server/db/migrations/001_init.sql`:
`users`, `user_settings`, `push_subscriptions`, `lists`, `items` (estado atual + saúde da verificação + estado anti-spam), `price_history`, `alerts` e `alert_deliveries`.
