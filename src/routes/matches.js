import { Router } from 'express'
import { one, all, run, transaction } from '../db.js'
import { HttpError, requireAuth, publicProfile } from '../lib.js'
import { demoReply } from '../demo.js'

const router = Router()
router.use(requireAuth)

const otherId = (match, me) => (match.user_a === me ? match.user_b : match.user_a)

const loadMatch = async (req) => {
  const match = await one(
    'SELECT * FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?)',
    Number(req.params.id), req.user.id, req.user.id,
  )
  if (!match) throw new HttpError(404, 'This conversation no longer exists')
  return match
}

const toMessage = (m) => ({
  id: m.id,
  senderId: m.sender_id,
  body: m.body,
  createdAt: m.created_at,
  readAt: m.read_at,
})

router.get('/', async (req, res) => {
  const me = req.user
  // One query: each match joined with the other person and the latest message.
  const rows = await all(`
    SELECT u.*, x.id AS match_id, x.created_at AS matched_at,
      m.id AS m_id, m.sender_id AS m_sender_id, m.body AS m_body, m.created_at AS m_created_at, m.read_at AS m_read_at,
      (SELECT COUNT(*) FROM messages WHERE match_id = x.id AND sender_id != :me AND read_at IS NULL) AS unread
    FROM matches x
    JOIN users u ON u.id = CASE WHEN x.user_a = :me THEN x.user_b ELSE x.user_a END
    LEFT JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE match_id = x.id)
    WHERE x.user_a = :me OR x.user_b = :me
  `, { me: me.id })

  const result = rows.map((r) => ({
    id: r.match_id,
    createdAt: r.matched_at,
    unread: r.unread,
    lastMessage: r.m_id
      ? toMessage({ id: r.m_id, sender_id: r.m_sender_id, body: r.m_body, created_at: r.m_created_at, read_at: r.m_read_at })
      : null,
    profile: publicProfile(r, me),
  }))
  const activity = (m) => m.lastMessage?.createdAt || m.createdAt
  result.sort((a, b) => activity(b).localeCompare(activity(a)))
  res.json(result)
})

router.get('/:id', async (req, res) => {
  const match = await loadMatch(req)
  const other = await one('SELECT * FROM users WHERE id = ?', otherId(match, req.user.id))
  res.json({ id: match.id, createdAt: match.created_at, profile: publicProfile(other, req.user) })
})

router.delete('/:id', async (req, res) => {
  const match = await loadMatch(req)
  const me = req.user.id
  const other = otherId(match, me)
  await transaction(async (tx) => {
    await tx.run('DELETE FROM messages WHERE match_id = ?', match.id)
    await tx.run('DELETE FROM matches WHERE id = ?', match.id)
    await tx.run('DELETE FROM likes WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', me, other, other, me)
    await tx.run('INSERT OR IGNORE INTO passes (from_id, to_id) VALUES (?, ?), (?, ?)', me, other, other, me)
  })
  res.status(204).end()
})

router.get('/:id/messages', async (req, res) => {
  const match = await loadMatch(req)
  const after = Number(req.query.after) || 0
  const messages = await all(
    'SELECT * FROM messages WHERE match_id = ? AND id > ? ORDER BY id',
    match.id, after,
  )
  if (messages.some((m) => m.sender_id !== req.user.id && !m.read_at)) {
    await run(
      "UPDATE messages SET read_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE match_id = ? AND sender_id != ? AND read_at IS NULL",
      match.id, req.user.id,
    )
  }
  res.json(messages.map(toMessage))
})

router.post('/:id/messages', async (req, res) => {
  const match = await loadMatch(req)
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : ''
  if (!body) throw new HttpError(400, 'Message cannot be empty')
  if (body.length > 1000) throw new HttpError(400, 'Message is too long')

  const { lastInsertRowid } = await run(
    'INSERT INTO messages (match_id, sender_id, body) VALUES (?, ?, ?)', match.id, req.user.id, body,
  )
  const other = await one('SELECT is_demo FROM users WHERE id = ?', otherId(match, req.user.id))
  if (other?.is_demo) demoReply(match.id, otherId(match, req.user.id))
  res.status(201).json(toMessage(await one('SELECT * FROM messages WHERE id = ?', lastInsertRowid)))
})

export default router
