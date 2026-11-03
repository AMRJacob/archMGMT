import { setTheme, THEMES, useTheme } from '../lib/theme.ts'

/** Settings card for picking the app's look. Saved in this browser only. */
export default function ThemePicker() {
  const current = useTheme()
  return (
    <div className="card pad">
      <h2>Look</h2>
      <p className="muted">Pick a theme for this browser. It only changes how the app looks; schedule exports always use the clean presentation style.</p>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={`theme-tile${t.id === current ? ' on' : ''}`} data-preview={t.id}
            onClick={() => setTheme(t.id)} aria-pressed={t.id === current}>
            <span className="theme-swatch" aria-hidden="true">
              <i style={{ background: t.swatch[0] }} />
              <i style={{ background: t.swatch[1] }} />
              <i style={{ background: t.swatch[2] }} />
              <i style={{ background: t.swatch[3] }} />
              <i style={{ background: t.swatch[4] }} />
            </span>
            <strong>{t.name}</strong>
            <span className="muted">{t.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
