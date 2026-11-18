import { describe, expect, it } from 'vitest';
import { openDb } from '../src/lib/server/db';
import { MIN } from '../src/lib/server/time';
import { addChild, applyAction, getState } from '../src/lib/server/service';

const T0 = new Date('2026-03-10T15:00:00Z').getTime();
const setup = () => {
	const db = openDb(':memory:');
	return { db, id: addChild(db, 'Ana', 60) };
};

describe('estado diário', () => {
	it('iniciar, pausar e retomar acumulam pelo relógio do servidor', () => {
		const { db, id } = setup();
		applyAction(db, id, { type: 'start' }, T0);
		expect(getState(db, T0 + 10 * MIN).children[0].usedMs).toBe(10 * MIN);
		applyAction(db, id, { type: 'pause' }, T0 + 10 * MIN);
		const paused = getState(db, T0 + 30 * MIN).children[0];
		expect(paused.usedMs).toBe(10 * MIN);
		expect(paused.status).toBe('paused');
		applyAction(db, id, { type: 'start' }, T0 + 30 * MIN);
		expect(getState(db, T0 + 35 * MIN).children[0].usedMs).toBe(15 * MIN);
	});
	it('start duplicado não cria segunda sessão', () => {
		const { db, id } = setup();
		applyAction(db, id, { type: 'start' }, T0);
		applyAction(db, id, { type: 'start' }, T0 + MIN);
		expect(getState(db, T0 + 5 * MIN).children[0].usedMs).toBe(5 * MIN);
	});
	it('parar encerra o dia da criança', () => {
		const { db, id } = setup();
		applyAction(db, id, { type: 'start' }, T0);
		applyAction(db, id, { type: 'stop' }, T0 + 5 * MIN);
		expect(getState(db, T0 + 6 * MIN).children[0].status).toBe('stopped');
	});
	it('ajusta uso e limite do dia', () => {
		const { db, id } = setup();
		applyAction(db, id, { type: 'adjustUsed', minutes: 20 }, T0);
		applyAction(db, id, { type: 'adjustLimit', minutes: -30 }, T0);
		let c = getState(db, T0).children[0];
		expect(c.usedMs).toBe(20 * MIN);
		expect(c.limitMs).toBe(30 * MIN);
		applyAction(db, id, { type: 'resetLimit' }, T0);
		c = getState(db, T0).children[0];
		expect(c.limitMs).toBe(60 * MIN);
	});
	it('novo dia zera uso e limite do dia', () => {
		const { db, id } = setup();
		applyAction(db, id, { type: 'adjustUsed', minutes: 20 }, T0);
		applyAction(db, id, { type: 'adjustLimit', minutes: 15 }, T0);
		const c = getState(db, T0 + 24 * 60 * MIN).children[0];
		expect(c.usedMs).toBe(0);
		expect(c.limitMs).toBe(60 * MIN);
	});
	it('rejeita criança inexistente e minutos inválidos', () => {
		const { db, id } = setup();
		expect(() => applyAction(db, 999, { type: 'start' }, T0)).toThrow();
		expect(() => applyAction(db, id, { type: 'adjustUsed', minutes: 0 }, T0)).toThrow();
	});
});
