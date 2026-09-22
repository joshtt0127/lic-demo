/**
 * send-email — the last mile, over SMTP.
 *
 * Supabase has no "send an email" API of its own: its built-in mailer only
 * carries *auth* emails (confirmation, magic link, recovery) and this project is
 * capped at 2 per hour, which is why notifications cannot ride on it. What
 * Supabase does give us is a place to run code next to the database — so this
 * function takes the payload the outbox already produces and hands it to an
 * SMTP server the team already owns (iCloud, Gmail, a company relay). No
 * third-party email SaaS, no new account.
 *
 * It is called by `public.dispatch_email()` through `pg_net`, with the shared
 * secret in the Authorization header.
 *
 * Secrets (project → Edge Functions → Secrets):
 *   SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASS · EMAIL_HOOK_SECRET
 *
 * With no SMTP secret set it answers 503 and says so, which the outbox records
 * as `failed` with that exact reason — nothing ever pretends to have been sent.
 */
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

type Payload = {
  from?: string
  to?: string[] | string
  subject?: string
  html?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405)

  const expected = Deno.env.get('EMAIL_HOOK_SECRET')
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) return json({ error: 'unauthorized' }, 401)

  const host = Deno.env.get('SMTP_HOST')
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  const port = Number(Deno.env.get('SMTP_PORT') ?? '465')
  if (!host || !user || !pass) {
    return json(
      { error: 'SMTP is not configured — set SMTP_HOST, SMTP_USER and SMTP_PASS' },
      503,
    )
  }

  let payload: Payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const to = Array.isArray(payload.to) ? payload.to : payload.to ? [payload.to] : []
  if (to.length === 0 || !payload.subject || !payload.html) {
    return json({ error: 'to, subject and html are required' }, 400)
  }

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      tls: port === 465,
      auth: { username: user, password: pass },
    },
  })

  try {
    await client.send({
      from: payload.from ?? user,
      to,
      subject: payload.subject,
      html: payload.html,
      content: 'auto',
    })
    return json({ ok: true, to })
  } catch (error) {
    return json({ error: `SMTP refused the message: ${(error as Error).message}` }, 502)
  } finally {
    await client.close().catch(() => {})
  }
})
