// Draggable seek bar for the Now Playing screen.
//
// While a finger is down, the bar tracks the finger and ignores the player's
// position ticks — otherwise the 500ms progress poll yanks the knob back to
// where playback still is mid-drag. The seek itself fires once, on release:
// engines debounce badly (YouTube drops rapid seekTo calls), so streaming every
// move would fight the player instead of controlling it.
//
// After release the dragged position is held on screen briefly. The next poll
// can arrive from before the seek landed, and without the hold the knob snaps
// back for one frame and then jumps forward again.

import { useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { color } from './theme'

const HOLD_MS = 1200

export function SeekBar({
  positionSec,
  durationSec,
  onSeek,
}: {
  positionSec: number
  durationSec: number
  onSeek: (sec: number) => void
}) {
  const [width, setWidth] = useState(0)
  const [dragX, setDragX] = useState<number | null>(null)
  const holdUntil = useRef(0)
  const heldSec = useRef(0)

  const toSec = (x: number) =>
    width > 0 && durationSec > 0 ? Math.max(0, Math.min(durationSec, (x / width) * durationSec)) : 0

  const release = (x: number) => {
    const sec = toSec(x)
    heldSec.current = sec
    holdUntil.current = Date.now() + HOLD_MS
    setDragX(null)
    onSeek(sec)
  }

  // runOnJS: no worklets here — the handlers touch React state and the player.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => setDragX(e.x))
    .onUpdate((e) => setDragX(e.x))
    .onEnd((e) => release(e.x))
    .onFinalize((e, success) => {
      // A tap never reaches onEnd (no pan activation) — treat it as a seek too,
      // or tapping the bar does nothing, which reads as broken.
      if (!success) release(e.x)
    })

  const shownSec =
    dragX != null
      ? toSec(dragX)
      : Date.now() < holdUntil.current
        ? heldSec.current
        : positionSec
  const pct = durationSec > 0 ? Math.min(1, shownSec / durationSec) : 0

  return (
    <GestureDetector gesture={pan}>
      {/* Tall hit area; the visible 4px bar sits centered inside it. */}
      <View
        style={styles.hit}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: Math.round(durationSec), now: Math.round(shownSec) }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct * 100}%` }]} />
        </View>
        <View
          style={[
            styles.knob,
            { left: `${pct * 100}%` },
            dragX != null && styles.knobActive,
          ]}
        />
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  hit: { height: 30, justifyContent: 'center' },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.panelStrong,
    overflow: 'hidden',
  },
  fill: { height: 4, backgroundColor: color.accent },
  knob: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: color.accent,
    marginLeft: -6,
    shadowColor: color.accent,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  knobActive: { transform: [{ scale: 1.35 }] },
})
