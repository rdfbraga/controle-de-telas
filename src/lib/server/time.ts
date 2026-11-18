/** Lógica pura de tempo. Todos os instantes são em milissegundos (epoch). */

export const MIN = 60_000;

/** Deslocamento (ms) do fuso `tz` em relação ao UTC no instante `ts`. */
export function tzOffsetMs(ts: number, tz: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date(ts));
	const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
	const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
	return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Chave do dia local (AAAA-MM-DD) de um instante. */
export function dayKey(ts: number, tz: string): string {
	return new Date(ts + tzOffsetMs(ts, tz)).toISOString().slice(0, 10);
}

/** Soma `n` dias a uma chave de dia. */
export function addDays(key: string, n: number): string {
	const d = new Date(key + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** Instante (epoch ms) da meia-noite local do dia `key`. */
export function dayStart(key: string, tz: string): number {
	const base = new Date(key + 'T00:00:00Z').getTime();
	let guess = base - tzOffsetMs(base, tz);
	guess = base - tzOffsetMs(guess, tz);
	return guess;
}

export interface TokenTime {
	minutes: number;
	consumedMs: number; // tempo gasto até a última pausa
	startedMs: number | null; // início da contagem em andamento (null = parada)
}

export interface TokenProgress {
	elapsedMs: number;
	remainingMs: number;
	finished: boolean;
	running: boolean;
	/** Instante (epoch ms) em que a contagem chega a zero; só se estiver rodando. */
	endsAtMs: number | null;
}

/** Progresso de uma ficha, calculado só com timestamps (independe de contadores do cliente). */
export function tokenProgress(t: TokenTime, now: number): TokenProgress {
	const total = t.minutes * MIN;
	const elapsed = t.consumedMs + (t.startedMs !== null ? Math.max(0, now - t.startedMs) : 0);
	const finished = elapsed >= total;
	const running = t.startedMs !== null && !finished;
	return {
		elapsedMs: Math.min(elapsed, total),
		remainingMs: Math.max(0, total - elapsed),
		finished,
		running,
		endsAtMs: running ? t.startedMs! + (total - t.consumedMs) : null
	};
}
