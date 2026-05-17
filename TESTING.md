# baFive - Testing & Integration Guide

## ✅ All Backend Components Ready

- ✅ Backend Server (Express)
- ✅ Database (SQLite)
- ✅ API Endpoints (14 endpoints)
- ✅ Authentication (JWT + Bcryptjs)
- ⏳ Frontend Integration (Next Step)

---

## 🚀 Quick Start

### Prerequisites
- Node.js v16+ installed
- Frontend running on http://localhost:5173
- Backend ready to start

### Start Backend Server

**Step 1: Navigate to backend directory**
```bash
cd backend
```

**Step 2: Install dependencies**
```bash
npm install
```

**Step 3: Start development server**
```bash
npm run dev
```

**Expected Output:**
```
✅ Database initialized
✅ Connected to SQLite database
✅ All tables created/verified

🚀 baFive Backend running on http://localhost:5000
📡 CORS enabled for: http://localhost:5173
🏥 Health check: http://localhost:5000/health
```

### Verify Backend is Running
```bash
curl http://localhost:5000/health
```

Response:
```json
{
  "status": "ok",
  "message": "baFive backend is running"
}
```

---

## 🧪 Testing Endpoints

### Option 1: Using Postman
1. Download [Postman](https://www.postman.com/downloads/)
2. Create new request for each endpoint
3. Add Authorization header with token

### Option 2: Using Thunder Client (VS Code)
1. Install [Thunder Client](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client)
2. Create requests in VS Code
3. Test endpoints directly

### Option 3: Using cURL
See examples below

---

## 📝 Complete Testing Workflow

### 1. Sign Up

**Request:**
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Johnson",
    "email": "alice@company.com",
    "password": "Password123!",
    "department": "Engineering"
  }'
```

**Response:**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "name": "Alice Johnson",
    "email": "alice@company.com",
    "department": "Engineering",
    "bio": null,
    "age": null,
    "profile_image": null,
    "interests": []
  }
}
```

**Save the token:** `TOKEN_ALICE=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...`

---

### 2. Create Another Test User

**Request:**
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob Smith",
    "email": "bob@company.com",
    "password": "Password456!",
    "department": "Product"
  }'
```

**Save the token:** `TOKEN_BOB=...`

---

### 3. Update Profile (Alice)

**Request:**
```bash
curl -X PUT http://localhost:5000/api/auth/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ALICE" \
  -d '{
    "name": "Alice Johnson",
    "bio": "Senior Engineer at XYZ Corp, love React and Node.js",
    "age": 28,
    "profile_image": "https://example.com/alice.jpg",
    "interests": ["React", "Photography", "Travel", "Coffee"]
  }'
```

**Response:**
```json
{
  "id": 1,
  "name": "Alice Johnson",
  "email": "alice@company.com",
  "department": "Engineering",
  "bio": "Senior Engineer at XYZ Corp, love React and Node.js",
  "age": 28,
  "profile_image": "https://example.com/alice.jpg",
  "interests": ["React", "Photography", "Travel", "Coffee"]
}
```

---

### 4. Update Profile (Bob)

**Request:**
```bash
curl -X PUT http://localhost:5000/api/auth/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_BOB" \
  -d '{
    "name": "Bob Smith",
    "bio": "Product Manager, passionate about user experience",
    "age": 26,
    "profile_image": "https://example.com/bob.jpg",
    "interests": ["UX", "Travel", "Food", "Hiking"]
  }'
```

---

### 5. Get Discovery Profiles (Alice's view)

**Request:**
```bash
curl -X GET "http://localhost:5000/api/profiles?page=1&limit=10" \
  -H "Authorization: Bearer TOKEN_ALICE"
```

**Response:**
```json
[
  {
    "id": 2,
    "name": "Bob Smith",
    "email": "bob@company.com",
    "department": "Product",
    "bio": "Product Manager, passionate about user experience",
    "age": 26,
    "profile_image": "https://example.com/bob.jpg",
    "interests": ["UX", "Travel", "Food", "Hiking"]
  }
]
```

---

### 6. Like a Profile (Alice likes Bob)

**Request:**
```bash
curl -X POST http://localhost:5000/api/connections/2/like \
  -H "Authorization: Bearer TOKEN_ALICE"
```

**Response:**
```json
{
  "message": "Profile liked",
  "mutualMatch": false
}
```

---

### 7. Get Received Likes (Bob's view)

**Request:**
```bash
curl -X GET http://localhost:5000/api/connections/received \
  -H "Authorization: Bearer TOKEN_BOB"
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Alice Johnson",
    "email": "alice@company.com",
    "department": "Engineering",
    "bio": "Senior Engineer at XYZ Corp, love React and Node.js",
    "age": 28,
    "profile_image": "https://example.com/alice.jpg",
    "interests": ["React", "Photography", "Travel", "Coffee"]
  }
]
```

---

### 8. Like Back (Bob likes Alice) - Creates Match!

**Request:**
```bash
curl -X POST http://localhost:5000/api/connections/1/like \
  -H "Authorization: Bearer TOKEN_BOB"
```

**Response:**
```json
{
  "message": "Profile liked",
  "mutualMatch": true
}
```

**Note:** `mutualMatch: true` means they're now a match!

---

### 9. Get Matches (Alice's connections)

**Request:**
```bash
curl -X GET http://localhost:5000/api/connections \
  -H "Authorization: Bearer TOKEN_ALICE"
```

**Response:**
```json
[
  {
    "id": 2,
    "name": "Bob Smith",
    "email": "bob@company.com",
    "department": "Product",
    "bio": "Product Manager, passionate about user experience",
    "age": 26,
    "profile_image": "https://example.com/bob.jpg",
    "interests": ["UX", "Travel", "Food", "Hiking"],
    "mutualLike": true
  }
]
```

---

### 10. Send Message (Alice to Bob)

**Request:**
```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ALICE" \
  -d '{
    "recipient_id": 2,
    "message": "Hi Bob! Great to match with you. How about coffee?"
  }'
```

**Response:**
```json
{
  "id": 1,
  "sender_id": 1,
  "recipient_id": 2,
  "message": "Hi Bob! Great to match with you. How about coffee?",
  "read": false,
  "created_at": "2024-05-16T15:30:00Z"
}
```

---

### 11. Get Conversations (Bob's inbox)

**Request:**
```bash
curl -X GET http://localhost:5000/api/messages \
  -H "Authorization: Bearer TOKEN_BOB"
```

**Response:**
```json
[
  {
    "userId": 1,
    "name": "Alice Johnson",
    "email": "alice@company.com",
    "profile_image": "https://example.com/alice.jpg",
    "lastMessage": "Hi Bob! Great to match with you. How about coffee?",
    "lastMessageTime": "2024-05-16T15:30:00Z"
  }
]
```

---

### 12. Get Chat History (Bob reads messages from Alice)

**Request:**
```bash
curl -X GET http://localhost:5000/api/messages/1 \
  -H "Authorization: Bearer TOKEN_BOB"
```

**Response:**
```json
[
  {
    "id": 1,
    "sender_id": 1,
    "recipient_id": 2,
    "message": "Hi Bob! Great to match with you. How about coffee?",
    "read": true,
    "created_at": "2024-05-16T15:30:00Z"
  }
]
```

---

### 13. Send Reply (Bob to Alice)

**Request:**
```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_BOB" \
  -d '{
    "recipient_id": 1,
    "message": "Absolutely! Let'\''s meet at the coffee shop near office on Friday?"
  }'
```

---

## 🔌 Frontend Integration

### Update API URL in Frontend

**File:** `src/services/api.ts`

Make sure the API URL points to your backend:

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
```

### Environment Variable (Frontend)

**File:** `.env` (in frontend root, not backend)

```env
VITE_API_URL=http://localhost:5000
```

### Test with Frontend UI

1. **Start Frontend:**
   ```bash
   npm run dev
   ```

2. **Open Browser:**
   ```
   http://localhost:5173
   ```

3. **Sign Up**
   - Fill in name, email, password, department
   - Click "Sign Up"

4. **Explore**
   - View profiles
   - Like/unlike profiles
   - View matches
   - Send messages

---

## ✅ Verification Checklist

- [x] Backend server starts successfully
- [x] Database creates all tables
- [x] Sign up creates user with hashed password
- [x] Login generates JWT token
- [x] Protected endpoints require token
- [x] Discovery profiles load
- [x] Like/unlike works
- [x] Mutual matches detected
- [x] Messages sent between matched users
- [x] Conversations list works
- [x] CORS enabled for frontend
- [ ] Frontend fully integrated

---

## 🐛 Debugging Tips

### Backend logs show errors?
1. Check `.env` file is configured correctly
2. Verify Node.js version (16+)
3. Check database file exists: `backend/data/bafive.db`
4. Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### Frontend can't reach backend?
1. Verify backend running: `curl http://localhost:5000/health`
2. Check CORS_ORIGIN in `.env` matches frontend URL
3. Check browser console for CORS errors
4. Verify `VITE_API_URL` in frontend `.env`

### Token not working?
1. Check token is in Authorization header: `Bearer <token>`
2. Check token not expired (7 days)
3. Check JWT_SECRET hasn't changed
4. Try logging in again to get fresh token

### Database errors?
1. Check `backend/data/` directory exists and is writable
2. Delete `backend/data/bafive.db` and restart server
3. Check sqlite3 is installed: `npm list sqlite3`

---

## 📊 What's Next?

1. ✅ Backend Setup Complete
2. ✅ API Endpoints Ready
3. ✅ Authentication System Working
4. ⏳ **Frontend Integration** (Currently Here)
5. ⏳ Deploy to Production

---

## 🎉 Summary

**Backend is 100% ready for frontend integration!**

All 14 API endpoints are implemented and tested:
- Authentication (signup/login)
- Profiles (discovery/search)
- Connections (matches/likes)
- Messages (chat)

The frontend (`src/services/api.ts`) already has all the API calls configured. 

**Next: Start the frontend and test the complete user flow!**
