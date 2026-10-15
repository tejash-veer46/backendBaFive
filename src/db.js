import { createClient } from '@libsql/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Remote Turso database when DATABASE_URL is set (production), otherwise a local SQLite file.
const remoteUrl = process.env.DATABASE_URL
const localFile = path.resolve(process.env.DB_PATH || path.join(__dirname, '../data/bafive.db'))
if (!remoteUrl) fs.mkdirSync(path.dirname(localFile), { recursive: true })

const client = createClient(
  remoteUrl
    ? { url: remoteUrl, authToken: process.env.DATABASE_AUTH_TOKEN }
    : { url: pathToFileURL(localFile).href },
)

const SCHEMA = `
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
`

// Foreign-key enforcement is per-connection and not guaranteed on remote databases,
// so deletes are done explicitly in the routes rather than relying on ON DELETE CASCADE.
export const ready = client.executeMultiple(SCHEMA)

// Accepts positional args (`one(sql, a, b)`) or a single named-args object (`one(sql, { me: 1 })`).
const toArgs = (params) =>
  params.length === 1 && params[0] !== null && typeof params[0] === 'object' ? params[0] : params

const helpers = (exec) => ({
  one: async (sql, ...params) => (await exec.execute({ sql, args: toArgs(params) })).rows[0],
  all: async (sql, ...params) => (await exec.execute({ sql, args: toArgs(params) })).rows,
  run: async (sql, ...params) => {
    const r = await exec.execute({ sql, args: toArgs(params) })
    return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid) }
  },
})

export const { one, all, run } = helpers(client)

/** Runs `fn` inside a write transaction; `fn` receives { one, all, run } bound to it. */
export const transaction = async (fn) => {
  const tx = await client.transaction('write')
  try {
    const result = await fn(helpers(tx))
    await tx.commit()
    return result
  } catch (err) {
    await tx.rollback()
    throw err
  } finally {
    tx.close()
  }
}
