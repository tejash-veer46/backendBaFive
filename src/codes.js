// One-time email codes for verifying an email address ('verify') and resetting a password ('reset').
import crypto from 'node:crypto'
import { one, run } from './db.js'
import { HttpError, JWT_SECRET } from './lib.js'
import { sendCode } from './mail.js'

export const CODE_TTL_MS = 10 * 60_000
export const RESEND_COOLDOWN_MS = 60_000
export const MAX_ATTEMPTS = 5
export const DAILY_SENDS = 10

// Peppered with JWT_SECRET so a leaked table can't be brute-forced offline (6 digits is only 10^6 guesses).
const hashCode = (email, purpose, code) =>
  crypto.createHash('sha256').update(`${JWT_SECRET}:${purpose}:${email}:${code}`).digest('hex')

/**
 * Builds a statement that stores a fresh code, for use in batch() or on its own. Returns [statement, code].
 * The statement returns a row only if a code was stored: nothing when the resend cooldown or daily cap
 * applies, or when `userCondition` is given and no user with this email matches it.
 */
export const issueCode = (email, purpose, userCondition) => {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const now = Date.now()
  const values = [email, purpose, hashCode(email, purpose, code), now + CODE_TTL_MS, now, new Date(now).toISOString().slice(0, 10)]
  const source = userCondition
    ? `SELECT ?, ?, ?, ?, ?, ? FROM users WHERE email = ? AND ${userCondition}`
    : 'VALUES (?, ?, ?, ?, ?, ?)'
  const sql = `INSERT INTO email_codes (email, purpose, code_hash, expires_at, created_at, send_day) ${source}
    ON CONFLICT (email, purpose) DO UPDATE SET
      code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at,
      send_count = CASE WHEN send_day = excluded.send_day THEN send_count + 1 ELSE 1 END,
      send_day = excluded.send_day
    WHERE email_codes.created_at <= ? AND (email_codes.send_day <> excluded.send_day OR email_codes.send_count < ?)
    RETURNING email`
  const params = [...values, ...(userCondition ? [email] : []), now - RESEND_COOLDOWN_MS, DAILY_SENDS]
  return [[sql, ...params], code]
}

/** Emails a stored code. If sending fails, lifts the cooldown so the user can retry straight away. */
export const deliver = async (email, code, purpose) => {
  const sent = await sendCode(email, code, purpose)
  if (!sent) {
    await run('UPDATE email_codes SET created_at = 0, send_count = send_count - 1 WHERE email = ? AND purpose = ?', email, purpose)
  }
  return sent
}

/** Seconds until another code can be sent, or null if one can be sent now (or no code exists yet). */
export const waitFor = (row, now = Date.now()) => {
  if (!row) return null
  if (row.send_day === new Date(now).toISOString().slice(0, 10) && row.send_count >= DAILY_SENDS) {
    return Math.ceil((Date.parse(`${row.send_day}T00:00:00Z`) + 86_400_000 - now) / 1000)
  }
  const wait = Math.ceil((row.created_at + RESEND_COOLDOWN_MS - now) / 1000)
  return wait > 0 ? wait : null
}

export const normalizeCode = (code) => {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (digits.length !== 6) throw new HttpError(400, 'Enter the 6-digit code from the email')
  return digits
}

/** Checks a submitted code (one round-trip), counting the attempt. Throws an HttpError if it is not valid. */
export const checkCode = async (email, purpose, code) => {
  const row = await one(
    'UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ? RETURNING code_hash, expires_at, attempts',
    email, purpose,
  )
  if (!row) throw new HttpError(400, 'No code was sent to this email. Ask for a new one.')
  if (row.attempts > MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong tries. Ask for a new code.')
  if (row.expires_at < Date.now()) throw new HttpError(400, 'This code has expired. Ask for a new one.')
  const expected = Buffer.from(row.code_hash, 'hex')
  const actual = Buffer.from(hashCode(email, purpose, code), 'hex')
  if (!crypto.timingSafeEqual(expected, actual)) {
    const left = MAX_ATTEMPTS - row.attempts
    throw new HttpError(400, left > 0
      ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
      : "That code isn't right. Ask for a new code.")
  }
}
