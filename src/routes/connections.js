import { Router } from 'express'
import { getRow, getAllRows, runQuery } from '../models/db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// Get user's connections (liked or mutual matches)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const connections = await getAllRows(`
      SELECT u.*, c.liked_back as mutualLike FROM connections c
      JOIN users u ON u.id = c.connected_with_id
      WHERE c.user_id = ? AND c.liked_back = 1
    `, [req.user.id])

    const connectionsWithInterests = await Promise.all(
      connections.map(async (conn) => {
        const interests = await getAllRows(
          'SELECT interest FROM interests WHERE user_id = ?',
          [conn.id]
        )
        return {
          id: conn.id,
          name: conn.name,
          email: conn.email,
          department: conn.department,
          bio: conn.bio,
          age: conn.age,
          profile_image: conn.profile_image,
          interests: interests.map(i => i.interest),
          mutualLike: conn.mutualLike
        }
      })
    )

    res.json(connectionsWithInterests)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Like a profile
router.post('/:userId/like', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params
    const currentUserId = req.user.id

    // Prevent liking self
    if (parseInt(userId) === currentUserId) {
      return res.status(400).json({ error: 'Cannot like yourself' })
    }

    // Check if user exists
    const user = await getRow('SELECT id FROM users WHERE id = ?', [userId])
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Insert like
    await runQuery(`
      INSERT OR IGNORE INTO connections (user_id, connected_with_id, liked, liked_back)
      VALUES (?, ?, 1, 0)
    `, [currentUserId, userId])

    // Check if the other user has liked back
    const likedBack = await getRow(`
      SELECT id FROM connections 
      WHERE user_id = ? AND connected_with_id = ? AND liked = 1
    `, [userId, currentUserId])

    if (likedBack) {
      // Update both to show mutual match
      await runQuery(
        'UPDATE connections SET liked_back = 1 WHERE user_id = ? AND connected_with_id = ?',
        [currentUserId, userId]
      )
      await runQuery(
        'UPDATE connections SET liked_back = 1 WHERE user_id = ? AND connected_with_id = ?',
        [userId, currentUserId]
      )
    }

    res.json({ message: 'Profile liked', mutualMatch: !!likedBack })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Unlike a profile
router.post('/:userId/unlike', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params
    const currentUserId = req.user.id

    await runQuery(
      'DELETE FROM connections WHERE user_id = ? AND connected_with_id = ?',
      [currentUserId, userId]
    )

    // Also remove mutual match flag
    await runQuery(
      'UPDATE connections SET liked_back = 0 WHERE user_id = ? AND connected_with_id = ?',
      [userId, currentUserId]
    )

    res.json({ message: 'Profile unliked' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get likes received
router.get('/received', authMiddleware, async (req, res) => {
  try {
    const likes = await getAllRows(`
      SELECT u.* FROM connections c
      JOIN users u ON u.id = c.user_id
      WHERE c.connected_with_id = ? AND c.liked = 1 AND c.liked_back = 0
    `, [req.user.id])

    const likesWithInterests = await Promise.all(
      likes.map(async (like) => {
        const interests = await getAllRows(
          'SELECT interest FROM interests WHERE user_id = ?',
          [like.id]
        )
        return {
          id: like.id,
          name: like.name,
          email: like.email,
          department: like.department,
          bio: like.bio,
          age: like.age,
          profile_image: like.profile_image,
          interests: interests.map(i => i.interest)
        }
      })
    )

    res.json(likesWithInterests)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
