# baFive API Documentation

## ✅ API Endpoints Implemented

All endpoints have been implemented in the backend. This document provides complete API reference.

---

## 🔑 Authentication

All endpoints (except signup/login) require a JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Tokens expire in 7 days.

---

## 📡 API Endpoints

### Authentication Endpoints

#### 1. Sign Up
Create a new user account.

**Endpoint:** `POST /api/auth/signup`

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@company.com",
  "password": "SecurePassword123",
  "department": "Engineering"
}
```

**Response (201):**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@company.com",
    "department": "Engineering",
    "bio": null,
    "age": null,
    "profile_image": null,
    "interests": []
  }
}
```

**Errors:**
- 400: Missing required fields
- 400: Email already registered

---

#### 2. Login
Authenticate user and receive JWT token.

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "john@company.com",
  "password": "SecurePassword123"
}
```

**Response (200):**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@company.com",
    "department": "Engineering",
    "bio": "Software Engineer passionate about AI",
    "age": 28,
    "profile_image": "https://...",
    "interests": ["AI", "Photography", "Coffee"]
  }
}
```

**Errors:**
- 400: Missing email or password
- 401: Invalid email or password

---

#### 3. Get Current User Profile
Retrieve logged-in user's profile.

**Endpoint:** `GET /api/auth/profile`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@company.com",
  "department": "Engineering",
  "bio": "Software Engineer passionate about AI",
  "age": 28,
  "profile_image": "https://...",
  "interests": ["AI", "Photography", "Coffee"]
}
```

**Errors:**
- 401: Invalid token
- 404: User not found

---

#### 4. Update User Profile
Update user's profile information.

**Endpoint:** `PUT /api/auth/profile`

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request:**
```json
{
  "name": "John Doe",
  "bio": "Senior Engineer, love building products",
  "age": 29,
  "profile_image": "https://example.com/photo.jpg",
  "interests": ["AI", "Hiking", "Music", "Coffee"]
}
```

**Response (200):**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@company.com",
  "department": "Engineering",
  "bio": "Senior Engineer, love building products",
  "age": 29,
  "profile_image": "https://example.com/photo.jpg",
  "interests": ["AI", "Hiking", "Music", "Coffee"]
}
```

---

### Profile Discovery Endpoints

#### 5. Get Discovery Profiles (Paginated)
Get profiles for discovery/swiping.

**Endpoint:** `GET /api/profiles?page=1&limit=10`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)

**Response (200):**
```json
[
  {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@company.com",
    "department": "Product",
    "bio": "PM at heart, love user research",
    "age": 26,
    "profile_image": "https://...",
    "interests": ["UX", "Travel", "Reading"]
  },
  {
    "id": 3,
    "name": "Bob Johnson",
    "email": "bob@company.com",
    "department": "Design",
    "bio": "Designer working on cool products",
    "age": 30,
    "profile_image": "https://...",
    "interests": ["Design", "Art", "Gaming"]
  }
]
```

**Features:**
- Excludes current user
- Excludes already-liked profiles
- Paginated results

---

#### 6. Get Specific Profile
Get detailed profile of a specific user.

**Endpoint:** `GET /api/profiles/:userId`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `userId`: ID of the profile to view

**Response (200):**
```json
{
  "id": 2,
  "name": "Jane Smith",
  "email": "jane@company.com",
  "department": "Product",
  "bio": "PM at heart, love user research",
  "age": 26,
  "profile_image": "https://...",
  "interests": ["UX", "Travel", "Reading"]
}
```

**Errors:**
- 404: Profile not found

---

#### 7. Search Profiles
Search for profiles by name or department.

**Endpoint:** `GET /api/profiles/search/:query`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `query`: Search term (name or department)

**Response (200):**
```json
[
  {
    "id": 4,
    "name": "Sarah Johnson",
    "email": "sarah@company.com",
    "department": "Engineering",
    "bio": "Full-stack developer",
    "age": 27,
    "profile_image": "https://...",
    "interests": ["Coding", "Gaming"]
  }
]
```

---

### Connection (Likes/Matches) Endpoints

#### 8. Get All Matches
Get list of mutual matches (users you liked and who liked you back).

**Endpoint:** `GET /api/connections`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
[
  {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@company.com",
    "department": "Product",
    "bio": "PM at heart",
    "age": 26,
    "profile_image": "https://...",
    "interests": ["UX", "Travel"],
    "mutualLike": true
  }
]
```

---

#### 9. Like a Profile
Like/express interest in a profile.

**Endpoint:** `POST /api/connections/:userId/like`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `userId`: ID of user to like

**Response (200):**
```json
{
  "message": "Profile liked",
  "mutualMatch": false
}
```

**Special Response (mutual match):**
```json
{
  "message": "Profile liked",
  "mutualMatch": true
}
```

**Errors:**
- 400: Cannot like yourself
- 404: User not found

---

#### 10. Unlike a Profile
Remove a like/match.

**Endpoint:** `POST /api/connections/:userId/unlike`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `userId`: ID of user to unlike

**Response (200):**
```json
{
  "message": "Profile unliked"
}
```

---

#### 11. Get Received Likes
Get profiles that have liked you (but you haven't liked back yet).

**Endpoint:** `GET /api/connections/received`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
[
  {
    "id": 5,
    "name": "Mike Davis",
    "email": "mike@company.com",
    "department": "Sales",
    "bio": "Sales director",
    "age": 32,
    "profile_image": "https://...",
    "interests": ["Business", "Sports"]
  }
]
```

---

### Messaging Endpoints

#### 12. Get All Conversations
Get list of all active conversations.

**Endpoint:** `GET /api/messages`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
[
  {
    "userId": 2,
    "name": "Jane Smith",
    "email": "jane@company.com",
    "profile_image": "https://...",
    "lastMessage": "See you at the meetup!",
    "lastMessageTime": "2024-05-16T14:30:00Z"
  },
  {
    "userId": 3,
    "name": "Bob Johnson",
    "email": "bob@company.com",
    "profile_image": "https://...",
    "lastMessage": "Let's grab coffee",
    "lastMessageTime": "2024-05-16T10:15:00Z"
  }
]
```

---

#### 13. Get Chat History
Get all messages with a specific user.

**Endpoint:** `GET /api/messages/:conversationUserId`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**URL Parameters:**
- `conversationUserId`: ID of the conversation partner

**Response (200):**
```json
[
  {
    "id": 1,
    "sender_id": 1,
    "recipient_id": 2,
    "message": "Hi Jane! How are you?",
    "read": true,
    "created_at": "2024-05-16T10:00:00Z"
  },
  {
    "id": 2,
    "sender_id": 2,
    "recipient_id": 1,
    "message": "I'm doing great! You?",
    "read": true,
    "created_at": "2024-05-16T10:05:00Z"
  }
]
```

**Side Effects:**
- Automatically marks all received messages as read

---

#### 14. Send Message
Send a message to a matched user.

**Endpoint:** `POST /api/messages`

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request:**
```json
{
  "recipient_id": 2,
  "message": "Hey! Would love to grab coffee sometime?"
}
```

**Response (201):**
```json
{
  "id": 3,
  "sender_id": 1,
  "recipient_id": 2,
  "message": "Hey! Would love to grab coffee sometime?",
  "read": false,
  "created_at": "2024-05-16T14:30:00Z"
}
```

**Errors:**
- 400: Missing recipient_id or message
- 404: Recipient not found
- 403: Can only message matched users

---

## ✅ Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Server Error |

---

## 🧪 Testing Workflow

1. **Sign Up**
   ```bash
   POST /api/auth/signup
   ```

2. **Login** (get token)
   ```bash
   POST /api/auth/login
   ```

3. **View Discovery Profiles**
   ```bash
   GET /api/profiles?page=1&limit=10
   ```

4. **Like a Profile**
   ```bash
   POST /api/connections/:userId/like
   ```

5. **Send a Message** (after mutual match)
   ```bash
   POST /api/messages
   ```

---

## 📝 Notes

- All timestamps are in ISO 8601 format (UTC)
- Tokens must be included for all authenticated endpoints
- Search is case-insensitive and uses SQL LIKE queries
- Messages require prior mutual match
- All sensitive data is hashed/encrypted before storage
