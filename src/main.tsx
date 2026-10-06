import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './app/App'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/app.css'
import { registerServiceWorker } from './lib/pwa'

// In the Electron desktop app, fill the OS window instead of the centered
// "floating card" (which leaves big side margins when maximized). Web is unchanged.
const isDesktopShell = !!(window as unknown as { synapz?: { isDesktop?: boolean } }).synapz
  ?.isDesktop
if (isDesktopShell) {
  document.documentElement.classList.add('is-desktop')
}

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {/* Vercel's script only exists on the hosted site. In the desktop app the
        request falls through to the local server's page fallback, comes back
        as HTML, and logs a syntax error on every launch. */}
    {!isDesktopShell && <Analytics />}
  </>,
)
