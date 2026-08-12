// Normalises incoming deep links before expo-router matches them.
//
// The same room link reaches the app in two different URL shapes, and only one
// of them routes correctly on its own:
//
//   synapz://listen/k7m2xq4p    "listen" is the HOST, path is "/k7m2xq4p"
//   synapz:///listen/k7m2xq4p   host is EMPTY, path is "/listen/k7m2xq4p"
//
// The first is what the desktop app and the Discord buttons mint (see
// electron/main.cjs, which routes on u.hostname); the second is what
// Linking.createURL and Expo's dev tooling produce. Handed over unchanged, the
// first matches no route and lands on the unmatched screen.
//
// So the first path segment is recovered from wherever it happens to live —
// host or path — and the URL is rebuilt from there.
//
// redirectSystemPath runs for cold starts as well as warm ones, which is the
// case a Linking listener misses: on a cold start the URL arrives before any
// component has mounted to hear it.

/** First segments this app actually has routes for. */
const ROUTES = new Set(['listen', 'play'])

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    // Already-normalised router paths arrive here too; leave them alone.
    if (!path.includes('://')) return path

    const url = new URL(path)
    const fromPath = url.pathname.split('/').filter(Boolean)
    // A non-empty host is the first segment; otherwise the path already holds it.
    const segments = url.hostname ? [url.hostname, ...fromPath] : fromPath

    const head = segments[0]
    if (!head) return '/'

    // The OAuth return is consumed by expo-web-browser, not routed. Sending it
    // to the router would push a junk screen over the app mid-sign-in.
    if (head === 'auth-callback') return '/'

    // Anything we have no route for is passed through untouched, so the router
    // shows its own unmatched screen rather than this guessing.
    if (!ROUTES.has(head)) return path

    return `/${segments.join('/')}${url.search}`
  } catch {
    // A malformed link must not crash the launch.
    return '/'
  }
}
