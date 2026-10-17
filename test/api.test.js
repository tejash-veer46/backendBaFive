import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// A throwaway file DB (libSQL transactions on ':memory:' would open a separate empty database).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bafive-test-'))
process.env.DB_PATH = path.join(tmpDir, 'test.db')
process.env.DEMO_MODE = 'false'
process.env.NODE_ENV = 'test'
process.env.EMAIL_VERIFICATION = 'true'
const { app } = await import('../src/app.js')
const { ready, one, run } = await import('../src/db.js')
const { outbox } = await import('../src/mail.js')
await ready

let server
let base

before(async () => {
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://localhost:${server.address().port}`
})
after(() => server.close())

const api = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  })
  const data = res.status === 204 ? null : await res.json()
  return { status: res.status, data }
}

const lastCode = (email, purpose = 'verify') => outbox.findLast((m) => m.to === email && m.purpose === purpose)?.code
const sentTo = (email, purpose = 'verify') => outbox.filter((m) => m.to === email && m.purpose === purpose).length
const post = (path, body) => api(path, { method: 'POST', body })
const wrongCode = (code) => (code === '000000' ? '111111' : '000000')
// Pretend the resend cooldown has passed.
const skipCooldown = (email) => run('UPDATE email_codes SET created_at = 0 WHERE email = ?', email)

/** Signs up and verifies the email, returning the verify-email response ({ token, user }). */
const signupVerified = async (name, email, password = 'secret123') => {
  const signup = await post('/api/auth/signup', { name, email, password })
  assert.equal(signup.status, 201)
  const verified = await post('/api/auth/verify-email', { email, code: lastCode(email) })
  assert.equal(verified.status, 200)
  return verified.data
}

const PHOTO = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330'

const makeUser = async (name, gender, interestedIn) => {
  const data = await signupVerified(name, `${name.toLowerCase()}@example.com`)
  const profile = await api('/api/auth/me', {
    method: 'PUT',
    token: data.token,
    body: {
      birthdate: '1996-04-12', gender, interestedIn, photos: [PHOTO],
      prompts: [{ question: 'I geek out on', answer: 'Maps' }], interests: ['Coffee', 'Hiking'],
    },
  })
  assert.equal(profile.status, 200)
  assert.equal(profile.data.onboarded, true)
  return { token: data.token, id: data.user.id }
}

test('signup validates input and rejects duplicates', async () => {
  assert.equal((await api('/api/auth/signup', { method: 'POST', body: { name: 'A', email: 'bad', password: 'secret1' } })).status, 400)
  assert.equal((await api('/api/auth/signup', { method: 'POST', body: { name: 'A', email: 'a@x.com', password: '123' } })).status, 400)
  assert.equal((await api('/api/auth/signup', { method: 'POST', body: { name: 'A', email: 'dupe@x.com', password: 'secret1' } })).status, 201)
  assert.equal((await api('/api/auth/signup', { method: 'POST', body: { name: 'A', email: 'DUPE@x.com', password: 'secret1' } })).status, 409)
})

test('login and auth guard', async () => {
  await post('/api/auth/verify-email', { email: 'dupe@x.com', code: lastCode('dupe@x.com') })
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'dupe@x.com', password: 'nope' } })).status, 401)
  const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'dupe@x.com', password: 'secret1' } })
  assert.equal(ok.status, 200)
  assert.ok(ok.data.token)
  assert.equal((await api('/api/auth/me')).status, 401)
  assert.equal((await api('/api/auth/me', { token: 'garbage' })).status, 401)
})

test('under-18 birthdays are rejected', async () => {
  const data = await signupVerified('Kid', 'kid@x.com')
  const year = new Date().getFullYear() - 16
  const res = await api('/api/auth/me', { method: 'PUT', token: data.token, body: { birthdate: `${year}-01-01` } })
  assert.equal(res.status, 400)
})

test('discover respects preferences; like with comment -> match -> chat', async () => {
  const ana = await makeUser('Ana', 'woman', 'men')
  const ben = await makeUser('Ben', 'man', 'women')
  const cal = await makeUser('Cal', 'man', 'men')

  const anaFeed = (await api('/api/discover', { token: ana.token })).data.map((p) => p.id)
  assert.ok(anaFeed.includes(ben.id))
  assert.ok(!anaFeed.includes(cal.id), 'Cal is only interested in men')
  assert.ok(!anaFeed.includes(ana.id))

  const first = await api('/api/likes', {
    method: 'POST', token: ana.token,
    body: { userId: ben.id, targetType: 'prompt', targetIndex: 0, comment: 'Maps are the best', rose: true },
  })
  assert.deepEqual(first.data, { matched: false })
  assert.equal((await api('/api/roses', { token: ana.token })).data.remaining, 0)

  const received = (await api('/api/likes/received', { token: ben.token })).data
  assert.equal(received.length, 1)
  assert.equal(received[0].isRose, true)
  assert.equal(received[0].target.prompt.answer, 'Maps')
  assert.equal((await api('/api/summary', { token: ben.token })).data.likes, 1)

  const back = await api('/api/likes', { method: 'POST', token: ben.token, body: { userId: ana.id } })
  assert.equal(back.data.matched, true)
  const { matchId } = back.data

  const matches = (await api('/api/matches', { token: ana.token })).data
  assert.equal(matches.length, 1)
  assert.equal(matches[0].lastMessage.body, 'Maps are the best')

  const sent = await api(`/api/matches/${matchId}/messages`, { method: 'POST', token: ben.token, body: { body: 'Hey Ana!' } })
  assert.equal(sent.status, 201)
  assert.equal((await api('/api/summary', { token: ana.token })).data.unread, 1)
  const thread = (await api(`/api/matches/${matchId}/messages`, { token: ana.token })).data
  assert.deepEqual(thread.map((m) => m.body), ['Maps are the best', 'Hey Ana!'])
  assert.equal((await api('/api/summary', { token: ana.token })).data.unread, 0)
  const newer = (await api(`/api/matches/${matchId}/messages?after=${thread[0].id}`, { token: ana.token })).data
  assert.equal(newer.length, 1)

  // Outsiders cannot read the thread
  assert.equal((await api(`/api/matches/${matchId}/messages`, { token: cal.token })).status, 404)

  // Unmatch removes the conversation and hides each other from discovery
  assert.equal((await api(`/api/matches/${matchId}`, { method: 'DELETE', token: ana.token })).status, 204)
  assert.equal((await api('/api/matches', { token: ben.token })).data.length, 0)
  assert.ok(!(await api('/api/discover', { token: ben.token })).data.some((p) => p.id === ana.id))
})

test('passing hides a profile and its like', async () => {
  const dia = await makeUser('Dia', 'woman', 'everyone')
  const eli = await makeUser('Eli', 'man', 'everyone')
  await api('/api/likes', { method: 'POST', token: eli.token, body: { userId: dia.id } })
  assert.equal((await api('/api/likes/received', { token: dia.token })).data.length, 1)
  await api('/api/passes', { method: 'POST', token: dia.token, body: { userId: eli.id } })
  assert.equal((await api('/api/likes/received', { token: dia.token })).data.length, 0)
  assert.ok(!(await api('/api/discover', { token: dia.token })).data.some((p) => p.id === eli.id))
})

test('deleting an account removes its likes, matches and messages', async () => {
  const fay = await makeUser('Fay', 'woman', 'men')
  const gus = await makeUser('Gus', 'man', 'women')
  await api('/api/likes', { method: 'POST', token: fay.token, body: { userId: gus.id, comment: 'hi!' } })
  const { data } = await api('/api/likes', { method: 'POST', token: gus.token, body: { userId: fay.id } })
  assert.equal(data.matched, true)
  assert.equal((await api('/api/summary', { token: gus.token })).data.unread, 1)

  assert.equal((await api('/api/auth/me', { method: 'DELETE', token: fay.token })).status, 204)
  assert.equal((await api('/api/auth/me', { token: fay.token })).status, 401)
  assert.equal((await api('/api/matches', { token: gus.token })).data.length, 0)
  assert.deepEqual((await api('/api/summary', { token: gus.token })).data, { likes: 0, unread: 0, roses: 1 })
})

test('signup emails a code; verifying it signs the user in', async () => {
  const email = 'vera@x.com'
  const signup = await post('/api/auth/signup', { name: 'Vera', email, password: 'secret1' })
  assert.equal(signup.status, 201)
  assert.equal(signup.data.token, undefined, 'no token before the email is verified')
  assert.equal(signup.data.needsVerification, true)
  assert.equal(signup.data.codeSent, true)
  const code = lastCode(email)
  assert.match(code, /^\d{6}$/)

  // Stored hashed, never in plain text
  const row = await one("SELECT * FROM email_codes WHERE email = ? AND purpose = 'verify'", email)
  assert.match(row.code_hash, /^[0-9a-f]{64}$/)
  assert.ok(!Object.values(row).map(String).includes(code))

  // Unverified login is refused with a flag the app can act on
  const login = await post('/api/auth/login', { email, password: 'secret1' })
  assert.equal(login.status, 403)
  assert.equal(login.data.needsVerification, true)
  assert.equal(login.data.email, email)
  assert.equal(sentTo(email), 1, 'no new code inside the cooldown')

  const bad = await post('/api/auth/verify-email', { email, code: wrongCode(code) })
  assert.equal(bad.status, 400)
  assert.match(bad.data.error, /4 tries left/)
  assert.equal((await post('/api/auth/verify-email', { email, code: '12' })).status, 400)

  const ok = await post('/api/auth/verify-email', { email, code })
  assert.equal(ok.status, 200)
  assert.ok(ok.data.token)
  assert.equal(ok.data.user.email, email)
  assert.equal((await api('/api/auth/me', { token: ok.data.token })).status, 200)

  // The code is single-use, and login now works
  assert.equal((await post('/api/auth/verify-email', { email, code })).status, 400)
  assert.equal((await post('/api/auth/login', { email, password: 'secret1' })).status, 200)
})

test('unverified login resends a code once the cooldown has passed', async () => {
  const email = 'lou@x.com'
  await post('/api/auth/signup', { name: 'Lou', email, password: 'secret1' })
  const first = lastCode(email)
  await skipCooldown(email)
  const login = await post('/api/auth/login', { email, password: 'secret1' })
  assert.equal(login.status, 403)
  assert.equal(login.data.codeSent, true)
  assert.equal(sentTo(email), 2)
  const second = lastCode(email)
  if (first !== second) assert.equal((await post('/api/auth/verify-email', { email, code: first })).status, 400, 'old code replaced')
  assert.equal((await post('/api/auth/verify-email', { email, code: second })).status, 200)
})

test('resend-code has a cooldown and a daily cap', async () => {
  const email = 'rex@x.com'
  await post('/api/auth/signup', { name: 'Rex', email, password: 'secret1' })

  const tooSoon = await post('/api/auth/resend-code', { email })
  assert.equal(tooSoon.status, 429)
  assert.ok(tooSoon.data.retryAfter > 0 && tooSoon.data.retryAfter <= 60)
  assert.equal(sentTo(email), 1)

  await skipCooldown(email)
  assert.equal((await post('/api/auth/resend-code', { email })).status, 200)
  assert.equal(sentTo(email), 2)

  await run('UPDATE email_codes SET created_at = 0, send_count = 10 WHERE email = ?', email)
  const capped = await post('/api/auth/resend-code', { email })
  assert.equal(capped.status, 429)
  assert.ok(capped.data.retryAfter > 60)
  assert.equal(sentTo(email), 2)

  // A new UTC day resets the cap
  await run("UPDATE email_codes SET send_day = '2000-01-01' WHERE email = ?", email)
  assert.equal((await post('/api/auth/resend-code', { email })).status, 200)
  assert.equal(sentTo(email), 3)

  // Nothing is sent for unknown or already verified accounts
  assert.equal((await post('/api/auth/resend-code', { email: 'nobody@x.com' })).status, 200)
  assert.equal(sentTo('nobody@x.com'), 0)
  assert.equal((await post('/api/auth/resend-code', { email: 'vera@x.com' })).status, 200)
  assert.equal(sentTo('vera@x.com'), 1)
})

test('codes expire and lock after 5 wrong tries', async () => {
  const email = 'eve@x.com'
  await post('/api/auth/signup', { name: 'Eve', email, password: 'secret1' })
  const code = lastCode(email)

  await run('UPDATE email_codes SET expires_at = 0 WHERE email = ?', email)
  const expired = await post('/api/auth/verify-email', { email, code })
  assert.equal(expired.status, 400)
  assert.match(expired.data.error, /expired/)

  await skipCooldown(email)
  assert.equal((await post('/api/auth/resend-code', { email })).status, 200)
  const fresh = lastCode(email)
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/verify-email', { email, code: wrongCode(fresh) })).status, 400)
  const locked = await post('/api/auth/verify-email', { email, code: fresh })
  assert.equal(locked.status, 429, 'even the right code is refused after 5 wrong tries')
})

test('accounts created before verification existed count as verified', async () => {
  const bcrypt = (await import('bcryptjs')).default
  await run("INSERT INTO users (email, password_hash, name) VALUES ('old@x.com', ?, 'Old')", await bcrypt.hash('secret1', 4))
  assert.equal((await post('/api/auth/login', { email: 'old@x.com', password: 'secret1' })).status, 200)
})

test('forgot and reset password', async () => {
  const email = 'pat@x.com'
  await signupVerified('Pat', email, 'oldpass1')

  // Same answer whether or not the account exists, and nothing is sent for unknown emails
  const unknown = await post('/api/auth/forgot-password', { email: 'ghost@x.com' })
  assert.deepEqual([unknown.status, unknown.data], [200, { ok: true }])
  assert.equal(sentTo('ghost@x.com', 'reset'), 0)
  const known = await post('/api/auth/forgot-password', { email })
  assert.deepEqual([known.status, known.data], [200, { ok: true }])
  const code = lastCode(email, 'reset')
  assert.match(code, /^\d{6}$/)

  // Throttled requests still answer 200 but send nothing
  assert.deepEqual((await post('/api/auth/forgot-password', { email })).data, { ok: true })
  assert.deepEqual((await post('/api/auth/resend-code', { email, purpose: 'reset' })).data, { ok: true })
  assert.equal(sentTo(email, 'reset'), 1)

  assert.equal((await post('/api/auth/reset-password', { email, code: wrongCode(code), newPassword: 'newpass1' })).status, 400)
  assert.equal((await post('/api/auth/reset-password', { email, code, newPassword: '123' })).status, 400)
  assert.equal((await post('/api/auth/reset-password', { email: 'ghost@x.com', code, newPassword: 'newpass1' })).status, 400)

  const reset = await post('/api/auth/reset-password', { email, code, newPassword: 'newpass1' })
  assert.equal(reset.status, 200)
  assert.ok(reset.data.token)
  assert.equal((await post('/api/auth/reset-password', { email, code, newPassword: 'again123' })).status, 400, 'single use')
  assert.equal((await post('/api/auth/login', { email, password: 'oldpass1' })).status, 401)
  assert.equal((await post('/api/auth/login', { email, password: 'newpass1' })).status, 200)
})

test('resetting the password also verifies the email', async () => {
  const email = 'quinn@x.com'
  await post('/api/auth/signup', { name: 'Quinn', email, password: 'secret1' })
  await post('/api/auth/forgot-password', { email })
  const reset = await post('/api/auth/reset-password', { email, code: lastCode(email, 'reset'), newPassword: 'newpass1' })
  assert.equal(reset.status, 200)
  assert.equal((await post('/api/auth/login', { email, password: 'newpass1' })).status, 200)
})

test('with email codes turned off, signup signs in straight away', async () => {
  process.env.EMAIL_VERIFICATION = 'false'
  try {
    const email = 'nocode@x.com'
    const signup = await post('/api/auth/signup', { name: 'Noa', email, password: 'secret1' })
    assert.equal(signup.status, 201)
    assert.ok(signup.data.token)
    assert.equal(sentTo(email), 0)
    assert.equal((await api('/api/auth/me', { token: signup.data.token })).status, 200)
    assert.equal((await post('/api/auth/signup', { name: 'Noa', email, password: 'secret1' })).status, 409)

    // Unverified accounts from before can log in, and code endpoints are switched off
    await post('/api/auth/login', { email, password: 'secret1' }).then((r) => assert.equal(r.status, 200))
    for (const path of ['verify-email', 'resend-code', 'forgot-password', 'reset-password']) {
      assert.equal((await post(`/api/auth/${path}`, { email, code: '123456', newPassword: 'newpass1' })).status, 503, path)
    }
  } finally {
    process.env.EMAIL_VERIFICATION = 'true'
  }
  // Turning codes back on asks that account to verify
  assert.equal((await post('/api/auth/login', { email: 'nocode@x.com', password: 'secret1' })).status, 403)
})

test('social links are cleaned up and only shown to matches', async () => {
  const sam = await makeUser('Sam', 'woman', 'men')
  const tom = await makeUser('Tom', 'man', 'women')
  const saved = await api('/api/auth/me', {
    method: 'PUT', token: sam.token,
    body: { socials: { github: 'https://github.com/sam-dev/', linkedin: 'https://www.linkedin.com/in/sam-k-123?trk=x', instagram: '@sam.snaps', twitter: 'ignored' } },
  })
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.data.socials, { github: 'sam-dev', linkedin: 'sam-k-123', instagram: 'sam.snaps' })
  assert.equal((await api('/api/auth/me', { method: 'PUT', token: sam.token, body: { socials: { instagram: 'not valid!' } } })).status, 400)

  // Not visible before matching
  const before = (await api('/api/discover', { token: tom.token })).data.find((p) => p.id === sam.id)
  assert.ok(before)
  assert.equal(before.socials, undefined)
  assert.equal((await api(`/api/profiles/${sam.id}`, { token: tom.token })).data.socials, undefined)

  await api('/api/likes', { method: 'POST', token: sam.token, body: { userId: tom.id } })
  const match = await api('/api/likes', { method: 'POST', token: tom.token, body: { userId: sam.id } })
  assert.equal(match.data.matched, true)
  assert.equal(match.data.profile.socials.github, 'sam-dev')
  const list = (await api('/api/matches', { token: tom.token })).data
  assert.equal(list.find((m) => m.profile.id === sam.id).profile.socials.instagram, 'sam.snaps')
  assert.equal((await api(`/api/matches/${match.data.matchId}`, { token: tom.token })).data.profile.socials.linkedin, 'sam-k-123')

  // Clearing a field removes it
  const cleared = await api('/api/auth/me', { method: 'PUT', token: sam.token, body: { socials: { github: 'sam-dev', linkedin: '', instagram: null } } })
  assert.deepEqual(cleared.data.socials, { github: 'sam-dev' })
})
