import { useState, type ReactNode } from 'react'

/** Inline fields: look like plain text until focused, save when you leave the field. */

export function TextField({
  value, onSave, placeholder, className = '', multiline = false,
}: {
  value: string | null
  onSave: (v: string | null) => void
  placeholder?: string
  className?: string
  multiline?: boolean
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [shown, setShown] = useState(value)
  if (shown !== value) { setShown(value); setDraft(value ?? '') } // value changed elsewhere
  const commit = () => {
    const next = draft.trim() === '' ? null : draft.trim()
    if (next !== (value ?? null)) onSave(next)
  }
  if (multiline) {
    return (
      <textarea className={`field ${className}`} value={draft} placeholder={placeholder} rows={2}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
    )
  }
  return (
    <input className={`field ${className}`} value={draft} placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

export function NumberField({
  value, onSave, placeholder, className = '',
}: {
  value: number | null
  onSave: (v: number | null) => void
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [shown, setShown] = useState(value)
  if (shown !== value) { setShown(value); setDraft(value?.toString() ?? '') } // value changed elsewhere
  const commit = () => {
    const n = draft.trim() === '' ? null : Number(draft)
    if (n !== null && Number.isNaN(n)) return setDraft(value?.toString() ?? '')
    if (n !== value) onSave(n)
  }
  return (
    <input className={`field num ${className}`} inputMode="decimal" value={draft} placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

export function DateField({
  value, onSave, required = false,
}: {
  value: string | null
  onSave: (v: string | null) => void
  required?: boolean
}) {
  return (
    <input type="date" className="field date" value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value || null
        if (required && !v) return
        if (v !== value) onSave(v)
      }} />
  )
}

export function SelectField<V extends string>({
  value, onSave, children, className = '',
}: {
  value: V | null
  onSave: (v: V | null) => void
  children: ReactNode
  className?: string
}) {
  return (
    <select className={`field ${className}`} value={value ?? ''}
      onChange={(e) => onSave((e.target.value || null) as V | null)}>
      {children}
    </select>
  )
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="sr">{label}</span>
    </label>
  )
}
