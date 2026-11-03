import { setTheme, THEMES, useTheme } from '../lib/theme.ts'
import { setTableText, useTableText } from '../lib/prefs.ts'

/** Settings card for picking the app's look. Saved in this browser only. */
export default function ThemePicker() {
  const current = useTheme()
  const tableText = useTableText()
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
      <div className="pref-row">
        <span>Long text in tables</span>
        <div className="segmented small-seg" role="radiogroup" aria-label="Long text in tables">
          <button role="radio" aria-checked={tableText === 'wrap'} className={tableText === 'wrap' ? 'on' : ''} onClick={() => setTableText('wrap')}>Wrap onto more lines</button>
          <button role="radio" aria-checked={tableText === 'crop'} className={tableText === 'crop' ? 'on' : ''} onClick={() => setTableText('crop')}>Crop to one line…</button>
        </div>
        <span className="muted small">Cropped text shows in full when you point at it. Drag column edges to widen them.</span>
      </div>
    </div>
  )
}
