import { createClient } from '@supabase/supabase-js'

// The shared archMGMT database. The publishable key is meant to live in browser code: what anyone
// can see or change is decided by the database's access rules (supabase/migrations/0004, 0005).
// .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) can point a local copy somewhere else;
// set VITE_SUPABASE_URL=off to run on browser-only sample data.
const DEFAULT_URL = 'https://foaehycyfaosjipzdvxe.supabase.co'
const DEFAULT_KEY = 'sb_publishable_B9s1YsQrXOEOUTcB8-KCVw_gVdKK3S9'
const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const url = envUrl === 'off' ? undefined : envUrl
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_KEY

/** True once .env / GitHub secrets have real Supabase keys. */
export const isConfigured = Boolean(url && anonKey)

// PKCE puts sign-in codes in ?code=…, which works alongside the HashRouter's #/route.
// Invite and recovery links from the Supabase dashboard arrive as #access_token=… instead;
// auth.tsx handles those itself, so automatic detection of that format is turned off here.
export const supabase = isConfigured
  ? createClient(url!, anonKey!, {
      auth: { flowType: 'pkce', detectSessionInUrl: () => false, persistSession: true },
    })
  : null

/** Use inside screens that only render once signed in. */
export function db() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** The app's own address, used as the return link in sign-in emails. */
export function appUrl() {
  return window.location.origin + window.location.pathname
}
