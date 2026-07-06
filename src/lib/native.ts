import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

// One-time native (Capacitor) shell setup: dark status bar, hide the splash once
// the UI is up, and wire the Android hardware back button to history/minimize.
// No-op on web + desktop.
export function initNative(): void {
  if (!Capacitor.isNativePlatform()) return
  document.documentElement.classList.add('is-native')

  // Dark app → light status-bar icons.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  if (Capacitor.getPlatform() === 'android') {
    StatusBar.setBackgroundColor({ color: '#0a0a0c' }).catch(() => {})
  }

  setTimeout(() => SplashScreen.hide().catch(() => {}), 350)

  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) window.history.back()
    else App.minimizeApp().catch(() => {})
  }).catch(() => {})
}
