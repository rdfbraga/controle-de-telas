# Controle de Telas

Webapp para pais e responsáveis acompanharem e operarem o tempo diário de tela das crianças, de qualquer navegador (celular, tablet, desktop), em vários dispositivos ao mesmo tempo. Uma mudança feita em um aparelho aparece nos outros em tempo quase real.

> **Acesso:** protegido por um **PIN da família** (sem usuário/senha). Defina `PIN_FAMILIA` no arquivo `.env`; sem PIN o app fica aberto (use assim só em rede local).

## Como rodar

Requer Node 22.13 ou mais novo (usa o SQLite embutido do Node, sem compilar nada).

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm test           # testes da lógica de tempo e do estado diário
npm run build && npm start   # produção (porta 3000, ou PORT=...); lê o .env
```

Copie `.env.example` para `.env` e escolha o PIN (`PIN_FAMILIA=1234`). Quem abrir o app digita o PIN uma vez; o navegador lembra por 1 ano. Trocar o PIN desconecta todos. Após 5 erros seguidos, a origem fica bloqueada por 5 minutos. Use HTTPS ao expor na internet (o PIN trafega no login).

Variáveis:

- `PIN_FAMILIA` — PIN de acesso (vazio = sem proteção).

- `DATABASE_PATH` — arquivo do SQLite (padrão `data/telas.db`; faça backup/volume persistente dele).
- `TZ_FAMILIA` — fuso da família, usado só na criação do banco (padrão `America/Sao_Paulo`).

## Como usar (fichas)

Cada criança tem um **modelo de fichas** (ex.: `30, 30, 15` = três fichas, de 30, 30 e 15 minutos). Todo dia o modelo gera fichas novas; as do dia anterior desaparecem.

- **Tocar numa ficha** inicia a contagem regressiva. Só uma ficha por criança roda por vez.
- **Ao zerar**, a ficha vira **usada** e fica bloqueada até o dia seguinte. Uma ficha usada nunca pode ser reutilizada.
- **Pausar** guarda o tempo que sobrou (a ficha pode ser retomada); **Descartar** encerra a ficha em uso e perde o resto.
- Em **Ajustes**: adicionar uma ficha extra só para hoje, remover fichas ainda não iniciadas (×) e alterar o modelo diário (vale a partir de amanhã).
- Uma ficha que ainda esteja rodando à meia-noite é encerrada.

Cadastre as crianças no formulário no fim da tela. O app pode ser instalado na tela inicial (PWA).

## Decisões de arquitetura

- **SvelteKit + TypeScript** (adapter Node): um único processo serve UI e API.
- **SQLite embutido do Node** (`node:sqlite`, sem dependência nativa), um arquivo só. Exige uma única instância do servidor, suficiente para uso familiar.
- **Contagem baseada em timestamps do servidor**: cada ficha guarda `started_ms` (início da contagem atual) e `consumed_ms` (gasto até a última pausa). O restante é sempre calculado como `minutos − consumido − (agora − início)`, então abas fechadas ou vários aparelhos não causam divergência. Fichas que terminam são marcadas como usadas de forma preguiçosa, na próxima leitura ou ação, sem timers no servidor.
- **Tempo real por SSE** (`/api/events`): o servidor avisa "mudou" e cada cliente busca `/api/state`. O cliente anima o contador com base no instante de término informado pelo servidor.
- **Dia local**: o "dia" segue o fuso da família (`family.timezone`). As fichas do dia são geradas na primeira leitura do dia.
- **Modelo de dados** (`src/lib/server/db.ts`): `family`, `child`, `child_template` (fichas do modelo), `day_init` (dias já gerados) e `token` (fichas do dia). Bancos do modelo antigo (limite em minutos) são migrados automaticamente: o limite vira fichas de 30 min.

## Estrutura

```
src/lib/server/time.ts      lógica pura de tempo (dias, fuso, progresso da ficha)
src/lib/server/service.ts   fichas do dia e ações
src/lib/server/db.ts        schema SQLite
src/routes/api/*            state, children, children/[id]/action, events (SSE)
src/routes/+page.svelte     tela do dia
tests/                      Vitest
```

## Próximos passos

- Contas individuais por responsável (hoje é um PIN compartilhado).
- Histórico por dia, modelo de fichas por dia da semana, aviso sonoro/notificação quando uma ficha acabar.
