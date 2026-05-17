import { Router } from 'express'
import { getRow, getAllRows } from '../models/db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// Get discovery profiles (paginated)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit

    // Get profiles excluding the current user and already liked profiles
    const profiles = await getAllRows(`
      SELECT u.* FROM users u
      WHERE u.id != ?
      AND u.id NOT IN (
        SELECT connected_with_id FROM connections WHERE user_id = ?
      )
      LIMIT ? OFFSET ?
    `, [req.user.id, req.user.id, limit, offset])

    // Get interests for each profile
    const profilesWithInterests = await Promise.all(
      profiles.map(async (profile) => {
        const interests = await getAllRows(
          'SELECT interest FROM interests WHERE user_id = ?',
          [profile.id]
        )
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          department: profile.department,
          bio: profile.bio,
          age: profile.age,
          profile_image: profile.profile_image,
          interests: interests.map(i => i.interest)
        }
      })
    )

    res.json(profilesWithInterests)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get specific profile
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const profile = await getRow('SELECT * FROM users WHERE id = ?', [req.params.userId])
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    const interests = await getAllRows(
      'SELECT interest FROM interests WHERE user_id = ?',
      [profile.id]
    )

    res.json({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      department: profile.department,
      bio: profile.bio,
      age: profile.age,
      profile_image: profile.profile_image,
      interests: interests.map(i => i.interest)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Search profiles
router.get('/search/:query', authMiddleware, async (req, res) => {
  try {
    const searchTerm = `%${req.params.query}%`
    const profiles = await getAllRows(`
      SELECT u.* FROM users u
      WHERE (u.name LIKE ? OR u.department LIKE ?)
      AND u.id != ?
      LIMIT 20
    `, [searchTerm, searchTerm, req.user.id])

    const profilesWithInterests = await Promise.all(
      profiles.map(async (profile) => {
        const interests = await getAllRows(
          'SELECT interest FROM interests WHERE user_id = ?',
          [profile.id]
        )
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          department: profile.department,
          bio: profile.bio,
          age: profile.age,
          profile_image: profile.profile_image,
          interests: interests.map(i => i.interest)
        }
      })
    )

    res.json(profilesWithInterests)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
