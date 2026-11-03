import { useState } from 'react'
import { appUrl, supabase } from '../lib/supabase.ts'

/**
 * Create a one-time sign-in link for a person (admins only). No email is sent: copy the link and
 * send it however you like. Opening it lets them set a password; for someone who already has an
 * account it's a password-reset link.
 */
export default function SignInLink({ email, name }: { email: string | null | undefined; name: string }) {
  const [link, setLink] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!supabase) return null

  async function create() {
    if (!email) return
    setBusy(true); setError(null); setLink(null); setCopied(false)
    const { data, error } = await supabase!.functions.invoke('sign-in-link', { body: { email } })
    setBusy(false)
    if (error || !data?.token_hash) {
      let msg = error?.message ?? 'Could not create a link.'
      try { const body = await (error as { context?: Response })?.context?.json(); if (body?.error) msg = body.error } catch { /* keep msg */ }
      setError(msg)
      return
    }
    setLink(`${appUrl()}?token_hash=${encodeURIComponent(data.token_hash)}&type=${data.type}#/`)
    setNote(data.type === 'recovery'
      ? `${name} already has an account. This link lets them set a new password.`
      : `This link creates ${name}’s account and lets them choose a password.${data.addedToAccessList ? ' They were added to the access list (outside AMR).' : ''}`)
  }

  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { setCopied(false) }
  }

  return (
    <div className="signin-link">
      <button className="btn" disabled={!email || busy} onClick={create}
        title={email ? '' : 'Add their email first'}>{busy ? 'Creating…' : 'Create sign-in link'}</button>
      {!email && <span className="muted small">Add an email to create a sign-in link.</span>}
      {error && <span className="error small">{error}</span>}
      {link && (
        <div className="sl-box">
          <p className="small">{note} It works once and expires after a while (an hour by default), so send it now. Send it privately (Teams, email, text).</p>
          <div className="sl-row">
            <input className="field boxed" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
