import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.synapz.music',
  appName: 'Synapz Music',
  webDir: 'dist',
  backgroundColor: '#0a0a0c',
  android: {
    // Serve over https://localhost so https subresources (YouTube iframe, Audius,
    // googleapis) load without mixed-content issues.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      backgroundColor: '#0a0a0c',
      showSpinner: false,
      androidSpinnerStyle: 'small',
    },
  },
}

export default config
