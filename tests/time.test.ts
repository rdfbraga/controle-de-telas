import { describe, expect, it } from 'vitest';
import { MIN, addDays, dayKey, dayStart, overlapMs, summarizeDay } from '../src/lib/server/time';

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

describe('uso', () => {
	it('soma sessões fechadas e abertas', () => {
		const now = t('2026-03-10T15:00:00Z');
		const s = summarizeDay({
			sessions: [
				{ start: t('2026-03-10T12:00:00Z'), end: t('2026-03-10T12:30:00Z') },
				{ start: t('2026-03-10T14:40:00Z'), end: null }
			],
			adjustmentMin: 0, limitMin: 60, now, day: '2026-03-10', tz: TZ
		});
		expect(s.usedMs).toBe(50 * MIN);
		expect(s.running).toBe(true);
		expect(s.remainingMs).toBe(10 * MIN);
		expect(s.exceeded).toBe(false);
	});
	it('divide sessão que atravessa a meia-noite', () => {
		const sess = [{ start: t('2026-03-10T02:30:00Z'), end: t('2026-03-10T03:30:00Z') }];
		const from = dayStart('2026-03-10', TZ);
		expect(overlapMs(sess, from, from + 86_400_000, 0)).toBe(30 * MIN);
		expect(overlapMs(sess, from - 86_400_000, from, 0)).toBe(30 * MIN);
	});
	it('ajustes entram e o uso nunca fica negativo', () => {
		const base = { sessions: [], limitMin: 30, now: 0, day: '2026-03-10', tz: TZ };
		expect(summarizeDay({ ...base, adjustmentMin: 40 }).exceeded).toBe(true);
		expect(summarizeDay({ ...base, adjustmentMin: -10 }).usedMs).toBe(0);
	});
});
