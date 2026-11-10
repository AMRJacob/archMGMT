import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import '@fontsource/architects-daughter/400.css' // logo lettering, bundled so it works offline
import '@fontsource/jost/400.css' // mid-century theme
import '@fontsource/jost/500.css'
import '@fontsource/jost/600.css'
import '@fontsource/chakra-petch/400.css' // cyberpunk theme
import '@fontsource/chakra-petch/600.css'
import './styles.css'
import { applyTheme } from './lib/theme.ts'
import { applyPrefs } from './lib/prefs.ts'
import { installLongPress } from './lib/phone.ts'

applyTheme() // before the first paint, so the saved look doesn't flash
applyPrefs()
installLongPress() // touch: press and hold = right-click

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
