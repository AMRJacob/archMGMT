import { appUrl, supabase } from './supabase.ts'

/** Calls the sign-in-link function (admins only) and returns its JSON, with readable errors. */
export async function accessCall<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Not connected to the shared database.')
  const { data, error } = await supabase.functions.invoke('sign-in-link', { body })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* keep msg */ }
    throw new Error(msg)
  }
  return data as T
}

export interface LinkResult { link: string; type: 'invite' | 'recovery'; addedToAccessList: boolean }

/** A one-time sign-in link for an email: an invite for someone new, a password reset otherwise. */
export async function createSignInLink(email: string): Promise<LinkResult> {
  const r = await accessCall<{ token_hash: string; type: 'invite' | 'recovery'; addedToAccessList: boolean }>({ action: 'link', email })
  return { link: `${appUrl()}?token_hash=${encodeURIComponent(r.token_hash)}&type=${r.type}#/`, type: r.type, addedToAccessList: r.addedToAccessList }
}

export interface AccountRow {
  email: string; created_at: string; last_sign_in_at: string | null; admin: boolean
  /** When they last opened the app (reported about once an hour) and last changed something. */
  last_seen_at?: string | null; last_edit_at?: string | null
}
