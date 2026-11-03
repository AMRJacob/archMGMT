import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { EmailOtpType, Session } from '@supabase/supabase-js'
import { appUrl, supabase } from '../lib/supabase.ts'
import { AuthContext, useAuth } from './authContext.ts'

function Logo() {
  return <div className="brand signin-brand" aria-label="archMGMT"><span className="arch">arch</span><span className="mgmt">MGMT</span></div>
}

const NEEDS_PW_KEY = 'archmgmt.needsPassword'
const flag = {
  get: () => { try { return sessionStorage.getItem(NEEDS_PW_KEY) === '1' } catch { return false } },
  set: (on: boolean) => { try { if (on) sessionStorage.setItem(NEEDS_PW_KEY, '1'); else sessionStorage.removeItem(NEEDS_PW_KEY) } catch { /* ignore */ } },
}

/**
 * Handle whatever kind of link brought the user here:
 *  - #access_token=…&type=invite|recovery   (Supabase's default invite / reset emails)
 *  - ?token_hash=…&type=invite|recovery     (customised email templates, see docs/SETUP.md)
 *  - ?code=…                                (email sign-in links; handled by the library)
 * Returns the link type, or null when the URL carried no link.
 */
type CapturedLink =
  | { kind: 'tokens'; access_token: string; refresh_token: string; type: string | null }
  | { kind: 'hash'; token_hash: string; type: EmailOtpType }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | null

// Runs once when this module loads — before React and the HashRouter read the address —
// so link tokens never reach the router (it would treat "#access_token=…" as a page name).
const captured: CapturedLink = (() => {
  if (typeof window === 'undefined') return null
  const frag = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''))
  const query = new URLSearchParams(window.location.search)
  let link: CapturedLink = null
  if (frag.get('error_description') || query.get('error_description')) {
    const msg = (frag.get('error_description') || query.get('error_description'))!
    link = { kind: 'error', message: /signups? not allowed|not allowed for this instance/i.test(msg)
      ? 'That Google account hasn’t been added to archMGMT yet. Ask an admin to add your email in Supabase.'
      : msg }
  } else if (query.get('code')) {
    link = { kind: 'code', code: query.get('code')! } // Google sign-in (and email links) return here
  } else if (frag.get('access_token') && frag.get('refresh_token')) {
    link = { kind: 'tokens', access_token: frag.get('access_token')!, refresh_token: frag.get('refresh_token')!, type: frag.get('type') }
  } else if (query.get('token_hash') && query.get('type')) {
    link = { kind: 'hash', token_hash: query.get('token_hash')!, type: query.get('type') as EmailOtpType }
  }
  if (link) window.history.replaceState(null, '', appUrl() + '#/')
  return link
})()

async function consumeAuthLink(): Promise<{ type: string | null; error: string | null }> {
  if (!supabase || !captured) return { type: null, error: null }
  if (captured.kind === 'error') return { type: null, error: captured.message }
  if (captured.kind === 'code') {
    const { error } = await supabase.auth.exchangeCodeForSession(captured.code)
    return { type: null, error: error ? `${error.message}. Try signing in again.` : null }
  }
  if (captured.kind === 'tokens') {
    const { error } = await supabase.auth.setSession({ access_token: captured.access_token, refresh_token: captured.refresh_token })
    return { type: captured.type, error: error?.message ?? null }
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: captured.token_hash, type: captured.type })
  return { type: captured.type, error: error ? `${error.message}. The link may have expired; ask for a new one.` : null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [needsPassword, setNeedsPassword] = useState(flag.get())
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const requirePassword = () => { flag.set(true); setNeedsPassword(true) }

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') requirePassword()
      if (event === 'SIGNED_OUT') { flag.set(false); setNeedsPassword(false) }
      if (s && window.location.search.includes('code=')) {
        window.history.replaceState(null, '', appUrl() + window.location.hash)
      }
    })

    ;(async () => {
      const link = await consumeAuthLink()
      if (link.error) setLinkError(link.error)
      if (link.type === 'invite' || link.type === 'recovery' || link.type === 'signup') requirePassword()
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setLoading(false)
    })()

    return () => sub.subscription.unsubscribe()
  }, [])

  const passwordSet = () => { flag.set(false); setNeedsPassword(false) }
  const signOut = async () => { await supabase?.auth.signOut() }

  return (
    <AuthContext.Provider value={{ session, loading, needsPassword, linkError, passwordSet, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}


type Mode = 'password' | 'link' | 'forgot'

/** Whether Google sign-in is switched on for the project (Supabase → Authentication → Providers). */
function useGoogleEnabled() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const url = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl
    const key = (supabase as unknown as { supabaseKey?: string })?.supabaseKey
    if (!url || !key) return
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json()).then((j) => setOn(Boolean(j?.external?.google))).catch(() => setOn(false))
  }, [])
  return on
}

export function SignIn() {
  const { linkError } = useAuth()
  const google = useGoogleEnabled()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('password')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(linkError)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setMessage(null)
    let err: { message: string } | null = null
    if (mode === 'password') {
      err = (await supabase.auth.signInWithPassword({ email, password })).error
    } else if (mode === 'link') {
      err = (await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: appUrl() } })).error
      if (!err) setMessage(`Sign-in link sent to ${email}. Open it on this device.`)
    } else {
      err = (await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })).error
      if (!err) setMessage(`If ${email} has an account, a reset link is on its way. Open it on this device.`)
    }
    setBusy(false)
    if (err) setError(err.message === 'Invalid login credentials' ? 'Email or password is wrong.' : err.message)
  }

  const label = { password: 'Sign in', link: 'Email me a sign-in link', forgot: 'Send reset link' }[mode]

  return (
    <div className="signin">
      <form className="card" onSubmit={submit}>
        <Logo />
        <p className="muted">
          {mode === 'forgot' ? 'Enter your email and we’ll send a link to choose a new password.' : 'Sign in with the email you were invited with.'}
        </p>
        {google && mode === 'password' && (
          <>
            <button type="button" className="btn google" disabled={busy} onClick={async () => {
              setBusy(true); setError(null)
              const { error } = await supabase!.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: appUrl(), queryParams: { hd: 'amr-architects.com', prompt: 'select_account' } },
              })
              if (error) { setError(error.message); setBusy(false) }
            }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
              Continue with Google
            </button>
            <div className="or"><span>or with email</span></div>
          </>
        )}
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode === 'password' && (
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        <button className="btn primary" disabled={busy}>{busy ? 'Working…' : label}</button>
        <div className="signin-links">
          {mode !== 'password' && <button type="button" className="linkbtn" onClick={() => setMode('password')}>Sign in with password</button>}
          {mode !== 'forgot' && <button type="button" className="linkbtn" onClick={() => setMode('forgot')}>Forgot password?</button>}
          {mode !== 'link' && <button type="button" className="linkbtn" onClick={() => setMode('link')}>Email me a link</button>}
        </div>
        {message && <div className="notice">{message}</div>}
        {error && <div className="notice error">{error}</div>}
      </form>
    </div>
  )
}

/** Shown after an invite or reset link, before the rest of the app. */
export function CreatePassword() {
  const { session, passwordSet, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else passwordSet()
  }

  return (
    <div className="signin">
      <form className="card" onSubmit={save}>
        <Logo />
        <h2>Create your password</h2>
        <p className="muted">You’ll use it with <strong>{session?.user.email}</strong> to sign in from now on.</p>
        <label>Password
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>Confirm password
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {tooShort && <span className="small bad-text">At least 8 characters.</span>}
        {mismatch && <span className="small bad-text">Passwords don’t match.</span>}
        <button className="btn primary" disabled={busy || password.length < 8 || confirm !== password}>
          {busy ? 'Saving…' : 'Save password and continue'}
        </button>
        <button type="button" className="linkbtn" onClick={signOut}>Not you? Sign out</button>
        {error && <div className="notice error">{error}</div>}
      </form>
    </div>
  )
}

/** Change password (Settings). */
export function ChangePassword() {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.auth.updateUser({ password })
    setMsg(error ? error.message : 'Password saved.')
    if (!error) setPassword('')
  }
  return (
    <form className="row-gap" onSubmit={save}>
      <input className="field boxed" type="password" autoComplete="new-password" minLength={8} placeholder="New password (8+ characters)"
        value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn" disabled={password.length < 8}>Change password</button>
      {msg && <span className="muted small">{msg}</span>}
    </form>
  )
}
