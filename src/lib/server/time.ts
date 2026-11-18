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

export interface Session {
	start: number;
	end: number | null; // null = em andamento
}

/** Milissegundos de uso de `sessions` dentro de [from, to), com `now` para sessões abertas. */
export function overlapMs(sessions: Session[], from: number, to: number, now: number): number {
	let total = 0;
	for (const s of sessions) {
		const a = Math.max(s.start, from);
		const b = Math.min(s.end ?? now, to);
		if (b > a) total += b - a;
	}
	return total;
}

export interface DayInput {
	sessions: Session[];
	adjustmentMin: number; // soma dos ajustes manuais do dia (pode ser negativa)
	limitMin: number;
	now: number;
	day: string;
	tz: string;
}

export interface DaySummary {
	usedMs: number;
	limitMs: number;
	remainingMs: number;
	exceeded: boolean;
	running: boolean;
	runningSince: number | null;
}

export function summarizeDay(i: DayInput): DaySummary {
	const from = dayStart(i.day, i.tz);
	const to = dayStart(addDays(i.day, 1), i.tz);
	const measured = overlapMs(i.sessions, from, to, i.now);
	const usedMs = Math.max(0, measured + i.adjustmentMin * MIN);
	const limitMs = Math.max(0, i.limitMin) * MIN;
	const open = i.sessions.find((s) => s.end === null);
	return {
		usedMs,
		limitMs,
		remainingMs: limitMs - usedMs,
		exceeded: usedMs > limitMs,
		running: !!open,
		runningSince: open ? open.start : null
	};
}
