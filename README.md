# baFive API

Backend for **baFive**, a Hinge-style dating app: rich profiles with photos and prompts, likes on a
specific photo or prompt (with an optional comment), a daily rose, matches, and chat.

Frontend: [tejash-veer46/baFiveApplication](https://github.com/tejash-veer46/baFiveApplication)

## Stack

- Node.js 22+, Express 5, JWT auth (`jsonwebtoken`), passwords hashed with `bcryptjs`
- SQLite via libSQL: a local file (`data/bafive.db`) in development, [Turso](https://turso.tech) in production

**Deploying:** see [DEPLOYMENT.md](DEPLOYMENT.md) (free: Render + Turso, configured by `render.yaml`).

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
| `DATABASE_URL` | —                                          | Turso URL (`libsql://…`). If unset, a local file is used |
| `DATABASE_AUTH_TOKEN` | —                                   | Turso token                                         |
| `DB_PATH`     | `./data/bafive.db`                          | Local database file when `DATABASE_URL` is unset    |
| `DEMO_MODE`   | `true`                                      | Seeds 24 demo profiles (see below)                  |
| `EMAIL_VERIFICATION` | off                                     | `true` turns on emailed codes (signup verification, password reset). Off: signup signs in directly and the code endpoints answer 503 |
| `BREVO_API_KEY` | —                                         | Brevo API key for emailing codes. If unset, codes are printed to the console |
| `MAIL_FROM`   | —                                           | Sender verified in Brevo, e.g. `baFive <you@gmail.com>` |

### Demo mode

With `DEMO_MODE=true` the server seeds a demo community so a fresh install feels alive:
when you finish onboarding, a few compatible demo profiles like you (one with a rose), most demo
profiles like you back, and they send a friendly auto-reply when you message them. Demo accounts
cannot sign in. Set `DEMO_MODE=false` before a real launch.

## API

All endpoints except the account ones (signup, login, codes, password reset) need `Authorization: Bearer <token>`. Errors are `{ "error": "message" }`.

| Method & path                          | Purpose                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/auth/signup`                | `{ name, email, password }` → `201 { needsVerification, email, codeSent }`; emails a 6-digit code |
| `POST /api/auth/verify-email`          | `{ email, code }` → `{ token, user }`                                   |
| `POST /api/auth/resend-code`           | `{ email }` → `{ ok }`, or `429 { retryAfter }` (60 s cooldown, 10 codes a day) |
| `POST /api/auth/login`                 | `{ email, password }` → `{ token, user }`; unverified accounts get `403 { needsVerification, email }` and a fresh code |
| `POST /api/auth/forgot-password`       | `{ email }` → always `{ ok: true }`; emails a reset code if the account exists |
| `POST /api/auth/reset-password`        | `{ email, code, newPassword }` → `{ token, user }`                      |
| `GET /api/auth/me`                     | Current user                                                            |
| `PUT /api/auth/me`                     | Update profile: `birthdate, gender, interestedIn, photos[], prompts[], interests[], socials{github,linkedin,instagram}, …` (socials are shown only to matches) |
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

Codes expire after 10 minutes and allow 5 tries. They are stored as a SHA-256 hash peppered with
`JWT_SECRET`, one per email and purpose. Accounts created before verification existed count as verified.

Photos are HTTPS URLs or compressed `data:image/...` URLs (the frontend resizes uploads to ≤1080px).
