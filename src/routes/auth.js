import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { one, batch, isUniqueViolation } from '../db.js'
import { HttpError, wrap, signToken, requireAuth, selfProfile, ageFrom } from '../lib.js'
import { issueCode, deliver, waitFor, normalizeCode, checkCode, emailCodesEnabled } from '../codes.js'
import { newUserLikes } from '../demo.js'

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

const emailFrom = (body) => {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 120 || !EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email')
  return email
}

const requireEmailCodes = (req, res, next) => {
  if (!emailCodesEnabled()) throw new HttpError(503, 'Email codes are turned off for now. Please try again later.')
  next()
}

const checkPassword = (password) => {
  if (typeof password !== 'string' || password.length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters')
  }
}

// New accounts start unverified and get a code by email; the token comes from /verify-email.
// With email codes off, the account (still unverified) is signed in straight away.
router.post('/signup', wrap(async (req, res) => {
  const name = str(req.body.name, 50, 'Name')
  const email = str(req.body.email, 120, 'Email')?.toLowerCase()
  const { password } = req.body
  if (!name) throw new HttpError(400, 'Please tell us your name')
  if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email')
  checkPassword(password)
  const department = str(req.body.department, 60, 'Department') ?? null

  const hash = await bcrypt.hash(password, 10)
  const insert = ['INSERT INTO users (email, password_hash, name, department, email_verified) VALUES (?, ?, ?, ?, 0) RETURNING *', email, hash, name, department]
  if (!emailCodesEnabled()) {
    let user
    try {
      user = await one(...insert)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'An account with this email already exists')
      throw err
    }
    return res.status(201).json({ token: signToken(user.id), user: selfProfile(user) })
  }

  const [codeStatement, code] = issueCode(email, 'verify')
  // One round-trip: the UNIQUE email constraint catches duplicates and rolls back the code too.
  let issued
  try {
    ;[, issued] = await batch([insert, codeStatement])
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'An account with this email already exists')
    throw err
  }
  const codeSent = issued.rows.length > 0 && (await deliver(email, code, 'verify'))
  res.status(201).json({ needsVerification: true, email, codeSent })
}))

router.post('/verify-email', requireEmailCodes, wrap(async (req, res) => {
  const email = emailFrom(req.body)
  const code = normalizeCode(req.body.code)
  await checkCode(email, 'verify', code)
  const [updated] = await batch([
    ['UPDATE users SET email_verified = 1 WHERE email = ? RETURNING *', email],
    ["DELETE FROM email_codes WHERE email = ? AND purpose = 'verify'", email],
  ])
  const user = updated.rows[0]
  if (!user) throw new HttpError(400, 'No account uses this email')
  res.json({ token: signToken(user.id), user: selfProfile(user) })
}))

router.post('/resend-code', requireEmailCodes, wrap(async (req, res) => {
  const email = emailFrom(req.body)
  // Reset codes are re-sent the same way they were first requested, without revealing whether the account exists.
  if (req.body.purpose === 'reset') return forgotPassword(email, res)

  const [codeStatement, code] = issueCode(email, 'verify', 'email_verified = 0')
  const [issued, current] = await batch([
    codeStatement,
    ["SELECT created_at, send_day, send_count FROM email_codes WHERE email = ? AND purpose = 'verify'", email],
  ])
  if (issued.rows.length) {
    if (!(await deliver(email, code, 'verify'))) throw new HttpError(502, "We couldn't send the email. Please try again in a minute.")
    return res.json({ ok: true })
  }
  const wait = waitFor(current.rows[0])
  if (wait) {
    const message = wait > 60 ? "You've asked for a lot of codes today. Please try again tomorrow." : `Please wait ${wait}s before asking for another code.`
    throw new HttpError(429, message, { retryAfter: wait })
  }
  // Already verified or no such account: nothing to send.
  res.json({ ok: true })
}))

router.post('/login', wrap(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const user = email && await one('SELECT * FROM users WHERE email = ?', email)
  const ok = user && (await bcrypt.compare(String(req.body.password ?? ''), user.password_hash))
  if (!ok) throw new HttpError(401, 'Incorrect email or password')
  if (!user.email_verified && emailCodesEnabled()) {
    // Send a fresh code unless one went out in the last minute.
    const [codeStatement, code] = issueCode(user.email, 'verify')
    const issued = await one(...codeStatement)
    const codeSent = !!issued && (await deliver(user.email, code, 'verify'))
    throw new HttpError(403, codeSent ? 'Please verify your email. We just sent you a new code.' : 'Please verify your email with the code we sent you.', {
      needsVerification: true, email: user.email, codeSent,
    })
  }
  res.json({ token: signToken(user.id), user: selfProfile(user) })
}))

// Always answers the same way so it can't be used to find out which emails have accounts.
const forgotPassword = async (email, res) => {
  const [codeStatement, code] = issueCode(email, 'reset', 'true')
  const issued = await one(...codeStatement)
  // Not awaited, so the response time doesn't reveal whether an email was sent.
  if (issued) deliver(email, code, 'reset').catch((err) => console.error('[mail]', err))
  res.json({ ok: true })
}

router.post('/forgot-password', requireEmailCodes, wrap(async (req, res) => forgotPassword(emailFrom(req.body), res)))

router.post('/reset-password', requireEmailCodes, wrap(async (req, res) => {
  const email = emailFrom(req.body)
  const code = normalizeCode(req.body.code)
  checkPassword(req.body.newPassword)
  await checkCode(email, 'reset', code)
  const hash = await bcrypt.hash(req.body.newPassword, 10)
  // Receiving the code also proves the user owns the email.
  const [updated] = await batch([
    ['UPDATE users SET password_hash = ?, email_verified = 1 WHERE email = ? RETURNING *', hash, email],
    ['DELETE FROM email_codes WHERE email = ?', email],
  ])
  const user = updated.rows[0]
  if (!user) throw new HttpError(400, 'No account uses this email')
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

// Accepts a username or a profile link and keeps just the username.
const SOCIALS = {
  github: { label: 'GitHub', prefix: /^(https?:\/\/)?(www\.)?github\.com\//i, pattern: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/ },
  linkedin: { label: 'LinkedIn', prefix: /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\//i, pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/ },
  instagram: { label: 'Instagram', prefix: /^(https?:\/\/)?(www\.)?instagram\.com\//i, pattern: /^[A-Za-z0-9._]{1,30}$/ },
}

const validateSocials = (socials) => {
  if (socials === null || typeof socials !== 'object' || Array.isArray(socials)) throw new HttpError(400, 'Socials must be an object')
  const clean = {}
  for (const [key, { label, prefix, pattern }] of Object.entries(SOCIALS)) {
    const raw = socials[key]
    if (raw === undefined || raw === null || raw === '') continue
    if (typeof raw !== 'string') throw new HttpError(400, `${label} must be text`)
    const handle = raw.trim().replace(prefix, '').replace(/^@/, '').replace(/[/?#].*$/, '')
    if (!handle) continue
    if (!pattern.test(handle)) throw new HttpError(400, `That doesn't look like a ${label} username`)
    clean[key] = handle
  }
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
  if (b.socials !== undefined) updates.socials = JSON.stringify(validateSocials(b.socials))

  // Decide onboarding from the merged profile so the whole update is one round-trip.
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const merged = { ...req.user, ...Object.fromEntries(entries) }
  const justOnboarded = !req.user.onboarded && !!merged.birthdate && !!merged.gender && JSON.parse(merged.photos).length >= 1
  if (justOnboarded) entries.push(['onboarded', 1])

  const [updated] = await batch([
    entries.length
      ? [`UPDATE users SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ? RETURNING *`, ...entries.map(([, v]) => v), req.user.id]
      : ['SELECT * FROM users WHERE id = ?', req.user.id],
    justOnboarded && newUserLikes(merged),
  ])
  res.json(selfProfile(updated.rows[0]))
})

router.delete('/me', requireAuth, async (req, res) => {
  const id = req.user.id
  await batch([
    ['DELETE FROM email_codes WHERE email = ?', req.user.email],
    ['DELETE FROM messages WHERE sender_id = ? OR match_id IN (SELECT id FROM matches WHERE user_a = ? OR user_b = ?)', id, id, id],
    ['DELETE FROM matches WHERE user_a = ? OR user_b = ?', id, id],
    ['DELETE FROM likes WHERE from_id = ? OR to_id = ?', id, id],
    ['DELETE FROM passes WHERE from_id = ? OR to_id = ?', id, id],
    ['DELETE FROM users WHERE id = ?', id],
  ])
  res.status(204).end()
})

export default router
