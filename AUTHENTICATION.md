# baFive Authentication System

## ✅ Authentication Implemented

The authentication system uses **JWT tokens** and **bcryptjs** for secure user authentication and password hashing.

---

## 🔐 Authentication Architecture

### Components

1. **JWT (JSON Web Tokens)**
   - Token-based authentication
   - Stateless (no server sessions)
   - Expires in 7 days
   - Signed with `JWT_SECRET`

2. **Bcryptjs**
   - Password hashing algorithm
   - 10 salt rounds for security
   - Irreversible hashing

3. **Auth Middleware**
   - Verifies JWT tokens on protected routes
   - Extracts user ID from token
   - Returns 401 if token is invalid/expired

---

## 🔄 Authentication Flow

### Sign Up Flow
```
User inputs name, email, password, department
         ↓
Validate fields (all required)
         ↓
Check if email already exists
         ↓
Hash password with bcryptjs (10 rounds)
         ↓
Create user in database
         ↓
Generate JWT token
         ↓
Return token + user data
```

### Login Flow
```
User inputs email + password
         ↓
Find user by email
         ↓
Compare password with stored hash
         ↓
If match: Generate JWT token
         ↓
Return token + user data
         ↓
If no match: Return 401 error
```

### Protected Route Flow
```
Client sends request with "Authorization: Bearer <token>"
         ↓
Auth middleware extracts token
         ↓
Decode token with JWT_SECRET
         ↓
If valid: Extract user ID
         ↓
Attach user to request object
         ↓
Allow route handler to execute
         ↓
If invalid/expired: Return 401 error
```

---

## 🗝️ JWT Token Structure

**Header:**
```json
{
  "typ": "JWT",
  "alg": "HS256"
}
```

**Payload:**
```json
{
  "id": 1,
  "iat": 1715869200,
  "exp": 1716474000
}
```

**Fields:**
- `id` - User ID
- `iat` - Issued at (Unix timestamp)
- `exp` - Expires at (Unix timestamp) = iat + 7 days

**Example Token:**
```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.
eyJpZCI6MSwiaWF0IjoxNzE1ODY5MjAwLCJleHAiOjE3MTY0NzQwMDB9.
abcdef123456789xyz...
```

---

## 🛡️ Security Features

### Password Security
✅ Passwords never stored in plain text  
✅ Bcryptjs with 10 salt rounds  
✅ Unique email constraint prevents duplicates  
✅ Passwords cannot be recovered (only reset)

### Token Security
✅ Signed with `JWT_SECRET`  
✅ Expires in 7 days (force re-login)  
✅ Verified on every protected request  
✅ Stateless (no database lookups for auth)

### Best Practices
✅ HTTPS in production (required for JWT)  
✅ Secure cookies for token storage (client-side)  
✅ CORS configured to allow only frontend origin  
✅ No sensitive data in token payload

---

## 🔧 Implementation Details

### Password Hashing

```javascript
// During signup
const password_hash = await bcrypt.hash(password, 10)
// Stores: $2a$10$... (52 character hash)

// During login
const passwordMatch = await bcrypt.compare(password, user.password_hash)
// Returns: true or false
```

**Why 10 rounds?**
- 10 rounds = ~10ms hashing time
- Secure against brute force
- Balanced for performance

### Token Generation

```javascript
export const generateToken = (userId) => {
  const payload = {
    id: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  }
  return jwt.encode(payload, JWT_SECRET)
}
```

### Token Verification

```javascript
export const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const decoded = jwt.decode(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

---

## 📋 Protected Routes

All routes requiring authentication must include:

```
Authorization: Bearer <jwt_token>
```

**Protected Endpoints:**
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `GET /api/profiles`
- `GET /api/profiles/:userId`
- `GET /api/profiles/search/:query`
- `GET /api/connections`
- `POST /api/connections/:userId/like`
- `POST /api/connections/:userId/unlike`
- `GET /api/connections/received`
- `GET /api/messages`
- `GET /api/messages/:conversationUserId`
- `POST /api/messages`

**Public Endpoints:**
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /health`

---

## 🧪 Testing Authentication

### 1. Sign Up (Generate Token)
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@company.com",
    "password": "SecurePassword123",
    "department": "Engineering"
  }'
```

Response:
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": { ... }
}
```

### 2. Use Token to Access Protected Route
```bash
curl -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
```

### 3. Try Without Token (Should Fail)
```bash
curl -X GET http://localhost:5000/api/auth/profile
```

Response:
```json
{
  "error": "No token provided"
}
```

### 4. Try With Invalid Token (Should Fail)
```bash
curl -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer invalid_token_xyz"
```

Response:
```json
{
  "error": "Invalid or expired token"
}
```

---

## 🌍 Frontend Integration

### Store Token (After Login/Signup)
```javascript
// Save token to localStorage
localStorage.setItem('auth_token', response.token)
```

### Use Token in Requests
```javascript
const token = localStorage.getItem('auth_token')
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}

fetch('/api/auth/profile', { headers })
```

### Handle Token Expiration
```javascript
// If get 401 response:
// 1. Clear token
localStorage.removeItem('auth_token')

// 2. Redirect to login
window.location.href = '/login'

// 3. Show error message
alert('Session expired. Please login again.')
```

---

## ⚙️ Configuration

### Environment Variables

**File:** `.env`

```env
PORT=5000
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_12345
DATABASE_PATH=./data/bafive.db
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

### Change JWT Secret (Production)

⚠️ **IMPORTANT:** Change `JWT_SECRET` in production!

```bash
# Generate a secure random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0...

# Add to .env
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0...
```

---

## 🐛 Common Issues & Solutions

### Issue: "Invalid token" after server restart
**Cause:** Different JWT_SECRET in .env  
**Solution:** Keep JWT_SECRET consistent, or clear client cache

### Issue: Token works but says "User not found"
**Cause:** Token is valid but user was deleted from database  
**Solution:** Clear token and re-login

### Issue: User can't login
**Cause:** Wrong email/password or user doesn't exist  
**Solution:** Verify email and password, or create new account

### Issue: Password hash format looks wrong
**Cause:** Bcrypt hash should be ~60 characters starting with `$2a$`  
**Solution:** Check bcryptjs is installed correctly

---

## 📊 Token Lifecycle

```
User Signs Up
    ↓
Token Generated (expires in 7 days)
    ↓
Client Stores Token (localStorage)
    ↓
Every API Request Includes Token
    ↓
Server Validates Token on Each Request
    ↓
Day 7: Token Expires
    ↓
User Gets 401 "Token Expired"
    ↓
User Must Login Again to Get New Token
```

---

## ✅ Checklist

- [x] JWT token generation working
- [x] JWT token verification working
- [x] Bcryptjs password hashing working
- [x] Auth middleware protecting routes
- [x] Signup creates hashed password
- [x] Login validates password
- [x] Tokens include user ID
- [x] Tokens expire in 7 days
- [x] Protected routes require token

---

## 📝 Notes

- Never log tokens or passwords
- Always use HTTPS in production
- Rotate JWT_SECRET periodically
- Consider adding refresh tokens for better UX
- Add rate limiting to login endpoint (brute force protection)
