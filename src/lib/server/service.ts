import type { DB } from './db';
import { MIN, dayKey, tokenProgress } from './time';

export type TokenStatus = 'available' | 'running' | 'paused' | 'used';

export interface TokenState {
	id: number;
	minutes: number;
	status: TokenStatus;
	remainingMs: number;
	/** Instante (relógio do servidor) em que zera; só se estiver rodando. */
	endsAtMs: number | null;
}

export interface ChildState {
	id: number;
	name: string;
	tokens: TokenState[];
	template: number[];
	totalMinutes: number;
	/** Soma do que ainda resta nas fichas não usadas (ms), no instante `now` do estado. */
	remainingMs: number;
	running: boolean;
}

export interface AppState {
	now: number;
	day: string;
	timezone: string;
	children: ChildState[];
}

export type Action =
	| { type: 'start'; tokenId: number }
	| { type: 'pause' }
	| { type: 'discard' }
	| { type: 'addToken'; minutes: number }
	| { type: 'removeToken'; tokenId: number }
	| { type: 'setTemplate'; minutes: number[] };

const MAX_MIN = 480;
const MAX_TOKENS = 20;

const tzOf = (db: DB) => (db.prepare('SELECT timezone FROM family WHERE id = 1').get() as { timezone: string }).timezone;

function checkMinutes(m: unknown): number {
	if (!Number.isInteger(m) || (m as number) < 1 || (m as number) > MAX_MIN) throw new Error(`Cada ficha deve ter de 1 a ${MAX_MIN} minutos`);
	return m as number;
}
function checkTemplate(list: unknown): number[] {
	if (!Array.isArray(list) || list.length > MAX_TOKENS) throw new Error(`No máximo ${MAX_TOKENS} fichas por dia`);
	return list.map(checkMinutes);
}

function writeTemplate(db: DB, childId: number, minutes: number[]) {
	db.prepare('DELETE FROM child_template WHERE child_id = ?').run(childId);
	const ins = db.prepare('INSERT INTO child_template (child_id, position, minutes) VALUES (?, ?, ?)');
	minutes.forEach((m, i) => ins.run(childId, i, m));
}

export function addChild(db: DB, name: string, template: number[]): number {
	name = name.trim();
	if (!name) throw new Error('Nome obrigatório');
	const tpl = checkTemplate(template);
	const id = Number(db.prepare('INSERT INTO child (name) VALUES (?)').run(name).lastInsertRowid);
	writeTemplate(db, id, tpl);
	return id;
}

/** Gera as fichas do dia a partir do modelo (uma vez por criança/dia). */
function ensureDay(db: DB, childId: number, day: string) {
	const done = db.prepare('SELECT 1 FROM day_init WHERE child_id = ? AND day = ?').get(childId, day);
	if (done) return;
	db.prepare('INSERT INTO day_init (child_id, day) VALUES (?, ?)').run(childId, day);
	db.prepare('INSERT INTO token (child_id, day, position, minutes) SELECT child_id, ?, position, minutes FROM child_template WHERE child_id = ? ORDER BY position').run(day, childId);
}

interface Row {
	id: number;
	day: string;
	position: number;
	minutes: number;
	consumed_ms: number;
	started_ms: number | null;
	state: 'available' | 'active' | 'used';
}

/** Encerra fichas cujo tempo acabou ou que sobraram de dias anteriores. */
function settle(db: DB, childId: number, day: string, now: number) {
	const rows = db.prepare("SELECT * FROM token WHERE child_id = ? AND state != 'used'").all(childId) as unknown as Row[];
	const close = db.prepare("UPDATE token SET state = 'used', started_ms = NULL, consumed_ms = ? WHERE id = ?");
	for (const r of rows) {
		if (r.day < day) {
			close.run(r.consumed_ms, r.id); // não passa para o dia seguinte
			continue;
		}
		const p = tokenProgress({ minutes: r.minutes, consumedMs: r.consumed_ms, startedMs: r.started_ms }, now);
		if (p.finished) close.run(r.minutes * MIN, r.id);
	}
}

function prepare(db: DB, childId: number, now: number): string {
	const day = dayKey(now, tzOf(db));
	ensureDay(db, childId, day);
	settle(db, childId, day, now);
	return day;
}

export function getState(db: DB, now = Date.now()): AppState {
	const tz = tzOf(db);
	const day = dayKey(now, tz);
	const kids = db.prepare('SELECT id, name FROM child WHERE archived = 0 ORDER BY id').all() as unknown as { id: number; name: string }[];
	const children = kids.map((c): ChildState => {
		prepare(db, c.id, now);
		const rows = db.prepare('SELECT * FROM token WHERE child_id = ? AND day = ? ORDER BY position, id').all(c.id, day) as unknown as Row[];
		const tokens = rows.map((r): TokenState => {
			const p = tokenProgress({ minutes: r.minutes, consumedMs: r.consumed_ms, startedMs: r.started_ms }, now);
			const status: TokenStatus = r.state === 'used' ? 'used' : p.running ? 'running' : r.state === 'active' ? 'paused' : 'available';
			return { id: r.id, minutes: r.minutes, status, remainingMs: status === 'used' ? 0 : p.remainingMs, endsAtMs: p.endsAtMs };
		});
		const template = (db.prepare('SELECT minutes FROM child_template WHERE child_id = ? ORDER BY position').all(c.id) as unknown as { minutes: number }[]).map((t) => t.minutes);
		return {
			id: c.id,
			name: c.name,
			tokens,
			template,
			totalMinutes: tokens.reduce((s, t) => s + t.minutes, 0),
			remainingMs: tokens.reduce((s, t) => s + t.remainingMs, 0),
			running: tokens.some((t) => t.status === 'running')
		};
	});
	return { now, day, timezone: tz, children };
}

/** Aplica uma ação; lança Error se inválida. Retorna o novo estado. */
export function applyAction(db: DB, childId: number, action: Action, now = Date.now()): AppState {
	const child = db.prepare('SELECT id FROM child WHERE id = ? AND archived = 0').get(childId);
	if (!child) throw new Error('Criança não encontrada');

	db.exec('BEGIN IMMEDIATE');
	try {
		const day = prepare(db, childId, now);
		const running = db.prepare("SELECT * FROM token WHERE child_id = ? AND state = 'active' AND started_ms IS NOT NULL").get(childId) as unknown as Row | undefined;
		const getToken = (id: unknown) => {
			const t = db.prepare('SELECT * FROM token WHERE id = ? AND child_id = ? AND day = ?').get(id as number, childId, day) as unknown as Row | undefined;
			if (!t) throw new Error('Ficha não encontrada');
			return t;
		};
		switch (action.type) {
			case 'start': {
				const t = getToken(action.tokenId);
				if (t.state === 'used') throw new Error('Esta ficha já foi usada hoje');
				if (running) {
					if (running.id === t.id) break; // já está contando
					throw new Error('Já há uma ficha em uso. Pause ou descarte antes.');
				}
				db.prepare("UPDATE token SET state = 'active', started_ms = ? WHERE id = ?").run(now, t.id);
				break;
			}
			case 'pause': {
				if (!running) break;
				db.prepare('UPDATE token SET consumed_ms = ?, started_ms = NULL WHERE id = ?').run(running.consumed_ms + (now - running.started_ms!), running.id);
				break;
			}
			case 'discard': {
				// Descarta a ficha em uso, ou a que está pausada com tempo parcial.
				const target =
					running ??
					(db.prepare("SELECT * FROM token WHERE child_id = ? AND day = ? AND state = 'active' ORDER BY position LIMIT 1").get(childId, day) as unknown as Row | undefined);
				if (!target) throw new Error('Nenhuma ficha em uso');
				db.prepare("UPDATE token SET state = 'used', started_ms = NULL WHERE id = ?").run(target.id);
				break;
			}
			case 'addToken': {
				const m = checkMinutes(action.minutes);
				const n = (db.prepare('SELECT COUNT(*) AS n FROM token WHERE child_id = ? AND day = ?').get(childId, day) as { n: number }).n;
				if (n >= MAX_TOKENS) throw new Error(`No máximo ${MAX_TOKENS} fichas por dia`);
				const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM token WHERE child_id = ? AND day = ?').get(childId, day) as { p: number }).p;
				db.prepare('INSERT INTO token (child_id, day, position, minutes) VALUES (?, ?, ?, ?)').run(childId, day, pos, m);
				break;
			}
			case 'removeToken': {
				const t = getToken(action.tokenId);
				if (t.state !== 'available') throw new Error('Só dá para remover fichas ainda não iniciadas');
				db.prepare('DELETE FROM token WHERE id = ?').run(t.id);
				break;
			}
			case 'setTemplate': // vale a partir do próximo dia
				writeTemplate(db, childId, checkTemplate(action.minutes));
				break;
			default:
				throw new Error('Ação desconhecida');
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return getState(db, now);
}
