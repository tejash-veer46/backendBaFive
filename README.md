# baFive API

Backend for **baFive**, a Hinge-style dating app: rich profiles with photos and prompts, likes on a
specific photo or prompt (with an optional comment), a daily rose, matches, and chat.

Frontend: [tejash-veer46/baFiveApplication](https://github.com/tejash-veer46/baFiveApplication)

## Stack

- Node.js **22.13+** (uses the built-in `node:sqlite` — no native modules to compile)
- Express 4, JWT auth (`jsonwebtoken`), passwords hashed with `bcryptjs`
- SQLite database file at `data/bafive.db` (created automatically)

## Run locally

```bash
npm install
cp .env.example .env   # optional, defaults work for local dev
npm run dev            # http://localhost:5000
npm test               # API integration tests (in-memory DB)
```

### Environment

| Variable      | Default                                     | Notes                                               |
| ------------- | ------------------------------------------- | --------------------------------------------------- |
| `PORT`        | `5000`                                      |                                                     |
| `JWT_SECRET`  | dev-only value                              | **Required** when `NODE_ENV=production`             |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:4173` | Comma-separated list of allowed frontends, or `*` |
| `DB_PATH`     | `./data/bafive.db`                          | Use `:memory:` for throwaway runs                   |
| `DEMO_MODE`   | `true`                                      | Seeds 24 demo profiles (see below)                  |

### Demo mode

With `DEMO_MODE=true` the server seeds a demo community so a fresh install feels alive:
when you finish onboarding, a few compatible demo profiles like you (one with a rose), most demo
profiles like you back, and they send a friendly auto-reply when you message them. Demo accounts
cannot sign in. Set `DEMO_MODE=false` before a real launch.

## API

All endpoints except signup/login need `Authorization: Bearer <token>`. Errors are `{ "error": "message" }`.

| Method & path                          | Purpose                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/auth/signup`                | `{ name, email, password }` → `{ token, user }`                         |
| `POST /api/auth/login`                 | `{ email, password }` → `{ token, user }`                               |
| `GET /api/auth/me`                     | Current user                                                            |
| `PUT /api/auth/me`                     | Update profile: `birthdate, gender, interestedIn, photos[], prompts[], interests[], …` |
| `DELETE /api/auth/me`                  | Delete account and all its data                                         |
| `GET /api/discover?limit=10`           | Profiles that match both people's preferences, ranked by shared interests |
| `GET /api/profiles/:id`                | One profile                                                             |
| `POST /api/likes`                      | `{ userId, targetType: photo\|prompt, targetIndex, comment?, rose? }` → `{ matched, matchId? }` |
| `POST /api/passes` / `DELETE /api/passes/:userId` | Skip someone / undo a skip                                  |
| `GET /api/likes/received`              | People who liked you, with what they liked and their comment            |
| `GET /api/roses`                       | Roses left today                                                        |
| `GET /api/summary`                     | `{ likes, unread, roses }` for badges                                   |
| `GET /api/matches`                     | Matches with last message and unread count                              |
| `GET /api/matches/:id`                 | Match + other person's profile                                          |
| `DELETE /api/matches/:id`              | Unmatch (removes chat, hides both from each other)                      |
| `GET /api/matches/:id/messages?after=` | Messages (newer than `after`), marks them read                          |
| `POST /api/matches/:id/messages`       | `{ body }`                                                              |

Photos are HTTPS URLs or compressed `data:image/...` URLs (the frontend resizes uploads to ≤1080px).
