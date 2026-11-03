// sign-in-link: lets an archMGMT admin create a one-time sign-in link for someone, without sending
// any email. The app turns the returned token into a link the admin sends however they like
// (Teams, email, text). Opening it lets the person set their password.
//
// Only emails in app_admins may call this. The service-role key used here never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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
  if (!isAdmin) return json({ error: 'Only archMGMT admins can create sign-in links.' }, 403)

  let email = ''
  try { email = String((await req.json())?.email ?? '').trim().toLowerCase() } catch { /* bad body */ }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)

  // New person: an invite (creates the account). Existing account: a reset link to (re)set the password.
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
