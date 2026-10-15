import { Router } from 'express'
import { one, all, run, transaction } from '../db.js'
import { HttpError, requireAuth, publicProfile } from '../lib.js'
import { demoReply } from '../demo.js'

const router = Router()
router.use(requireAuth)

const otherId = (match, me) => (match.user_a === me ? match.user_b : match.user_a)

const loadMatch = (req) => {
  const match = one(
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

router.get('/', (req, res) => {
  const me = req.user
  const matches = all(`
    SELECT x.*,
      (SELECT MAX(id) FROM messages WHERE match_id = x.id) AS last_message_id,
      (SELECT COUNT(*) FROM messages WHERE match_id = x.id AND sender_id != :me AND read_at IS NULL) AS unread
    FROM matches x
    WHERE x.user_a = :me OR x.user_b = :me
  `, { me: me.id })

  const result = matches.map((x) => {
    const other = one('SELECT * FROM users WHERE id = ?', otherId(x, me.id))
    const last = x.last_message_id ? one('SELECT * FROM messages WHERE id = ?', x.last_message_id) : null
    return {
      id: x.id,
      createdAt: x.created_at,
      unread: x.unread,
      lastMessage: last ? toMessage(last) : null,
      profile: publicProfile(other, me),
    }
  })
  const activity = (m) => m.lastMessage?.createdAt || m.createdAt
  result.sort((a, b) => activity(b).localeCompare(activity(a)))
  res.json(result)
})

router.get('/:id', (req, res) => {
  const match = loadMatch(req)
  const other = one('SELECT * FROM users WHERE id = ?', otherId(match, req.user.id))
  res.json({ id: match.id, createdAt: match.created_at, profile: publicProfile(other, req.user) })
})

router.delete('/:id', (req, res) => {
  const match = loadMatch(req)
  const other = otherId(match, req.user.id)
  transaction(() => {
    run('DELETE FROM matches WHERE id = ?', match.id)
    run('DELETE FROM likes WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', req.user.id, other, other, req.user.id)
    run('INSERT OR IGNORE INTO passes (from_id, to_id) VALUES (?, ?), (?, ?)', req.user.id, other, other, req.user.id)
  })
  res.status(204).end()
})

router.get('/:id/messages', (req, res) => {
  const match = loadMatch(req)
  const after = Number(req.query.after) || 0
  const messages = all(
    'SELECT * FROM messages WHERE match_id = ? AND id > ? ORDER BY id',
    match.id, after,
  )
  run(
    "UPDATE messages SET read_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE match_id = ? AND sender_id != ? AND read_at IS NULL",
    match.id, req.user.id,
  )
  res.json(messages.map(toMessage))
})

router.post('/:id/messages', (req, res) => {
  const match = loadMatch(req)
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : ''
  if (!body) throw new HttpError(400, 'Message cannot be empty')
  if (body.length > 1000) throw new HttpError(400, 'Message is too long')

  const { lastInsertRowid } = run(
    'INSERT INTO messages (match_id, sender_id, body) VALUES (?, ?, ?)', match.id, req.user.id, body,
  )
  const other = one('SELECT * FROM users WHERE id = ?', otherId(match, req.user.id))
  if (other.is_demo) demoReply(match.id, other.id)
  res.status(201).json(toMessage(one('SELECT * FROM messages WHERE id = ?', lastInsertRowid)))
})

export default router
