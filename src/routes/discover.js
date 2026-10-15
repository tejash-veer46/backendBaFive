import { Router } from 'express'
import { one, all, run, batch, isUniqueViolation } from '../db.js'
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

const pairParams = (user) => ({ me: user.id, wants: user.interested_in || 'everyone', gender: user.gender || '' })

router.get('/discover', async (req, res) => {
  const me = req.user
  const limit = Math.min(Number(req.query.limit) || 10, 30)
  const rows = await all(`
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

router.get('/profiles/:id', async (req, res) => {
  const row = await one('SELECT * FROM users WHERE id = ? AND onboarded = 1', Number(req.params.id))
  if (!row) throw new HttpError(404, 'Profile not found')
  res.json(publicProfile(row, req.user))
})

router.get('/roses', async (req, res) => {
  res.json({ remaining: await rosesRemaining(req.user.id), perDay: ROSES_PER_DAY })
})

const rosesRemaining = async (userId) => {
  const { used } = await one(
    "SELECT COUNT(*) AS used FROM likes WHERE from_id = ? AND is_rose = 1 AND created_at > datetime('now', '-1 day')",
    userId,
  )
  return Math.max(0, ROSES_PER_DAY - used)
}

// Two round-trips: one read to validate, then one batch that records the like and,
// if it is mutual, creates the match with like comments as the opening messages.
router.post('/likes', async (req, res) => {
  const me = req.user
  const toId = Number(req.body.userId)
  const targetType = ['photo', 'prompt'].includes(req.body.targetType) ? req.body.targetType : 'profile'
  const targetIndex = targetType === 'profile' ? null : Number(req.body.targetIndex) || 0
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 300) || null : null
  const rose = req.body.rose ? 1 : 0

  if (toId === me.id) throw new HttpError(400, "You can't like yourself")
  const pair = { me: me.id, to: toId, lo: Math.min(me.id, toId), hi: Math.max(me.id, toId) }
  const target = await one(`
    SELECT u.*,
      EXISTS(SELECT 1 FROM matches WHERE user_a = :lo AND user_b = :hi) AS matched,
      EXISTS(SELECT 1 FROM likes WHERE from_id = :me AND to_id = :to) AS liked,
      (SELECT COUNT(*) FROM likes
        WHERE from_id = :me AND is_rose = 1 AND created_at > datetime('now', '-1 day')) AS roses_used
    FROM users u WHERE u.id = :to AND u.onboarded = 1
  `, pair)
  if (!target) throw new HttpError(404, 'This person is no longer available')
  if (target.matched) throw new HttpError(409, "You're already matched")
  if (target.liked) throw new HttpError(409, 'You already liked this person')
  if (rose && target.roses_used >= ROSES_PER_DAY) throw new HttpError(429, "You've used today's rose. A new one arrives tomorrow.")

  let results
  try {
    results = await batch([
      ['INSERT INTO likes (from_id, to_id, target_type, target_index, comment, is_rose) VALUES (?, ?, ?, ?, ?, ?)',
        me.id, toId, targetType, targetIndex, comment, rose],
      ['DELETE FROM passes WHERE from_id = ? AND to_id = ?', me.id, toId],
      demoLikesBack(target, me, { comment, rose }) &&
        ["INSERT OR IGNORE INTO likes (from_id, to_id, target_type, comment) VALUES (?, ?, 'profile', NULL)", toId, me.id],
      // Mutual like -> match.
      [`INSERT OR IGNORE INTO matches (user_a, user_b)
        SELECT :lo, :hi WHERE EXISTS(SELECT 1 FROM likes WHERE from_id = :to AND to_id = :me)`, pair],
      // Like comments become the opening messages of a brand-new match.
      [`INSERT INTO messages (match_id, sender_id, body)
        SELECT x.id, l.from_id, l.comment FROM matches x
        JOIN likes l ON (l.from_id = :me AND l.to_id = :to) OR (l.from_id = :to AND l.to_id = :me)
        WHERE x.user_a = :lo AND x.user_b = :hi AND l.comment IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM messages WHERE match_id = x.id)
        ORDER BY l.created_at, l.id`, pair],
      ['SELECT id FROM matches WHERE user_a = ? AND user_b = ?', pair.lo, pair.hi],
    ])
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'You already liked this person')
    throw err
  }

  const match = results.at(-1).rows[0]
  if (!match) return res.status(201).json({ matched: false })
  res.status(201).json({ matched: true, matchId: match.id, profile: publicProfile(target, me) })
})

router.post('/passes', async (req, res) => {
  const toId = Number(req.body.userId)
  const [found] = await batch([
    ['SELECT 1 FROM users WHERE id = ?', toId],
    ['INSERT OR IGNORE INTO passes (from_id, to_id) SELECT ?, id FROM users WHERE id = ?', req.user.id, toId],
  ])
  if (!found.rows.length) throw new HttpError(404, 'Profile not found')
  res.status(201).json({ ok: true })
})

router.delete('/passes/:userId', async (req, res) => {
  await run('DELETE FROM passes WHERE from_id = ? AND to_id = ?', req.user.id, Number(req.params.userId))
  res.status(204).end()
})

router.get('/likes/received', async (req, res) => {
  const me = req.user
  const rows = await all(`
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

router.get('/summary', async (req, res) => {
  // Polled every few seconds by the app, so keep it to a single round-trip.
  const r = await one(`
    SELECT
      (SELECT COUNT(*) FROM likes l
        WHERE l.to_id = :me AND l.from_id NOT IN (SELECT to_id FROM passes WHERE from_id = :me)
          AND l.from_id NOT IN (SELECT to_id FROM likes WHERE from_id = :me)) AS likes,
      (SELECT COUNT(*) FROM messages m JOIN matches x ON x.id = m.match_id
        WHERE (x.user_a = :me OR x.user_b = :me) AND m.sender_id != :me AND m.read_at IS NULL) AS unread,
      (SELECT COUNT(*) FROM likes
        WHERE from_id = :me AND is_rose = 1 AND created_at > datetime('now', '-1 day')) AS roses_used
  `, { me: req.user.id })
  res.json({ likes: r.likes, unread: r.unread, roses: Math.max(0, ROSES_PER_DAY - r.roses_used) })
})

export default router
