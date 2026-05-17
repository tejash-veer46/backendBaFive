import sqlite3 from 'sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '../../data/bafive.db')

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err)
  } else {
    console.log('✅ Connected to SQLite database')
  }
})

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON')

export const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          department TEXT,
          bio TEXT,
          age INTEGER,
          profile_image TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Interests table (junction table for user interests)
      db.run(`
        CREATE TABLE IF NOT EXISTS interests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          interest TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `)

      // Connections table (likes/matches)
      db.run(`
        CREATE TABLE IF NOT EXISTS connections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          connected_with_id INTEGER NOT NULL,
          liked BOOLEAN DEFAULT 1,
          liked_back BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (connected_with_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, connected_with_id)
        )
      `)

      // Messages table
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id INTEGER NOT NULL,
          recipient_id INTEGER NOT NULL,
          message TEXT NOT NULL,
          read BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          reject(err)
        } else {
          console.log('✅ All tables created/verified')
          resolve(db)
        }
      })
    })
  })
}

export const getDb = () => db

export const runQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export const getRow = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export const getAllRows = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}
