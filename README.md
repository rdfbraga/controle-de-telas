# Controle de Telas

Webapp para pais e responsáveis acompanharem e operarem o tempo diário de tela das crianças, de qualquer navegador (celular, tablet, desktop), em vários dispositivos ao mesmo tempo. Uma mudança feita em um aparelho aparece nos outros em tempo quase real.

> **Status (MVP):** sem autenticação. Qualquer pessoa que acessar o endereço do app opera a mesma família. Use apenas em rede privada ou atrás de um proxy com senha até a autenticação ser implementada.

## Como rodar

Requer Node 22+.

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm test           # testes da lógica de tempo e do estado diário
npm run build && npm start   # produção (porta 3000, ou PORT=...)
```

Variáveis opcionais:

- `DATABASE_PATH` — arquivo do SQLite (padrão `data/telas.db`; faça backup/volume persistente dele).
- `TZ_FAMILIA` — fuso da família, usado só na criação do banco (padrão `America/Sao_Paulo`).

## Como usar

Cadastre as crianças no formulário no fim da tela (nome + limite diário em minutos). Em cada cartão:

- **Iniciar / Pausar / Parar** o cronômetro;
- **Usado ±5**: corrige o tempo já usado no dia;
- **Limite ±15** e **↺**: ajusta o limite só de hoje ou volta ao padrão.

O campo "Quem está operando?" é opcional e fica só no aparelho; serve para registrar o autor dos ajustes. O app pode ser instalado na tela inicial (PWA).

## Decisões de arquitetura

- **SvelteKit + TypeScript** (adapter Node): um único processo serve UI e API. Pouco código, pouca dependência.
- **SQLite** (`better-sqlite3`), um arquivo só: custo zero e fácil de fazer backup. Limitação: exige uma única instância do servidor, o que é suficiente para uso familiar. Se for preciso, migrar para Postgres/Turso afeta apenas `src/lib/server/db.ts` e `service.ts`.
- **Cronômetro baseado em timestamps do servidor**: cada sessão de uso guarda `start_ms`/`end_ms` (nulo enquanto roda). O tempo usado do dia é a soma das sessões que caem dentro do dia (sessões que cruzam a meia-noite são divididas) mais os ajustes manuais. O cliente só anima o contador a partir do horário do servidor; abas fechadas ou vários aparelhos não causam divergência.
- **Tempo real por SSE** (`/api/events`): o servidor avisa "mudou" e cada cliente busca `/api/state`. Também recarrega ao voltar para a aba e ao reconectar.
- **Dia local**: o "dia" segue o fuso da família (`family.timezone`).
- **Modelo de dados** (`src/lib/server/db.ts`): `family` (única, por ora), `child` (com limite diário padrão), `usage_session`, `day_state` (limite do dia e se foi encerrado) e `time_adjustment` (ajustes de minutos, com autor opcional). A tabela de responsáveis será criada junto com a autenticação.

## Estrutura

```
src/lib/server/time.ts      lógica pura de tempo (dias, fuso, sobreposição)
src/lib/server/service.ts   regras do estado diário e ações
src/lib/server/db.ts        schema SQLite
src/routes/api/*            state, children, children/[id]/action, events (SSE)
src/routes/+page.svelte     tela do dia
tests/                      Vitest
```

## Próximos passos

- Autenticação dos responsáveis e convite/código de família (adiado por pedido).
- Histórico por dia, limites por dia da semana, notificações ao estourar o limite.
