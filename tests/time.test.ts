import { describe, expect, it } from 'vitest';
import { MIN, addDays, dayKey, dayStart, tokenProgress } from '../src/lib/server/time';

const TZ = 'America/Sao_Paulo'; // UTC-3
const t = (iso: string) => new Date(iso).getTime();

describe('dias no fuso', () => {
	it('dayKey respeita o fuso', () => {
		expect(dayKey(t('2026-03-10T02:30:00Z'), TZ)).toBe('2026-03-09');
		expect(dayKey(t('2026-03-10T03:00:00Z'), TZ)).toBe('2026-03-10');
	});
	it('dayStart é a meia-noite local', () => {
		expect(dayStart('2026-03-10', TZ)).toBe(t('2026-03-10T03:00:00Z'));
	});
	it('addDays vira o mês', () => {
		expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
	});
});

describe('progresso da ficha', () => {
	it('ficha parada não consome tempo', () => {
		const p = tokenProgress({ minutes: 30, consumedMs: 0, startedMs: null }, 999_999);
		expect(p).toMatchObject({ remainingMs: 30 * MIN, running: false, finished: false, endsAtMs: null });
	});
	it('contagem regressiva pelo relógio do servidor', () => {
		const p = tokenProgress({ minutes: 30, consumedMs: 0, startedMs: 1000 }, 1000 + 10 * MIN);
		expect(p.remainingMs).toBe(20 * MIN);
		expect(p.running).toBe(true);
		expect(p.endsAtMs).toBe(1000 + 30 * MIN);
	});
	it('considera o tempo já gasto antes da pausa', () => {
		const p = tokenProgress({ minutes: 30, consumedMs: 12 * MIN, startedMs: 5000 }, 5000 + 3 * MIN);
		expect(p.remainingMs).toBe(15 * MIN);
		expect(p.endsAtMs).toBe(5000 + 18 * MIN);
	});
	it('termina exatamente no zero e nunca fica negativa', () => {
		const p = tokenProgress({ minutes: 30, consumedMs: 0, startedMs: 0 }, 45 * MIN);
		expect(p).toMatchObject({ finished: true, running: false, remainingMs: 0, elapsedMs: 30 * MIN });
	});
});
