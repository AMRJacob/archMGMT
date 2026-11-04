import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ title, onClose, children, footer, size, lock }: {
  /** Marks what this dialog edits, so others see it as being edited while it's open. */
  lock?: string
  size?: 'wide'
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  // Rendered at the top of the page, so it never inherits colours or stacking from where it was opened (e.g. the sidebar).
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${size ? ` ${size}` : ''}`} role="dialog" aria-modal="true" data-lock={lock} tabIndex={lock ? -1 : undefined}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn plain" onClick={onClose} title="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
