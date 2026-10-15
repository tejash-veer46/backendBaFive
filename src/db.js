import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dbFile = process.env.DB_PATH || path.join(__dirname, '../data/bafive.db')
if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true })

export const db = new DatabaseSync(dbFile)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    birthdate     TEXT,
    gender        TEXT,
    interested_in TEXT DEFAULT 'everyone',
    pronouns      TEXT,
    department    TEXT,
    job_title     TEXT,
    hometown      TEXT,
    height_cm     INTEGER,
    bio           TEXT,
    photos        TEXT NOT NULL DEFAULT '[]',
    prompts       TEXT NOT NULL DEFAULT '[]',
    interests     TEXT NOT NULL DEFAULT '[]',
    onboarded     INTEGER NOT NULL DEFAULT 0,
    is_demo       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_active   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A like targets a specific photo or prompt, optionally with a comment (Hinge-style).
  CREATE TABLE IF NOT EXISTS likes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type  TEXT NOT NULL DEFAULT 'profile',
    target_index INTEGER,
    comment      TEXT,
    is_rose      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(from_id, to_id)
  );

  CREATE TABLE IF NOT EXISTS passes (
    from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(from_id, to_id)
  );

  -- user_a is always the smaller id so a pair has exactly one row.
  CREATE TABLE IF NOT EXISTS matches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_a, user_b)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    read_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_likes_to ON likes(to_id);
  CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, id);
`)

export const one = (sql, ...params) => db.prepare(sql).get(...params)
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)

export const transaction = (fn) => {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
