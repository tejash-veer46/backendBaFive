import express from 'express'
import cors from 'cors'
import { HttpError } from './lib.js'
import authRoutes from './routes/auth.js'
import discoverRoutes from './routes/discover.js'
import matchRoutes from './routes/matches.js'

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((o) => o.trim())

export const app = express()

app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
}))
// Photos are sent as compressed data URLs, so allow reasonably large bodies.
app.use(express.json({ limit: '12mb' }))

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api/auth', authRoutes)
app.use('/api/matches', matchRoutes)
app.use('/api', discoverRoutes)

app.use((req, res) => res.status(404).json({ error: 'Route not found' }))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' })
  if (!(err instanceof HttpError)) console.error(err)
  res.status(err.status || 500).json({ error: err instanceof HttpError ? err.message : 'Something went wrong' })
})
