// Sends one-time codes by email through Brevo's transactional HTTP API (free tier: 300 emails/day).
// HTTP rather than SMTP because free hosts often block outbound SMTP ports.
// Without BREVO_API_KEY (local dev, tests) codes are printed to the console instead.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

/** Codes "sent" while no BREVO_API_KEY is set, newest last. Tests read the code from here. */
export const outbox = []

// MAIL_FROM is either "you@example.com" or "baFive <you@example.com>".
const parseFrom = (value = '') => {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? { name: m[1] || 'baFive', email: m[2] } : { name: 'baFive', email: value.trim() }
}

const COPY = {
  verify: { subject: 'Your baFive verification code', intro: 'Welcome to baFive! Use this code to verify your email:' },
  reset: { subject: 'Your baFive password reset code', intro: 'Use this code to reset your baFive password:' },
}

/** Emails `code` to `to`. Resolves true when sent, false (and logs why) when sending failed. */
export async function sendCode(to, code, purpose) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    outbox.push({ to, code, purpose })
    if (process.env.NODE_ENV !== 'test') console.log(`[mail] ${purpose} code for ${to}: ${code}`)
    return true
  }

  const { subject, intro } = COPY[purpose]
  const text = `${intro}\n\n${code}\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.`
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1f1d2b">
  <h2 style="margin:0 0 12px">baFive</h2>
  <p>${intro}</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
  <p style="color:#6b6880;font-size:14px">It expires in 10 minutes. If you didn't ask for this, you can ignore this email.</p>
</div>`
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(process.env.MAIL_FROM), to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return true
    console.error(`[mail] Brevo rejected the email (${res.status}): ${await res.text()}`)
  } catch (err) {
    console.error('[mail] Could not reach Brevo:', err.message)
  }
  return false
}
