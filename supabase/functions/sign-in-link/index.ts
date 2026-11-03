// sign-in-link: archMGMT account management for admins (emails in app_admins), with no email sent.
//   { action: 'link',   email }  → one-time invite (new) or password-reset (existing) token
//   { action: 'list' }          → everyone with an account, plus the outside-AMR access list
//   { action: 'remove', email } → delete that account and take them off the access list
// The app turns a token into a link the admin sends however they like. The service-role key used
// here never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Who is asking? Must be signed in and on the admin list.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who } = await admin.auth.getUser(token)
  const callerEmail = who?.user?.email?.toLowerCase()
  if (!callerEmail) return json({ error: 'Sign in first.' }, 401)
  const { data: isAdmin } = await admin.from('app_admins').select('email').eq('email', callerEmail).maybeSingle()
  if (!isAdmin) return json({ error: 'Only archMGMT admins can manage access.' }, 403)

  let body: { action?: string; email?: string } = {}
  try { body = await req.json() } catch { /* empty body */ }
  const action = body.action ?? 'link'
  const email = String(body.email ?? '').trim().toLowerCase()

  if (action === 'list') {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) return json({ error: error.message }, 400)
    const { data: admins } = await admin.from('app_admins').select('email')
    const { data: access } = await admin.from('app_access').select('email, note, added_at')
    const adminSet = new Set((admins ?? []).map((a) => a.email))
    return json({
      users: data.users.map((u) => ({
        email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
        admin: adminSet.has((u.email ?? '').toLowerCase()),
      })).sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '')),
      access: access ?? [],
    })
  }

  if (!validEmail(email)) return json({ error: 'Enter a valid email address.' }, 400)

  if (action === 'remove') {
    if (email === callerEmail) return json({ error: 'You can’t remove your own access.' }, 400)
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const user = data?.users.find((u) => u.email?.toLowerCase() === email)
    if (user) {
      const { error } = await admin.auth.admin.deleteUser(user.id)
      if (error) return json({ error: error.message }, 400)
    }
    await admin.from('app_access').delete().eq('email', email)
    return json({ removed: email })
  }

  // action === 'link': new person → invite (creates the account); existing → password reset.
  let type: 'invite' | 'recovery' = 'invite'
  let res = await admin.auth.admin.generateLink({ type: 'invite', email })
  if (res.error && /already|registered|exists/i.test(res.error.message)) {
    type = 'recovery'
    res = await admin.auth.admin.generateLink({ type: 'recovery', email })
  }
  if (res.error || !res.data?.properties?.hashed_token) {
    return json({ error: res.error?.message ?? 'Could not create a link.' }, 400)
  }

  // People outside AMR also need to be on the access list to see any data.
  let addedToAccessList = false
  if (!email.endsWith('@amr-architects.com')) {
    const { error } = await admin.from('app_access').upsert({ email, note: `Added by ${callerEmail}` })
    addedToAccessList = !error
  }

  return json({ token_hash: res.data.properties.hashed_token, type, email, addedToAccessList })
})
