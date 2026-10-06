import { ClerkProvider } from '@clerk/react';
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

// Compiled in at build time. A build made where the key isn't set (a fork, or
// a CI job missing its variable) has none — and a ClerkProvider without one
// never finishes loading, so that build would sit on its loading screen. It
// runs as a guest-only player instead.
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

createRoot(document.getElementById('root')!).render(
  <>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    ) : (
      <App auth={false} />
    )}
    {/* Vercel's script only exists on the hosted site. In the desktop app the
        request falls through to the local server's page fallback, comes back
        as HTML, and logs a syntax error on every launch. */}
    {!isDesktopShell && <Analytics />}
  </>,
)
