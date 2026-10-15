import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// A throwaway file DB (libSQL transactions on ':memory:' would open a separate empty database).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bafive-test-'))
process.env.DB_PATH = path.join(tmpDir, 'test.db')
process.env.DEMO_MODE = 'false'
const { app } = await import('../src/app.js')
const { ready } = await import('../src/db.js')
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

const PHOTO = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330'

const makeUser = async (name, gender, interestedIn) => {
  const { data } = await api('/api/auth/signup', {
    method: 'POST',
    body: { name, email: `${name.toLowerCase()}@example.com`, password: 'secret123' },
  })
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
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'dupe@x.com', password: 'nope' } })).status, 401)
  const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'dupe@x.com', password: 'secret1' } })
  assert.equal(ok.status, 200)
  assert.ok(ok.data.token)
  assert.equal((await api('/api/auth/me')).status, 401)
  assert.equal((await api('/api/auth/me', { token: 'garbage' })).status, 401)
})

test('under-18 birthdays are rejected', async () => {
  const { data } = await api('/api/auth/signup', { method: 'POST', body: { name: 'Kid', email: 'kid@x.com', password: 'secret1' } })
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
