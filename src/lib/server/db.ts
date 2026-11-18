import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS family (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS child (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL DEFAULT 1 REFERENCES family(id),
  name TEXT NOT NULL,
  default_limit_min INTEGER NOT NULL DEFAULT 60,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS usage_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL REFERENCES child(id),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_session_child ON usage_session(child_id, start_ms);
CREATE TABLE IF NOT EXISTS day_state (
  child_id INTEGER NOT NULL REFERENCES child(id),
  day TEXT NOT NULL,
  limit_min INTEGER,
  finished INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (child_id, day)
);
CREATE TABLE IF NOT EXISTS time_adjustment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL REFERENCES child(id),
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  author TEXT,
  created_ms INTEGER NOT NULL
);
`;

export function openDb(path: string, tz = 'America/Sao_Paulo'): DB {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
	db.exec(SCHEMA);
	db.prepare('INSERT OR IGNORE INTO family (id, name, timezone) VALUES (1, ?, ?)').run('Minha família', tz);
	return db;
}

let shared: DB | undefined;
export function getDb(): DB {
	return (shared ??= openDb(process.env.DATABASE_PATH ?? 'data/telas.db', process.env.TZ_FAMILIA));
}
