// electron-builder `afterPack` hook — makes UNSIGNED macOS builds openable.
//
// Apple Silicon refuses to launch any app without a valid code signature, so an
// unsigned build reports ""…is damaged and can't be opened"" (and can't be run
// even after clearing quarantine). When we're NOT doing real Developer-ID signing
// (no cert secret configured), apply a free AD-HOC signature so the app runs.
// Gatekeeper then shows the normal, bypassable "unidentified developer" prompt
// (right-click → Open) instead of refusing outright.
//
// When a real cert IS configured, electron-builder signs the app properly and
// this hook backs off so it doesn't clobber that signature.

const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context
  if (electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.MAC_CSC_LINK) return // real signing in effect

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
  console.log(`[adhoc-sign] ad-hoc signing ${appPath}`)
  try {
    // --force replaces any stale signature; --deep covers the nested Electron
    // helpers; "-" is the ad-hoc identity.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
    console.log('[adhoc-sign] done')
  } catch (err) {
    console.error('[adhoc-sign] failed:', err.message)
    throw err
  }
}
