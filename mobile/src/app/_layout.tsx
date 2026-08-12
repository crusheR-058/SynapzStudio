// Root layout: fonts, dark chrome, and the providers every screen needs.
//
// The env/Supabase module is imported for its side effect, first and before
// anything that touches core — it is what registers the client and config that
// core/supabase.ts and core/config.ts hand out.
import '../lib/supabase'

import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import {
  useFonts,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from '@expo-google-fonts/figtree'
import { PlayerProvider } from '../lib/player'
import { AuthProvider } from '../lib/auth'
import { LikesProvider } from '../lib/likes'
import { ListenProvider } from '../lib/listenAlong'
import { HistoryProvider } from '../lib/history'
import { AudioHost } from '../lib/AudioHost'
import { color } from '../ui/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  })

  useEffect(() => {
    // Hide on error too — a font that fails to load is a fallback face, not a
    // reason to leave the user staring at a splash screen forever.
    if (loaded || error) SplashScreen.hideAsync().catch(() => {})
  }, [loaded, error])

  if (!loaded && !error) return null

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.ground }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LikesProvider>
            <PlayerProvider>
              <ListenProvider>
              <HistoryProvider>
              <AudioHost />
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.ground },
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="player"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="queue"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="listen/index"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                {/* Deep-link landings. Not modals: they can be the first screen
                    the app ever shows, and a modal with nothing behind it has
                    no way back. */}
                <Stack.Screen name="listen/[code]" />
                <Stack.Screen name="play/[source]/[id]" />
              </Stack>
              </HistoryProvider>
              </ListenProvider>
            </PlayerProvider>
          </LikesProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
