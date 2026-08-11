import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './app/App'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/app.css'

// In the Electron desktop app, fill the OS window instead of the centered
// "floating card" (which leaves big side margins when maximized). Web is unchanged.
if ((window as unknown as { synapz?: { isDesktop?: boolean } }).synapz?.isDesktop) {
  document.documentElement.classList.add('is-desktop')
}

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Analytics />
  </>,
)
