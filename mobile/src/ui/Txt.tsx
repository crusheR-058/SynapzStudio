// Text primitive. Every string in the app goes through this so the type scale
// in theme.ts is the only place sizes are decided — the same discipline the web
// app gets from its CSS classes.

import { Text, type TextProps, type StyleProp, type TextStyle } from 'react-native'
import { color, typo } from './theme'

type Variant = keyof typeof typo
type Tone = 'text' | 'dim' | 'dimmer' | 'accent'

const TONE: Record<Tone, string> = {
  text: color.text,
  dim: color.dim,
  dimmer: color.dimmer,
  accent: color.accent,
}

export function Txt({
  variant = 'body',
  tone = 'text',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[typo[variant], { color: TONE[tone] }, style]} />
}
