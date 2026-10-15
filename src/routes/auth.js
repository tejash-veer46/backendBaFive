import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { one, run, transaction } from '../db.js'
import { HttpError, wrap, signToken, requireAuth, selfProfile, ageFrom } from '../lib.js'
import { onNewUser } from '../demo.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GENDERS = ['man', 'woman', 'nonbinary']
const PREFERENCES = ['men', 'women', 'everyone']

const str = (value, max, field) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`)
  return trimmed || null
}

router.post('/signup', wrap(async (req, res) => {
  const name = str(req.body.name, 50, 'Name')
  const email = str(req.body.email, 120, 'Email')?.toLowerCase()
  const { password } = req.body
  if (!name) throw new HttpError(400, 'Please tell us your name')
  if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email')
  if (typeof password !== 'string' || password.length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters')
  }
  if (await one('SELECT id FROM users WHERE email = ?', email)) {
    throw new HttpError(409, 'An account with this email already exists')
  }

  const hash = await bcrypt.hash(password, 10)
  const { lastInsertRowid } = await run(
    'INSERT INTO users (email, password_hash, name, department) VALUES (?, ?, ?, ?)',
    email, hash, name, str(req.body.department, 60, 'Department') ?? null,
  )
  const user = await one('SELECT * FROM users WHERE id = ?', lastInsertRowid)
  res.status(201).json({ token: signToken(user.id), user: selfProfile(user) })
}))

router.post('/login', wrap(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const user = email && await one('SELECT * FROM users WHERE email = ?', email)
  const ok = user && (await bcrypt.compare(String(req.body.password ?? ''), user.password_hash))
  if (!ok) throw new HttpError(401, 'Incorrect email or password')
  res.json({ token: signToken(user.id), user: selfProfile(user) })
}))

router.get('/me', requireAuth, async (req, res) => {
  res.json(selfProfile(req.user))
})

const validatePhotos = (photos) => {
  if (!Array.isArray(photos)) throw new HttpError(400, 'Photos must be a list')
  if (photos.length > 6) throw new HttpError(400, 'You can add up to 6 photos')
  for (const p of photos) {
    const isUrl = typeof p === 'string' && /^https:\/\//.test(p) && p.length < 2000
    const isData = typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p) && p.length < 2_000_000
    if (!isUrl && !isData) throw new HttpError(400, 'One of the photos is invalid or too large')
  }
  return photos
}

const validatePrompts = (prompts) => {
  if (!Array.isArray(prompts)) throw new HttpError(400, 'Prompts must be a list')
  if (prompts.length > 3) throw new HttpError(400, 'You can answer up to 3 prompts')
  return prompts.map((p) => {
    const question = str(p?.question, 120, 'Prompt')
    const answer = str(p?.answer, 300, 'Prompt answer')
    if (!question || !answer) throw new HttpError(400, 'Each prompt needs a question and an answer')
    return { question, answer }
  })
}

const validateInterests = (interests) => {
  if (!Array.isArray(interests)) throw new HttpError(400, 'Interests must be a list')
  const clean = [...new Set(interests.map((i) => str(i, 30, 'Interest')).filter(Boolean))]
  if (clean.length > 10) throw new HttpError(400, 'Pick up to 10 interests')
  return clean
}

router.put('/me', requireAuth, async (req, res) => {
  const b = req.body
  const updates = {
    name: str(b.name, 50, 'Name'),
    pronouns: str(b.pronouns, 30, 'Pronouns'),
    department: str(b.department, 60, 'Department'),
    job_title: str(b.jobTitle, 60, 'Job title'),
    hometown: str(b.hometown, 60, 'Hometown'),
    bio: str(b.bio, 500, 'Bio'),
  }
  if (updates.name === null) throw new HttpError(400, 'Name cannot be empty')

  if (b.birthdate !== undefined) {
    const age = ageFrom(b.birthdate)
    if (age === null || age > 100) throw new HttpError(400, 'Please enter a valid birthday')
    if (age < 18) throw new HttpError(400, 'You must be 18 or older to use baFive')
    updates.birthdate = b.birthdate
  }
  if (b.gender !== undefined) {
    if (!GENDERS.includes(b.gender)) throw new HttpError(400, 'Please choose a gender')
    updates.gender = b.gender
  }
  if (b.interestedIn !== undefined) {
    if (!PREFERENCES.includes(b.interestedIn)) throw new HttpError(400, 'Please choose who you want to meet')
    updates.interested_in = b.interestedIn
  }
  if (b.heightCm !== undefined) {
    const h = b.heightCm === null || b.heightCm === '' ? null : Number(b.heightCm)
    if (h !== null && !(h >= 120 && h <= 230)) throw new HttpError(400, 'Height must be between 120 and 230 cm')
    updates.height_cm = h
  }
  if (b.photos !== undefined) updates.photos = JSON.stringify(validatePhotos(b.photos))
  if (b.prompts !== undefined) updates.prompts = JSON.stringify(validatePrompts(b.prompts))
  if (b.interests !== undefined) updates.interests = JSON.stringify(validateInterests(b.interests))

  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  if (entries.length) {
    await run(
      `UPDATE users SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
      ...entries.map(([, v]) => v), req.user.id,
    )
  }

  let user = await one('SELECT * FROM users WHERE id = ?', req.user.id)
  const complete = user.birthdate && user.gender && JSON.parse(user.photos).length >= 1
  if (complete && !user.onboarded) {
    await run('UPDATE users SET onboarded = 1 WHERE id = ?', user.id)
    user = await one('SELECT * FROM users WHERE id = ?', user.id)
    await onNewUser(user)
  }
  res.json(selfProfile(user))
})

router.delete('/me', requireAuth, async (req, res) => {
  const id = req.user.id
  await transaction(async (tx) => {
    await tx.run('DELETE FROM messages WHERE sender_id = ? OR match_id IN (SELECT id FROM matches WHERE user_a = ? OR user_b = ?)', id, id, id)
    await tx.run('DELETE FROM matches WHERE user_a = ? OR user_b = ?', id, id)
    await tx.run('DELETE FROM likes WHERE from_id = ? OR to_id = ?', id, id)
    await tx.run('DELETE FROM passes WHERE from_id = ? OR to_id = ?', id, id)
    await tx.run('DELETE FROM users WHERE id = ?', id)
  })
  res.status(204).end()
})

export default router
