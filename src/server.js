import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initializeDatabase } from './models/db.js'
import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profiles.js'
import connectionRoutes from './routes/connections.js'
import messageRoutes from './routes/messages.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Initialize database
try {
  initializeDatabase()
  console.log('✅ Database initialized')
} catch (error) {
  console.error('❌ Database initialization failed:', error)
  process.exit(1)
}

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/profiles', profileRoutes)
app.use('/api/connections', connectionRoutes)
app.use('/api/messages', messageRoutes)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'baFive backend is running' })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 baFive Backend running on http://localhost:${PORT}`)
  console.log(`📡 CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`)
  console.log(`🏥 Health check: http://localhost:${PORT}/health\n`)
})

export default app
