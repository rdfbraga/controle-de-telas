<script lang="ts">
	import { onMount } from 'svelte';

	type Token = { id: number; minutes: number; status: 'available' | 'running' | 'paused' | 'used'; remainingMs: number; endsAtMs: number | null };
	type Child = { id: number; name: string; tokens: Token[]; template: number[]; totalMinutes: number; remainingMs: number; running: boolean };
	type AppState = { now: number; day: string; children: Child[] };

	let app = $state<AppState | null>(null);
	let offset = 0; // relógio do servidor - relógio local
	let tick = $state(Date.now());
	let error = $state('');
	let newName = $state('');
	let newTpl = $state('30, 30, 30');
	let extra = $state<Record<number, number>>({});
	let tplEdit = $state<Record<number, string>>({});
	let reloading = false;

	function apply(s: AppState) {
		app = s;
		offset = s.now - Date.now();
	}
	async function load() {
		try {
			const r = await fetch('/api/state');
			if (r.status === 401) { location.href = '/entrar'; return; }
			apply(await r.json());
			error = '';
		} catch {
			error = 'Sem conexão com o servidor';
		}
	}
	async function post(url: string, body: object): Promise<boolean> {
		const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (r.status === 401) { location.href = '/entrar'; return false; }
		if (!r.ok) { error = (await r.json().catch(() => ({ message: 'Erro' }))).message; await load(); return false; }
		error = '';
		apply(await r.json());
		return true;
	}
	const act = (id: number, a: object) => post(`/api/children/${id}/action`, a);
	const parse = (s: string) => s.split(/[,;\s]+/).filter(Boolean).map(Number);

	async function add() {
		if (!newName.trim()) return;
		if (await post('/api/children', { name: newName, template: parse(newTpl) })) newName = '';
	}
	function discard(c: Child) {
		if (confirm(`Descartar a ficha em uso de ${c.name}? O tempo que sobrou será perdido.`)) act(c.id, { type: 'discard' });
	}

	onMount(() => {
		load();
		const es = new EventSource('/api/events');
		es.addEventListener('change', load);
		es.onopen = load;
		const iv = setInterval(() => (tick = Date.now()), 500);
		const vis = () => document.visibilityState === 'visible' && load();
		document.addEventListener('visibilitychange', vis);
		if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
		return () => { es.close(); clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
	});

	// tempo restante exibido: deriva do instante de término definido pelo servidor
	function left(t: Token) {
		if (t.status === 'running' && t.endsAtMs !== null) return Math.max(0, t.endsAtMs - (tick + offset));
		return t.remainingMs;
	}
	// quando uma contagem chega a zero no relógio local, pede o estado ao servidor (uma vez)
	$effect(() => {
		if (!app || reloading) return;
		if (app.children.some((c) => c.tokens.some((t) => t.status === 'running' && left(t) <= 0))) {
			reloading = true;
			load().finally(() => setTimeout(() => (reloading = false), 1500));
		}
	});

	function fmt(ms: number) {
		const t = Math.round(ms / 1000);
		const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
		const p = (n: number) => String(n).padStart(2, '0');
		return `${h ? h + ':' : ''}${p(m)}:${p(s)}`;
	}
	const active = (c: Child) => c.tokens.find((t) => t.status === 'running') ?? c.tokens.find((t) => t.status === 'paused');
	const free = (c: Child) => c.tokens.filter((t) => t.status !== 'used').length;
</script>

<main>
	<h1>Controle de Telas</h1>
	{#if error}<p class="err">{error}</p>{/if}

	{#if app}
		{#each app.children as c (c.id)}
			{@const a = active(c)}
			<section class:running={c.running}>
				<div class="top">
					<h2>{c.name}</h2>
					<span class="badge">{free(c)} de {c.tokens.length} fichas</span>
				</div>

				{#if a}
					<div class="big" class:low={left(a) < 60_000}>{fmt(left(a))}</div>
					<p class="sub">{a.status === 'running' ? 'Ficha em uso' : 'Ficha pausada'} · {a.minutes} min</p>
					<div class="row">
						{#if a.status === 'running'}
							<button onclick={() => act(c.id, { type: 'pause' })}>⏸ Pausar</button>
						{:else}
							<button class="go" onclick={() => act(c.id, { type: 'start', tokenId: a.id })}>▶ Retomar</button>
						{/if}
						<button onclick={() => discard(c)}>🗑 Descartar</button>
					</div>
				{:else if c.tokens.length && free(c) === 0}
					<p class="sub">Acabaram as fichas de hoje 🎉</p>
				{:else}
					<p class="sub">Toque em uma ficha para começar</p>
				{/if}

				<div class="tokens">
					{#each c.tokens as t (t.id)}
						<div class="slot">
							<button
								class="token {t.status}"
								disabled={t.status === 'used' || (c.running && t.status !== 'running')}
								onclick={() => act(c.id, { type: 'start', tokenId: t.id })}
								title={t.status === 'used' ? 'Já usada hoje' : 'Iniciar esta ficha'}
							>
								<b>{t.minutes}</b><small>min</small>
								{#if t.status === 'running'}<em>{fmt(left(t))}</em>
								{:else if t.status === 'paused'}<em>⏸ {fmt(t.remainingMs)}</em>
								{:else if t.status === 'used'}<em>usada</em>{/if}
							</button>
							{#if t.status === 'available'}
								<button class="x" title="Remover ficha" onclick={() => act(c.id, { type: 'removeToken', tokenId: t.id })}>×</button>
							{/if}
						</div>
					{/each}
				</div>

				<details>
					<summary>Ajustes</summary>
					<div class="row">
						<span>Ficha extra hoje:</span>
						<input type="number" min="1" max="480" bind:value={extra[c.id]} placeholder="min" />
						<button onclick={() => extra[c.id] && act(c.id, { type: 'addToken', minutes: extra[c.id] })}>+ Adicionar</button>
					</div>
					<div class="row">
						<span>Fichas de todo dia:</span>
						<input bind:value={tplEdit[c.id]} placeholder={c.template.join(', ')} />
						<button onclick={() => tplEdit[c.id] && act(c.id, { type: 'setTemplate', minutes: parse(tplEdit[c.id]) }).then((ok) => ok && (tplEdit[c.id] = ''))}>Salvar</button>
					</div>
					<p class="hint">Hoje: {c.template.join(' + ') || 'nenhuma'} min por dia. Mudanças no modelo valem a partir de amanhã.</p>
				</details>
			</section>
		{:else}
			<p>Nenhuma criança cadastrada ainda.</p>
		{/each}
	{:else}
		<p>Carregando…</p>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); add(); }}>
		<input placeholder="Nome da criança" bind:value={newName} />
		<input bind:value={newTpl} title="Minutos de cada ficha, separados por vírgula" />
		<button>Adicionar</button>
	</form>
	<p class="hint">Fichas por dia: informe os minutos de cada uma, ex.: <code>30, 30, 15</code>.</p>
</main>

<style>
	:global(body) { margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
	main { max-width: 560px; margin: 0 auto; padding: 1rem; }
	h1 { margin: 0 0 .5rem; font-size: 1.4rem; }
	section { background: #fff; border-radius: 1rem; padding: 1rem; margin: 1rem 0; box-shadow: 0 1px 3px #0002; }
	section.running { outline: 2px solid #22c55e; }
	.top { display: flex; justify-content: space-between; align-items: center; }
	h2 { margin: 0; }
	.badge { font-size: .8rem; padding: .15rem .6rem; border-radius: 99px; background: #e2e8f0; }
	.big { font-size: 3.4rem; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: .4rem; }
	.big.low { color: #dc2626; }
	.sub { margin: .2rem 0 .6rem; color: #475569; }
	.tokens { display: flex; flex-wrap: wrap; gap: .5rem; margin: .6rem 0; }
	.slot { position: relative; }
	.token { width: 5.2rem; height: 5.2rem; border-radius: 50%; border: 3px solid #2563eb; background: #dbeafe; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; padding: 0; }
	.token b { font-size: 1.5rem; }
	.token small { font-size: .7rem; }
	.token em { font-size: .72rem; font-style: normal; font-variant-numeric: tabular-nums; }
	.token.running { background: #bbf7d0; border-color: #16a34a; }
	.token.paused { background: #fef3c7; border-color: #d97706; }
	.token.used { background: #e2e8f0; border-color: #94a3b8; color: #64748b; text-decoration: line-through; opacity: .7; }
	.token:disabled { cursor: not-allowed; }
	.x { position: absolute; top: -6px; right: -6px; width: 1.4rem; height: 1.4rem; padding: 0; border-radius: 50%; font-size: .9rem; line-height: 1; background: #fecaca; }
	.row { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; margin-top: .5rem; }
	details { margin-top: .5rem; } summary { cursor: pointer; color: #475569; }
	input { padding: .5rem; border: 1px solid #cbd5e1; border-radius: .5rem; font-size: 1rem; min-width: 0; }
	.row input[type='number'] { width: 5rem; } .row input:not([type]) { flex: 1; }
	button { padding: .6rem .9rem; border: 0; border-radius: .6rem; background: #e2e8f0; font-size: 1rem; cursor: pointer; }
	button.go { background: #2563eb; color: #fff; }
	form { display: flex; gap: .4rem; } form input:first-child { flex: 1; } form input:nth-child(2) { width: 7rem; }
	.hint { font-size: .85rem; color: #64748b; }
	.err { color: #dc2626; }
</style>
