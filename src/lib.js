import jwt from 'jsonwebtoken'
import { one, run } from './db.js'

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me'
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production')
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Express 4 does not forward rejected promises to the error handler.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const signToken = (userId) => jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' })

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next(new HttpError(401, 'Not signed in'))
  try {
    const { sub } = jwt.verify(token, JWT_SECRET)
    const user = one('SELECT * FROM users WHERE id = ?', sub)
    if (!user) return next(new HttpError(401, 'Account no longer exists'))
    req.user = user
    run("UPDATE users SET last_active = datetime('now') WHERE id = ?", user.id)
    next()
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'))
  }
}

const parse = (json, fallback) => {
  try {
    return JSON.parse(json) ?? fallback
  } catch {
    return fallback
  }
}

export const ageFrom = (birthdate) => {
  if (!birthdate) return null
  const b = new Date(birthdate)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

const minutesSince = (sqlDate) => (Date.now() - new Date(sqlDate.replace(' ', 'T') + 'Z').getTime()) / 60000

// Public view of a profile. `viewer` (a users row) adds shared interests.
export const publicProfile = (row, viewer) => {
  const interests = parse(row.interests, [])
  const viewerInterests = viewer ? parse(viewer.interests, []) : []
  return {
    id: row.id,
    name: row.name,
    age: ageFrom(row.birthdate),
    gender: row.gender,
    pronouns: row.pronouns,
    department: row.department,
    jobTitle: row.job_title,
    hometown: row.hometown,
    heightCm: row.height_cm,
    bio: row.bio,
    photos: parse(row.photos, []),
    prompts: parse(row.prompts, []),
    interests,
    sharedInterests: viewer ? interests.filter((i) => viewerInterests.includes(i)) : [],
    activeRecently: minutesSince(row.last_active) < 60 * 24,
  }
}

// The signed-in user's own view, including private settings.
export const selfProfile = (row) => ({
  ...publicProfile(row),
  email: row.email,
  birthdate: row.birthdate,
  interestedIn: row.interested_in,
  onboarded: !!row.onboarded,
})
