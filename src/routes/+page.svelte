<script lang="ts">
	import { onMount } from 'svelte';

	type Child = {
		id: number; name: string; usedMs: number; limitMs: number; remainingMs: number;
		exceeded: boolean; running: boolean; runningSince: number | null;
		status: 'running' | 'paused' | 'stopped' | 'idle';
	};
	type State = { now: number; day: string; children: Child[] };

	let app = $state<State | null>(null);
	let offset = 0; // relógio do servidor - relógio local
	let tick = $state(Date.now());
	let error = $state('');
	let newName = $state('');
	let newLimit = $state(60);
	let author = $state('');

	function apply(s: State) {
		app = s;
		offset = s.now - Date.now();
	}
	async function load() {
		try {
			apply(await (await fetch('/api/state')).json());
			error = '';
		} catch {
			error = 'Sem conexão com o servidor';
		}
	}
	async function post(url: string, body: object) {
		const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!r.ok) { error = (await r.json().catch(() => ({ message: 'Erro' }))).message; return; }
		error = '';
		apply(await r.json());
	}
	const act = (id: number, a: object) => post(`/api/children/${id}/action`, { ...a, author });
	async function add() {
		if (!newName.trim()) return;
		await post('/api/children', { name: newName, defaultLimitMin: newLimit });
		newName = '';
	}

	onMount(() => {
		author = localStorage.getItem('author') ?? '';
		load();
		const es = new EventSource('/api/events');
		es.addEventListener('change', load);
		es.onopen = load;
		const iv = setInterval(() => (tick = Date.now()), 1000);
		const vis = () => document.visibilityState === 'visible' && load();
		document.addEventListener('visibilitychange', vis);
		if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
		return () => { es.close(); clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
	});
	$effect(() => { if (typeof localStorage !== 'undefined') localStorage.setItem('author', author); });

	// uso exibido = valor do servidor + tempo decorrido desde o último estado, só se estiver rodando
	function used(c: Child, s: State) {
		if (!c.running) return c.usedMs;
		return c.usedMs + Math.max(0, tick + offset - s.now);
	}
	function fmt(ms: number) {
		const neg = ms < 0;
		const t = Math.floor(Math.abs(ms) / 1000);
		const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
		const p = (n: number) => String(n).padStart(2, '0');
		return `${neg ? '-' : ''}${h ? h + ':' : ''}${p(m)}:${p(sec)}`;
	}
	const label = { running: 'Em uso', paused: 'Pausado', stopped: 'Encerrado', idle: 'Sem uso hoje' };
</script>

<main>
	<header>
		<h1>Controle de Telas</h1>
		<input placeholder="Quem está operando? (opcional)" bind:value={author} maxlength="40" />
	</header>
	{#if error}<p class="err">{error}</p>{/if}

	{#if app}
		{#each app.children as c (c.id)}
			{@const u = used(c, app)}
			{@const pct = Math.min(100, c.limitMs ? (u / c.limitMs) * 100 : 100)}
			<section class:over={u > c.limitMs}>
				<div class="top">
					<h2>{c.name}</h2>
					<span class="badge {c.status}">{label[c.status]}</span>
				</div>
				<div class="time">{fmt(u)} <small>de {Math.round(c.limitMs / 60000)} min</small></div>
				<div class="bar"><i style="width:{pct}%"></i></div>
				<p class="rest">{u > c.limitMs ? `Excedeu ${fmt(u - c.limitMs)}` : `Restam ${fmt(c.limitMs - u)}`}</p>
				<div class="row">
					{#if c.running}
						<button onclick={() => act(c.id, { type: 'pause' })}>⏸ Pausar</button>
					{:else}
						<button class="go" onclick={() => act(c.id, { type: 'start' })}>▶ Iniciar</button>
					{/if}
					<button onclick={() => act(c.id, { type: 'stop' })}>⏹ Parar</button>
				</div>
				<div class="row">
					<span>Usado</span>
					<button onclick={() => act(c.id, { type: 'adjustUsed', minutes: -5 })}>−5</button>
					<button onclick={() => act(c.id, { type: 'adjustUsed', minutes: 5 })}>+5</button>
					<span>Limite</span>
					<button onclick={() => act(c.id, { type: 'adjustLimit', minutes: -15 })}>−15</button>
					<button onclick={() => act(c.id, { type: 'adjustLimit', minutes: 15 })}>+15</button>
					<button onclick={() => act(c.id, { type: 'resetLimit' })}>↺</button>
				</div>
			</section>
		{:else}
			<p>Nenhuma criança cadastrada ainda.</p>
		{/each}
	{:else}
		<p>Carregando…</p>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); add(); }}>
		<input placeholder="Nome da criança" bind:value={newName} />
		<input type="number" min="0" step="5" bind:value={newLimit} title="Limite diário (min)" />
		<button>Adicionar</button>
	</form>
</main>

<style>
	:global(body) { margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
	main { max-width: 520px; margin: 0 auto; padding: 1rem; }
	header { display: flex; flex-direction: column; gap: .5rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	input { padding: .5rem; border: 1px solid #cbd5e1; border-radius: .5rem; font-size: 1rem; }
	section { background: #fff; border-radius: 1rem; padding: 1rem; margin: 1rem 0; box-shadow: 0 1px 3px #0002; }
	section.over { outline: 2px solid #dc2626; }
	.top { display: flex; justify-content: space-between; align-items: center; }
	h2 { margin: 0; }
	.badge { font-size: .8rem; padding: .15rem .6rem; border-radius: 99px; background: #e2e8f0; }
	.badge.running { background: #bbf7d0; }
	.badge.paused { background: #fde68a; }
	.time { font-size: 2.6rem; font-variant-numeric: tabular-nums; font-weight: 700; }
	.time small { font-size: 1rem; font-weight: 400; color: #64748b; }
	.bar { height: .6rem; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
	.bar i { display: block; height: 100%; background: #2563eb; }
	.over .bar i { background: #dc2626; }
	.rest { margin: .4rem 0; color: #475569; }
	.row { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; margin-top: .5rem; }
	button { padding: .6rem .9rem; border: 0; border-radius: .6rem; background: #e2e8f0; font-size: 1rem; cursor: pointer; }
	button.go { background: #2563eb; color: #fff; }
	form { display: flex; gap: .4rem; } form input:first-child { flex: 1; } form input[type='number'] { width: 5rem; }
	.err { color: #dc2626; }
</style>
