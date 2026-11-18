import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/lib/server/db';
import { addChild, applyAction, getState } from '../src/lib/server/service';
import { MIN } from '../src/lib/server/time';

const T0 = new Date('2026-03-10T15:00:00Z').getTime(); // 12:00 em São Paulo
const DAY = 24 * 60 * MIN;
const setup = (tpl = [30, 30, 15]) => {
	const db = openDb(':memory:');
	const id = addChild(db, 'Ana', tpl);
	return { db, id };
};
const kid = (db: ReturnType<typeof openDb>, now: number) => getState(db, now).children[0];

describe('fichas do dia', () => {
	it('gera as fichas do modelo, todas disponíveis', () => {
		const { db } = setup();
		const c = kid(db, T0);
		expect(c.tokens.map((t) => [t.minutes, t.status])).toEqual([[30, 'available'], [30, 'available'], [15, 'available']]);
		expect(c.totalMinutes).toBe(75);
	});

	it('ao clicar, a ficha conta regressivamente pelo relógio do servidor', () => {
		const { db, id } = setup();
		const [a] = kid(db, T0).tokens;
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0);
		const t = kid(db, T0 + 10 * MIN).tokens[0];
		expect(t.status).toBe('running');
		expect(t.remainingMs).toBe(20 * MIN);
		expect(t.endsAtMs).toBe(T0 + 30 * MIN);
	});

	it('no fim a ficha é descartada e não pode ser reutilizada', () => {
		const { db, id } = setup();
		const [a] = kid(db, T0).tokens;
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0);
		const after = T0 + 31 * MIN;
		expect(kid(db, after).tokens[0].status).toBe('used');
		expect(() => applyAction(db, id, { type: 'start', tokenId: a.id }, after)).toThrow(/já foi usada/);
	});

	it('mesmo sem ninguém consultando, o tempo corre (aba/aparelho fechado)', () => {
		const { db, id } = setup();
		const [a, b] = kid(db, T0).tokens;
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0);
		// só consulta horas depois: a ficha já terminou e a seguinte pode ser iniciada
		const later = T0 + 3 * 60 * MIN;
		expect(kid(db, later).tokens[0].status).toBe('used');
		applyAction(db, id, { type: 'start', tokenId: b.id }, later);
		expect(kid(db, later + MIN).tokens[1].remainingMs).toBe(29 * MIN);
	});

	it('só uma ficha por vez', () => {
		const { db, id } = setup();
		const [a, b] = kid(db, T0).tokens;
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0);
		expect(() => applyAction(db, id, { type: 'start', tokenId: b.id }, T0 + MIN)).toThrow(/em uso/);
	});

	it('pausar guarda o tempo que sobrou e permite retomar a mesma ficha', () => {
		const { db, id } = setup();
		const [a] = kid(db, T0).tokens;
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0);
		applyAction(db, id, { type: 'pause' }, T0 + 10 * MIN);
		let t = kid(db, T0 + 60 * MIN).tokens[0];
		expect(t.status).toBe('paused');
		expect(t.remainingMs).toBe(20 * MIN);
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0 + 60 * MIN);
		t = kid(db, T0 + 65 * MIN).tokens[0];
		expect(t.status).toBe('running');
		expect(t.remainingMs).toBe(15 * MIN);
	});

	it('descartar encerra a ficha em uso', () => {
		const { db, id } = setup();
		const [a] = kid(db, T0).tokens;
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0);
		applyAction(db, id, { type: 'discard' }, T0 + 5 * MIN);
		expect(kid(db, T0 + 6 * MIN).tokens[0].status).toBe('used');
		expect(kid(db, T0 + 6 * MIN).running).toBe(false);
		expect(() => applyAction(db, id, { type: 'discard' }, T0 + 7 * MIN)).toThrow();
	});

	it('adiciona ficha extra e remove só as não iniciadas', () => {
		const { db, id } = setup([30]);
		applyAction(db, id, { type: 'addToken', minutes: 10 }, T0);
		let c = kid(db, T0);
		expect(c.tokens.map((t) => t.minutes)).toEqual([30, 10]);
		applyAction(db, id, { type: 'start', tokenId: c.tokens[0].id }, T0);
		expect(() => applyAction(db, id, { type: 'removeToken', tokenId: c.tokens[0].id }, T0)).toThrow();
		applyAction(db, id, { type: 'removeToken', tokenId: c.tokens[1].id }, T0);
		c = kid(db, T0);
		expect(c.tokens).toHaveLength(1);
		// remover não faz o dia ser regerado
		expect(kid(db, T0 + MIN).tokens).toHaveLength(1);
	});

	it('no dia seguinte as fichas recomeçam e as antigas somem', () => {
		const { db, id } = setup();
		const [a] = kid(db, T0).tokens;
		applyAction(db, id, { type: 'start', tokenId: a.id }, T0);
		const next = kid(db, T0 + DAY);
		expect(next.tokens.map((t) => t.status)).toEqual(['available', 'available', 'available']);
		expect(next.running).toBe(false);
	});

	it('ficha rodando à meia-noite é encerrada', () => {
		const { db, id } = setup([120]);
		const [a] = kid(db, T0).tokens;
		// 23:30 local → rodando; 00:10 do dia seguinte já é outro dia
		const late = new Date('2026-03-11T02:30:00Z').getTime();
		applyAction(db, id, { type: 'start', tokenId: a.id }, late);
		const nextDay = new Date('2026-03-11T03:10:00Z').getTime();
		const c = kid(db, nextDay);
		expect(c.running).toBe(false);
		expect(c.tokens[0].status).toBe('available');
	});

	it('mudar o modelo vale só a partir do dia seguinte', () => {
		const { db, id } = setup([30]);
		kid(db, T0);
		applyAction(db, id, { type: 'setTemplate', minutes: [10, 10] }, T0);
		expect(kid(db, T0).tokens).toHaveLength(1);
		expect(kid(db, T0 + DAY).tokens.map((t) => t.minutes)).toEqual([10, 10]);
	});

	it('valida entradas', () => {
		const { db, id } = setup();
		expect(() => applyAction(db, 999, { type: 'pause' }, T0)).toThrow();
		expect(() => applyAction(db, id, { type: 'addToken', minutes: 0 }, T0)).toThrow();
		expect(() => applyAction(db, id, { type: 'addToken', minutes: 9999 }, T0)).toThrow();
		expect(() => applyAction(db, id, { type: 'start', tokenId: 12345 }, T0)).toThrow();
		expect(() => addChild(db, ' ', [30])).toThrow();
		expect(() => addChild(db, 'B', [0])).toThrow();
	});
});

describe('migração do modelo antigo', () => {
	it('converte o limite diário em fichas de 30 min', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(`
			CREATE TABLE family (id INTEGER PRIMARY KEY, name TEXT, timezone TEXT);
			INSERT INTO family VALUES (1, 'f', 'America/Sao_Paulo');
			CREATE TABLE child (id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER DEFAULT 1, name TEXT NOT NULL, default_limit_min INTEGER NOT NULL DEFAULT 60, archived INTEGER NOT NULL DEFAULT 0);
			CREATE TABLE usage_session (id INTEGER PRIMARY KEY, child_id INTEGER, start_ms INTEGER, end_ms INTEGER);
			CREATE TABLE day_state (child_id INTEGER, day TEXT, limit_min INTEGER, finished INTEGER);
			CREATE TABLE time_adjustment (id INTEGER PRIMARY KEY, child_id INTEGER, day TEXT, minutes INTEGER, author TEXT, created_ms INTEGER);
			INSERT INTO child (name, default_limit_min) VALUES ('Arthur', 75);
		`);
		migrate(db);
		migrate(db); // idempotente
		const tpl = db.prepare('SELECT minutes FROM child_template ORDER BY position').all() as unknown as { minutes: number }[];
		expect(tpl.map((r) => r.minutes)).toEqual([30, 30, 15]);
		expect(getState(db, T0).children[0].tokens).toHaveLength(3);
	});
});
