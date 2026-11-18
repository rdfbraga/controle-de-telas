import type { DB } from './db';
import { dayKey, summarizeDay, type Session } from './time';

export type Status = 'running' | 'paused' | 'stopped' | 'idle';

export interface ChildState {
	id: number;
	name: string;
	usedMs: number;
	limitMs: number;
	remainingMs: number;
	exceeded: boolean;
	running: boolean;
	runningSince: number | null;
	status: Status;
}

export interface AppState {
	now: number;
	day: string;
	timezone: string;
	children: ChildState[];
}

export type Action =
	| { type: 'start' | 'pause' | 'stop' }
	| { type: 'adjustUsed'; minutes: number }
	| { type: 'adjustLimit'; minutes: number }
	| { type: 'resetLimit' };

const tzOf = (db: DB) => (db.prepare('SELECT timezone FROM family WHERE id = 1').get() as { timezone: string }).timezone;

export function addChild(db: DB, name: string, defaultLimitMin: number): number {
	name = name.trim();
	if (!name) throw new Error('Nome obrigatório');
	if (!Number.isInteger(defaultLimitMin) || defaultLimitMin < 0) throw new Error('Limite inválido');
	return Number(db.prepare('INSERT INTO child (name, default_limit_min) VALUES (?, ?)').run(name, defaultLimitMin).lastInsertRowid);
}


export function getState(db: DB, now = Date.now()): AppState {
	const tz = tzOf(db);
	const day = dayKey(now, tz);
	const rows = db.prepare('SELECT id, name, default_limit_min AS lim FROM child WHERE archived = 0 ORDER BY id').all() as {
		id: number;
		name: string;
		lim: number;
	}[];
	const children = rows.map((c): ChildState => {
		const ds = db.prepare('SELECT limit_min, finished FROM day_state WHERE child_id = ? AND day = ?').get(c.id, day) as
			| { limit_min: number | null; finished: number }
			| undefined;
		const sessions = db
			.prepare('SELECT start_ms AS start, end_ms AS end FROM usage_session WHERE child_id = ? AND (end_ms IS NULL OR end_ms > ?)')
			.all(c.id, now - 3 * 86_400_000) as Session[];
		const adj = (
			db.prepare('SELECT COALESCE(SUM(minutes),0) AS s FROM time_adjustment WHERE child_id = ? AND day = ?').get(c.id, day) as { s: number }
		).s;
		const sum = summarizeDay({ sessions, adjustmentMin: adj, limitMin: ds?.limit_min ?? c.lim, now, day, tz });
		const status: Status = sum.running ? 'running' : ds?.finished ? 'stopped' : sum.usedMs > 0 || sessions.length ? 'paused' : 'idle';
		return { id: c.id, name: c.name, ...sum, status };
	});
	return { now, day, timezone: tz, children };
}

function closeOpen(db: DB, childId: number, now: number) {
	db.prepare('UPDATE usage_session SET end_ms = ? WHERE child_id = ? AND end_ms IS NULL').run(now, childId);
}

/** Aplica uma ação; lança Error se inválida. Retorna o novo estado. */
export function applyAction(db: DB, childId: number, action: Action, now = Date.now(), author: string | null = null): AppState {
	const child = db.prepare('SELECT id, default_limit_min AS lim FROM child WHERE id = ? AND archived = 0').get(childId) as
		| { id: number; lim: number }
		| undefined;
	if (!child) throw new Error('Criança não encontrada');
	const day = dayKey(now, tzOf(db));
	const setDay = db.prepare(
		'INSERT INTO day_state (child_id, day, limit_min, finished) VALUES (?, ?, NULL, 0) ON CONFLICT(child_id, day) DO NOTHING'
	);

	db.transaction(() => {
		setDay.run(childId, day);
		switch (action.type) {
			case 'start': {
				const open = db.prepare('SELECT 1 FROM usage_session WHERE child_id = ? AND end_ms IS NULL').get(childId);
				if (!open) db.prepare('INSERT INTO usage_session (child_id, start_ms) VALUES (?, ?)').run(childId, now);
				db.prepare('UPDATE day_state SET finished = 0 WHERE child_id = ? AND day = ?').run(childId, day);
				break;
			}
			case 'pause':
				closeOpen(db, childId, now);
				break;
			case 'stop':
				closeOpen(db, childId, now);
				db.prepare('UPDATE day_state SET finished = 1 WHERE child_id = ? AND day = ?').run(childId, day);
				break;
			case 'adjustUsed': {
				if (!Number.isInteger(action.minutes) || action.minutes === 0) throw new Error('Minutos inválidos');
				db.prepare('INSERT INTO time_adjustment (child_id, day, minutes, author, created_ms) VALUES (?, ?, ?, ?, ?)').run(
					childId, day, action.minutes, author, now
				);
				break;
			}
			case 'adjustLimit': {
				if (!Number.isInteger(action.minutes) || action.minutes === 0) throw new Error('Minutos inválidos');
				const cur = (db.prepare('SELECT limit_min FROM day_state WHERE child_id = ? AND day = ?').get(childId, day) as { limit_min: number | null })
					.limit_min ?? child.lim;
				db.prepare('UPDATE day_state SET limit_min = ? WHERE child_id = ? AND day = ?').run(Math.max(0, cur + action.minutes), childId, day);
				break;
			}
			case 'resetLimit':
				db.prepare('UPDATE day_state SET limit_min = NULL WHERE child_id = ? AND day = ?').run(childId, day);
				break;
			default:
				throw new Error('Ação desconhecida');
		}
	})();
	return getState(db, now);
}

