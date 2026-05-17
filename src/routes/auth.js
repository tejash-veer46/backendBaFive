import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getRow, runQuery, getAllRows } from '../models/db.js'
import { generateToken, authMiddleware } from '../middleware/auth.js'

const router = Router()

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, department } = req.body

    if (!name || !email || !password || !department) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    // Check if user already exists
    const existingUser = await getRow('SELECT id FROM users WHERE email = ?', [email])
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10)

    // Create user
    await runQuery(
      'INSERT INTO users (email, password_hash, name, department) VALUES (?, ?, ?, ?)',
      [email, password_hash, name, department]
    )

    // Get the created user
    const user = await getRow('SELECT * FROM users WHERE email = ?', [email])
    const token = generateToken(user.id)

    // Get user interests
    const interests = await getAllRows('SELECT interest FROM interests WHERE user_id = ?', [user.id])

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        bio: user.bio,
        age: user.age,
        profile_image: user.profile_image,
        interests: interests.map(i => i.interest)
      }
    })
  } catch (error) {
    console.error('Signup error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await getRow('SELECT * FROM users WHERE email = ?', [email])
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = generateToken(user.id)

    // Get user interests
    const interests = await getAllRows('SELECT interest FROM interests WHERE user_id = ?', [user.id])

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        bio: user.bio,
        age: user.age,
        profile_image: user.profile_image,
        interests: interests.map(i => i.interest)
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await getRow('SELECT * FROM users WHERE id = ?', [req.user.id])
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const interests = await getAllRows('SELECT interest FROM interests WHERE user_id = ?', [user.id])

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      bio: user.bio,
      age: user.age,
      profile_image: user.profile_image,
      interests: interests.map(i => i.interest)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, bio, age, profile_image, interests } = req.body

    // Update user
    await runQuery(
      'UPDATE users SET name = ?, bio = ?, age = ?, profile_image = ? WHERE id = ?',
      [name, bio, age, profile_image, req.user.id]
    )

    // Update interests if provided
    if (interests && Array.isArray(interests)) {
      await runQuery('DELETE FROM interests WHERE user_id = ?', [req.user.id])
      for (const interest of interests) {
        await runQuery(
          'INSERT INTO interests (user_id, interest) VALUES (?, ?)',
          [req.user.id, interest]
        )
      }
    }

    const user = await getRow('SELECT * FROM users WHERE id = ?', [req.user.id])
    const updatedInterests = await getAllRows('SELECT interest FROM interests WHERE user_id = ?', [req.user.id])

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      bio: user.bio,
      age: user.age,
      profile_image: user.profile_image,
      interests: updatedInterests.map(i => i.interest)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
