<script lang="ts">
	let pin = $state('');
	let msg = $state('');
	async function entrar() {
		const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
		if (r.ok) location.href = '/';
		else msg = (await r.json().catch(() => ({ message: 'Erro' }))).message;
	}
</script>

<main>
	<h1>Controle de Telas</h1>
	<form onsubmit={(e) => { e.preventDefault(); entrar(); }}>
		<input type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN da família" bind:value={pin} />
		<button>Entrar</button>
	</form>
	{#if msg}<p class="err">{msg}</p>{/if}
</main>

<style>
	:global(body) { margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
	main { max-width: 360px; margin: 20vh auto 0; padding: 1rem; }
	form { display: flex; gap: .4rem; }
	input { flex: 1; padding: .6rem; border: 1px solid #cbd5e1; border-radius: .5rem; font-size: 1.1rem; }
	button { padding: .6rem 1rem; border: 0; border-radius: .6rem; background: #2563eb; color: #fff; font-size: 1rem; }
	.err { color: #dc2626; }
</style>
