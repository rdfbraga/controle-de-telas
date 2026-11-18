import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS family (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS child (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL DEFAULT 1 REFERENCES family(id),
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
-- Modelo diário: uma linha por ficha (minutos). Gera as fichas de cada dia novo.
CREATE TABLE IF NOT EXISTS child_template (
  child_id INTEGER NOT NULL REFERENCES child(id),
  position INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (child_id, position)
);
-- Marca os dias em que as fichas já foram geradas (evita regerar se o responsável remover fichas).
CREATE TABLE IF NOT EXISTS day_init (
  child_id INTEGER NOT NULL REFERENCES child(id),
  day TEXT NOT NULL,
  PRIMARY KEY (child_id, day)
);
-- Ficha do dia. state: available (nunca iniciada) | active (iniciada, ainda com tempo) | used (zerada/descartada).
-- started_ms preenchido = contagem em andamento; consumed_ms = tempo já gasto até a última pausa.
CREATE TABLE IF NOT EXISTS token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL REFERENCES child(id),
  day TEXT NOT NULL,
  position INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  consumed_ms INTEGER NOT NULL DEFAULT 0,
  started_ms INTEGER,
  state TEXT NOT NULL DEFAULT 'available' CHECK (state IN ('available','active','used'))
);
CREATE INDEX IF NOT EXISTS idx_token_child_day ON token(child_id, day);
`;

/** Migra bancos do modelo antigo (limite diário em minutos) para o modelo de fichas. */
export function migrate(db: DB) {
	const v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
	if (v >= 2) return;
	db.exec('BEGIN');
	try {
		db.exec(SCHEMA_V2);
		const hasLegacy = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='usage_session'").get();
		if (hasLegacy) {
			const kids = db.prepare('SELECT id, default_limit_min AS lim FROM child').all() as unknown as { id: number; lim: number }[];
			const ins = db.prepare('INSERT OR IGNORE INTO child_template (child_id, position, minutes) VALUES (?, ?, ?)');
			for (const k of kids) {
				// Limite antigo vira fichas de 30 min (o resto, se houver, numa ficha menor).
				let rest = k.lim, pos = 0;
				while (rest > 0) {
					const m = Math.min(30, rest);
					ins.run(k.id, pos++, m);
					rest -= m;
				}
			}
			db.exec('DROP TABLE usage_session; DROP TABLE day_state; DROP TABLE time_adjustment;');
		}
		db.exec('PRAGMA user_version = 2');
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

export function openDb(path: string, tz = 'America/Sao_Paulo'): DB {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
	db.exec(`CREATE TABLE IF NOT EXISTS family (id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, timezone TEXT NOT NULL);`);
	db.prepare('INSERT OR IGNORE INTO family (id, name, timezone) VALUES (1, ?, ?)').run('Minha família', tz);
	migrate(db);
	return db;
}

let shared: DB | undefined;
export function getDb(): DB {
	return (shared ??= openDb(process.env.DATABASE_PATH ?? 'data/telas.db', process.env.TZ_FAMILIA));
}
