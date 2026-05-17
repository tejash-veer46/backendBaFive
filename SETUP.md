# baFive Backend Setup Guide

## ✅ Step 1: Backend Structure Created

The following backend structure has been created:

```
backend/
├── package.json
├── .env
├── src/
│   ├── server.js (Main Express server)
│   ├── middleware/
│   │   └── auth.js (JWT authentication)
│   ├── routes/
│   │   ├── auth.js (Login, signup, profile)
│   │   ├── profiles.js (Discovery, search)
│   │   ├── connections.js (Likes, matches)
│   │   └── messages.js (Messaging)
│   └── models/
│       └── db.js (SQLite database setup)
└── data/
    └── bafive.db (SQLite database - auto-created)
```

## 📦 Installation Instructions

### Prerequisites
- Node.js v16+ ([Download](https://nodejs.org/))
- npm (comes with Node.js)

### Installation Steps

1. **Navigate to backend directory:**
```bash
cd backend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start the development server:**
```bash
npm run dev
```

Server will start on `http://localhost:5000`

## 🗄️ Database

- **Type:** SQLite3
- **File:** `data/bafive.db` (auto-created on first run)
- **Tables:**
  - `users` - User accounts and profiles
  - `interests` - User interests/tags
  - `connections` - Likes and matches
  - `messages` - Direct messages between matched users

## 🔐 Environment Variables

The `.env` file contains:
- `PORT=5000` - Server port
- `JWT_SECRET` - Secret key for JWT tokens (change in production!)
- `DATABASE_PATH` - SQLite database location
- `CORS_ORIGIN` - Frontend URL (http://localhost:5173)

## 📡 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user (requires token)
- `PUT /api/auth/profile` - Update profile (requires token)

### Profiles
- `GET /api/profiles?page=1&limit=10` - Get discovery profiles
- `GET /api/profiles/:userId` - Get specific profile
- `GET /api/profiles/search/:query` - Search profiles

### Connections (Likes/Matches)
- `GET /api/connections` - Get matched connections
- `POST /api/connections/:userId/like` - Like a profile
- `POST /api/connections/:userId/unlike` - Unlike a profile
- `GET /api/connections/received` - Get received likes

### Messages
- `GET /api/messages` - Get conversations list
- `GET /api/messages/:conversationUserId` - Get chat history
- `POST /api/messages` - Send a message

## 🧪 Testing the Backend

### Health Check
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "baFive backend is running"
}
```

### Test with Postman or Thunder Client

#### 1. Sign Up
- **URL:** `http://localhost:5000/api/auth/signup`
- **Method:** POST
- **Body:**
```json
{
  "name": "John Doe",
  "email": "john@company.com",
  "password": "SecurePassword123",
  "department": "Engineering"
}
```

#### 2. Login
- **URL:** `http://localhost:5000/api/auth/login`
- **Method:** POST
- **Body:**
```json
{
  "email": "john@company.com",
  "password": "SecurePassword123"
}
```

Response will include `token` - save this for authenticated requests.

#### 3. Get Profile (Authenticated)
- **URL:** `http://localhost:5000/api/auth/profile`
- **Method:** GET
- **Headers:**
  - `Authorization: Bearer <your_token_here>`

## 🚀 Next Steps

1. ✅ Backend server setup complete
2. ⬜ Frontend integration - Test backend endpoints with frontend
3. ⬜ Database operations - Verify data is being stored correctly
4. ⬜ Error handling - Test edge cases and error scenarios
5. ⬜ Production deployment - Configure for production use

## 🔧 Development Tips

- Check backend logs for errors while running `npm run dev`
- Database is recreated on each server restart if it doesn't exist
- Use `node --watch` mode for auto-reload on file changes
- All API requests require JWT token in Authorization header (except signup/login)

## 📝 Notes

- All timestamps are in UTC
- Passwords are hashed with bcryptjs (10 salt rounds)
- JWT tokens expire in 7 days
- Foreign key constraints are enabled
- Change JWT_SECRET in production environment!
