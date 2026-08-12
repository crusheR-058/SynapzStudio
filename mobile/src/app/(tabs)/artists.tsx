// Artists — the web app's flagship view (185 artists, 7,336 tracks).
//
// It is intentionally empty until the catalogue moves to hosted JSON. Bundling
// indian.ts as-is would put 1.2 MB of JavaScript into the APK, and Metro has no
// dynamic import() to split it out the way Vite does on the web. So this screen
// waits for the fetch-and-cache path rather than shipping a slower app.

import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Mic2 } from 'lucide-react-native'
import { Txt } from '../../ui/Txt'
import { color, radius, space } from '../../ui/theme'

export default function ArtistsScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Txt variant="display">Artists</Txt>
      </View>

      <View style={styles.empty}>
        <View style={styles.badge}>
          <Mic2 size={22} color={color.accent} strokeWidth={2.2} />
        </View>
        <Txt variant="section">Catalogue on the way</Txt>
        <Txt variant="caption" tone="dim" style={styles.copy}>
          185 artists and 7,336 tracks live in the desktop app. They land here
          once the catalogue is served as hosted JSON instead of being bundled —
          a smaller app, a faster launch, and new music without a store release.
        </Txt>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  head: { paddingHorizontal: space.lg, paddingBottom: space.md },
  empty: { alignItems: 'center', gap: space.sm, paddingTop: 60, paddingHorizontal: space.xl },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accentWash,
    marginBottom: space.xs,
  },
  copy: { textAlign: 'center', lineHeight: 19 },
})
