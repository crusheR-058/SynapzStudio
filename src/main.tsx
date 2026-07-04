import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './app/App'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Analytics />
  </>,
)

// Register the app-shell service worker so Synapz installs as a PWA (best
// background-audio reliability on Android) and loads offline. Prod only —
// a service worker would fight Vite's HMR in dev.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration is best-effort; the app works fine without it */
    })
  })
}
