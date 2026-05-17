import { Router } from 'express'
import { getRow, getAllRows, runQuery } from '../models/db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// Get all messages for current user (conversations)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const messages = await getAllRows(`
      SELECT DISTINCT 
        CASE 
          WHEN sender_id = ? THEN recipient_id 
          ELSE sender_id 
        END as conversation_user_id
      FROM messages
      WHERE sender_id = ? OR recipient_id = ?
    `, [req.user.id, req.user.id, req.user.id])

    const conversations = await Promise.all(
      messages.map(async (msg) => {
        const user = await getRow(
          'SELECT id, name, email, profile_image FROM users WHERE id = ?',
          [msg.conversation_user_id]
        )
        const lastMessage = await getRow(`
          SELECT message, created_at FROM messages
          WHERE (sender_id = ? AND recipient_id = ?) 
          OR (sender_id = ? AND recipient_id = ?)
          ORDER BY created_at DESC
          LIMIT 1
        `, [req.user.id, msg.conversation_user_id, msg.conversation_user_id, req.user.id])

        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          profile_image: user.profile_image,
          lastMessage: lastMessage?.message || '',
          lastMessageTime: lastMessage?.created_at || null
        }
      })
    )

    res.json(conversations)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get messages with a specific user
router.get('/:conversationUserId', authMiddleware, async (req, res) => {
  try {
    const { conversationUserId } = req.params
    const currentUserId = req.user.id

    const messages = await getAllRows(`
      SELECT * FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) 
      OR (sender_id = ? AND recipient_id = ?)
      ORDER BY created_at ASC
    `, [currentUserId, conversationUserId, conversationUserId, currentUserId])

    // Mark messages as read
    await runQuery(`
      UPDATE messages SET read = 1
      WHERE recipient_id = ? AND sender_id = ?
    `, [currentUserId, conversationUserId])

    res.json(messages)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Send a message
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { recipient_id, message } = req.body
    const sender_id = req.user.id

    if (!recipient_id || !message) {
      return res.status(400).json({ error: 'Recipient ID and message are required' })
    }

    // Check if recipient exists
    const recipient = await getRow('SELECT id FROM users WHERE id = ?', [recipient_id])
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' })
    }

    // Check if users are connected
    const connection = await getRow(`
      SELECT id FROM connections
      WHERE ((user_id = ? AND connected_with_id = ?) OR (user_id = ? AND connected_with_id = ?))
      AND liked_back = 1
    `, [sender_id, recipient_id, recipient_id, sender_id])

    if (!connection) {
      return res.status(403).json({ error: 'You can only message users you matched with' })
    }

    await runQuery(
      'INSERT INTO messages (sender_id, recipient_id, message, read) VALUES (?, ?, ?, 0)',
      [sender_id, recipient_id, message]
    )

    const newMessage = await getRow(
      'SELECT * FROM messages WHERE sender_id = ? AND recipient_id = ? ORDER BY created_at DESC LIMIT 1',
      [sender_id, recipient_id]
    )

    res.status(201).json(newMessage)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
