// Bottom tabs — the mobile translation of the web app's sidebar.
//
// The web sidebar lists Home / Bollywood / Hollywood / Artists / Podcasts. Those
// five don't map onto five tabs: Bollywood, Hollywood and Podcasts are slices of
// one catalogue, not separate places, and a five-tab bar leaves no room for
// Search or Library — the two things people reach for most on a phone.
//
// So the catalogue slices become chips on Home, and the tabs carry the four real
// destinations. Every web destination stays reachable, one tap deeper at most.

import { View, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, Search, Mic2, Library } from 'lucide-react-native'
import { MiniPlayer } from '../../ui/MiniPlayer'
import { color, font, TAB_BAR_HEIGHT } from '../../ui/theme'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.accent,
          tabBarInactiveTintColor: color.dimmer,
          tabBarStyle: {
            backgroundColor: color.window,
            borderTopWidth: 0,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom + 6,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 10.5, letterSpacing: 0.2 },
          sceneStyle: { backgroundColor: color.ground },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color: c, size }) => <Home size={size - 3} color={c} strokeWidth={2.2} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color: c, size }) => (
              <Search size={size - 3} color={c} strokeWidth={2.2} />
            ),
          }}
        />
        <Tabs.Screen
          name="artists"
          options={{
            title: 'Artists',
            tabBarIcon: ({ color: c, size }) => <Mic2 size={size - 3} color={c} strokeWidth={2.2} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color: c, size }) => (
              <Library size={size - 3} color={c} strokeWidth={2.2} />
            ),
          }}
        />
      </Tabs>

      {/* Overlaid rather than swapped in as a custom tabBar: expo-router vendors
          its own bottom-tabs types, so wrapping BottomTabBar means importing
          from a build-internal path that a minor upgrade can move. This sits
          above the bar, survives tab changes, and depends on nothing private.
          pointerEvents="box-none" keeps the gap around it tappable. */}
      <View
        pointerEvents="box-none"
        style={[styles.dock, { bottom: TAB_BAR_HEIGHT + insets.bottom }]}
      >
        <MiniPlayer />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  dock: { position: 'absolute', left: 0, right: 0 },
})
