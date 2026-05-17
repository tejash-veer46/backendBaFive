# baFive Database Design & Schema

## ✅ Database Setup Complete

**Type:** SQLite3  
**Location:** `backend/data/bafive.db` (auto-created)  
**Initialization:** Automatic on server startup

---

## 📊 Database Schema

### 1. USERS Table
Stores user account information and profiles.

```sql
CREATE TABLE users (
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
);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Unique user ID |
| email | TEXT | Unique email address |
| password_hash | TEXT | Hashed password (bcryptjs) |
| name | TEXT | User's full name |
| department | TEXT | Department/Team |
| bio | TEXT | User biography |
| age | INTEGER | User age |
| profile_image | TEXT | URL to profile picture |
| created_at | DATETIME | Account creation timestamp |
| updated_at | DATETIME | Last update timestamp |

**Indexes:** `email` (UNIQUE)

---

### 2. INTERESTS Table
Junction table for user interests/tags (many-to-many relationship).

```sql
CREATE TABLE interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  interest TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Unique interest ID |
| user_id | INTEGER | Foreign key to users.id |
| interest | TEXT | Interest tag (e.g., "Photography", "Coffee") |

**Constraints:**
- Foreign key to `users.id` with CASCADE delete
- When a user is deleted, all their interests are deleted

---

### 3. CONNECTIONS Table
Tracks likes, matches, and connections between users.

```sql
CREATE TABLE connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  connected_with_id INTEGER NOT NULL,
  liked BOOLEAN DEFAULT 1,
  liked_back BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (connected_with_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, connected_with_id)
);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Unique connection ID |
| user_id | INTEGER | User who initiated the like |
| connected_with_id | INTEGER | User who was liked |
| liked | BOOLEAN | True if user_id liked connected_with_id |
| liked_back | BOOLEAN | True if mutual match (both liked each other) |
| created_at | DATETIME | When the like was created |

**Constraints:**
- Unique combination of (user_id, connected_with_id)
- Prevents duplicate likes between same users
- Cascade delete when users are deleted

**Logic:**
- When User A likes User B: `liked=1, liked_back=0`
- When User B also likes User A: `liked_back=1` (both directions)
- Users can only message if `liked_back=1`

---

### 4. MESSAGES Table
Stores direct messages between matched users.

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Unique message ID |
| sender_id | INTEGER | User sending the message |
| recipient_id | INTEGER | User receiving the message |
| message | TEXT | Message content |
| read | BOOLEAN | Whether recipient has read message |
| created_at | DATETIME | When message was sent |

**Constraints:**
- Foreign keys for sender and recipient with CASCADE delete
- Messages are deleted if either user is deleted

---

## 🔄 Entity Relationships

```
Users (1) ──────────────── (Many) Interests
  ├── user_id
  └── id
  
Users (1) ──────────────── (Many) Connections
  ├── id ──→ user_id
  └── id ──→ connected_with_id
  
Users (1) ──────────────── (Many) Messages
  ├── id ──→ sender_id
  └── id ──→ recipient_id
```

---

## 💾 Data Relationships

### User Flow

1. **Sign Up:**
   - New row in `users` table
   - Email must be unique

2. **Add Interests:**
   - Rows added to `interests` table with `user_id`
   - Multiple interests per user allowed

3. **Like a Profile:**
   - Row added to `connections`: `liked=1, liked_back=0`
   - If target user has already liked back: update `liked_back=1`

4. **Message:**
   - Both users must have `liked_back=1` in connections
   - Rows added to `messages` table
   - `read` field tracks if recipient viewed message

---

## 📈 Sample Queries

### Get User Profile with Interests
```sql
SELECT u.*, 
       GROUP_CONCAT(i.interest, ', ') as interests
FROM users u
LEFT JOIN interests i ON u.id = i.user_id
WHERE u.id = ?
GROUP BY u.id;
```

### Get Mutual Matches
```sql
SELECT u.* FROM users u
WHERE u.id IN (
  SELECT connected_with_id FROM connections
  WHERE user_id = ? AND liked_back = 1
);
```

### Get Unread Message Count
```sql
SELECT COUNT(*) as unread_count
FROM messages
WHERE recipient_id = ? AND read = 0;
```

### Get Recent Conversations
```sql
SELECT DISTINCT 
  CASE 
    WHEN sender_id = ? THEN recipient_id 
    ELSE sender_id 
  END as other_user_id
FROM messages
WHERE sender_id = ? OR recipient_id = ?
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🗝️ Key Features

✅ **Cascade Deletes:** Deleting a user removes all related data  
✅ **Unique Constraints:** Prevents duplicate likes  
✅ **Foreign Keys:** Referential integrity enforced  
✅ **Timestamps:** All events tracked with timestamps  
✅ **Message Tracking:** Tracks read/unread status  
✅ **Two-Way Matching:** Requires mutual likes to message  

---

## 📝 Notes

- SQLite is file-based, suitable for development
- For production, consider migrating to PostgreSQL
- All timestamps are UTC
- Deleted users cascade delete all their data
- Message system requires prior mutual match
