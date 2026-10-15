import { Router } from 'express'
import { one, all, run, transaction } from '../db.js'
import { HttpError, requireAuth, publicProfile } from '../lib.js'
import { demoLikesBack } from '../demo.js'

const router = Router()
router.use(requireAuth)

const ROSES_PER_DAY = 1

// SQL fragment: candidate `u` fits the viewer's preference and vice versa.
const compatibleSql = `
  u.onboarded = 1 AND u.id != :me
  AND (:wants = 'everyone' OR (:wants = 'men' AND u.gender = 'man') OR (:wants = 'women' AND u.gender = 'woman'))
  AND (u.interested_in = 'everyone'
       OR (u.interested_in = 'men' AND :gender = 'man')
       OR (u.interested_in = 'women' AND :gender = 'woman'))
`

const matchBetween = (a, b) => one(
  'SELECT * FROM matches WHERE user_a = ? AND user_b = ?', Math.min(a, b), Math.max(a, b),
)

const pairParams = (user) => ({ me: user.id, wants: user.interested_in || 'everyone', gender: user.gender || '' })

router.get('/discover', (req, res) => {
  const me = req.user
  const limit = Math.min(Number(req.query.limit) || 10, 30)
  const rows = all(`
    SELECT u.*, EXISTS(SELECT 1 FROM likes l WHERE l.from_id = u.id AND l.to_id = :me) AS liked_me
    FROM users u
    WHERE ${compatibleSql}
      AND u.id NOT IN (SELECT to_id FROM likes WHERE from_id = :me)
      AND u.id NOT IN (SELECT to_id FROM passes WHERE from_id = :me)
      AND u.id NOT IN (SELECT CASE WHEN user_a = :me THEN user_b ELSE user_a END FROM matches WHERE user_a = :me OR user_b = :me)
    ORDER BY u.last_active DESC
    LIMIT 100
  `, pairParams(me))

  // Shared interests and recent activity float people up, with some shuffle so the feed feels fresh.
  const ranked = rows
    .map((row) => {
      const profile = publicProfile(row, me)
      const score = profile.sharedInterests.length * 2 + (row.liked_me ? 1.5 : 0) + Math.random() * 3
      return { profile, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.profile)

  res.json(ranked)
})

router.get('/profiles/:id', (req, res) => {
  const row = one('SELECT * FROM users WHERE id = ? AND onboarded = 1', Number(req.params.id))
  if (!row) throw new HttpError(404, 'Profile not found')
  res.json(publicProfile(row, req.user))
})

router.get('/roses', (req, res) => {
  res.json({ remaining: rosesRemaining(req.user.id), perDay: ROSES_PER_DAY })
})

const rosesRemaining = (userId) => {
  const { used } = one(
    "SELECT COUNT(*) AS used FROM likes WHERE from_id = ? AND is_rose = 1 AND created_at > datetime('now', '-1 day')",
    userId,
  )
  return Math.max(0, ROSES_PER_DAY - used)
}

// Turns a mutual like into a match. Like comments become the opening messages.
const createMatch = (aId, bId) => transaction(() => {
  const existing = matchBetween(aId, bId)
  if (existing) return existing
  const { lastInsertRowid } = run(
    'INSERT INTO matches (user_a, user_b) VALUES (?, ?)', Math.min(aId, bId), Math.max(aId, bId),
  )
  const comments = all(
    `SELECT from_id, comment FROM likes
     WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND comment IS NOT NULL
     ORDER BY created_at, id`,
    aId, bId, bId, aId,
  )
  for (const c of comments) {
    run('INSERT INTO messages (match_id, sender_id, body) VALUES (?, ?, ?)', lastInsertRowid, c.from_id, c.comment)
  }
  return one('SELECT * FROM matches WHERE id = ?', lastInsertRowid)
})

router.post('/likes', (req, res) => {
  const me = req.user
  const toId = Number(req.body.userId)
  const targetType = ['photo', 'prompt'].includes(req.body.targetType) ? req.body.targetType : 'profile'
  const targetIndex = targetType === 'profile' ? null : Number(req.body.targetIndex) || 0
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 300) || null : null
  const rose = req.body.rose ? 1 : 0

  if (toId === me.id) throw new HttpError(400, "You can't like yourself")
  const target = one('SELECT * FROM users WHERE id = ? AND onboarded = 1', toId)
  if (!target) throw new HttpError(404, 'This person is no longer available')
  if (matchBetween(me.id, toId)) throw new HttpError(409, "You're already matched")
  if (one('SELECT 1 FROM likes WHERE from_id = ? AND to_id = ?', me.id, toId)) {
    throw new HttpError(409, 'You already liked this person')
  }
  if (rose && rosesRemaining(me.id) === 0) throw new HttpError(429, "You've used today's rose. A new one arrives tomorrow.")

  run(
    'INSERT INTO likes (from_id, to_id, target_type, target_index, comment, is_rose) VALUES (?, ?, ?, ?, ?, ?)',
    me.id, toId, targetType, targetIndex, comment, rose,
  )
  run('DELETE FROM passes WHERE from_id = ? AND to_id = ?', me.id, toId)

  if (target.is_demo) demoLikesBack(target, me, { comment, rose })

  const theyLikedMe = one('SELECT 1 FROM likes WHERE from_id = ? AND to_id = ?', toId, me.id)
  if (!theyLikedMe) return res.status(201).json({ matched: false })

  const match = createMatch(me.id, toId)
  res.status(201).json({ matched: true, matchId: match.id, profile: publicProfile(target, me) })
})

router.post('/passes', (req, res) => {
  const toId = Number(req.body.userId)
  if (!one('SELECT 1 FROM users WHERE id = ?', toId)) throw new HttpError(404, 'Profile not found')
  run('INSERT OR IGNORE INTO passes (from_id, to_id) VALUES (?, ?)', req.user.id, toId)
  res.status(201).json({ ok: true })
})

router.delete('/passes/:userId', (req, res) => {
  run('DELETE FROM passes WHERE from_id = ? AND to_id = ?', req.user.id, Number(req.params.userId))
  res.status(204).end()
})

router.get('/likes/received', (req, res) => {
  const me = req.user
  const rows = all(`
    SELECT l.id AS like_id, l.target_type, l.target_index, l.comment, l.is_rose, l.created_at AS liked_at, u.*
    FROM likes l JOIN users u ON u.id = l.from_id
    WHERE l.to_id = ? AND u.onboarded = 1
      AND l.from_id NOT IN (SELECT to_id FROM passes WHERE from_id = ?)
      AND l.from_id NOT IN (SELECT to_id FROM likes WHERE from_id = ?)
    ORDER BY l.is_rose DESC, l.created_at DESC, l.id DESC
  `, me.id, me.id, me.id)

  const myPhotos = JSON.parse(me.photos)
  const myPrompts = JSON.parse(me.prompts)
  res.json(rows.map((r) => ({
    likeId: r.like_id,
    comment: r.comment,
    isRose: !!r.is_rose,
    likedAt: r.liked_at,
    target: {
      type: r.target_type,
      index: r.target_index,
      photo: r.target_type === 'photo' ? myPhotos[r.target_index] ?? null : null,
      prompt: r.target_type === 'prompt' ? myPrompts[r.target_index] ?? null : null,
    },
    profile: publicProfile(r, me),
  })))
})

router.get('/summary', (req, res) => {
  const me = req.user.id
  const { likes } = one(`
    SELECT COUNT(*) AS likes FROM likes l
    WHERE l.to_id = ? AND l.from_id NOT IN (SELECT to_id FROM passes WHERE from_id = ?)
      AND l.from_id NOT IN (SELECT to_id FROM likes WHERE from_id = ?)
  `, me, me, me)
  const { unread } = one(`
    SELECT COUNT(*) AS unread FROM messages m JOIN matches x ON x.id = m.match_id
    WHERE (x.user_a = ? OR x.user_b = ?) AND m.sender_id != ? AND m.read_at IS NULL
  `, me, me, me)
  res.json({ likes, unread, roses: rosesRemaining(me) })
})

export { createMatch }
export default router
