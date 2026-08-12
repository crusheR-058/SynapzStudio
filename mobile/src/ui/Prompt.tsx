// Text-input dialog.
//
// React Native's Alert.prompt is iOS-only — on Android it is undefined, so a
// button relying on it does nothing at all. Since the target is Google Play,
// this is a real modal rather than a platform check that silently degrades.

import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { Txt } from './Txt'
import { color, radius, space } from './theme'

export function Prompt({
  visible,
  title,
  placeholder,
  initialValue = '',
  confirmLabel = 'Save',
  onCancel,
  onSubmit,
}: {
  visible: boolean
  title: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  onCancel: () => void
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)

  // Reset each time it opens, so a cancelled edit doesn't leak into the next.
  useEffect(() => {
    if (visible) setValue(initialValue)
  }, [visible, initialValue])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        {/* Tapping the scrim dismisses; the card swallows the press so a tap
            inside it doesn't close the dialog. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View style={styles.card}>
          <Txt variant="section">{title}</Txt>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={color.dimmer}
            style={styles.input}
            autoFocus
            selectionColor={color.accent}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.btn} accessibilityRole="button">
              <Txt variant="label" tone="dim">
                Cancel
              </Txt>
            </Pressable>
            <Pressable
              onPress={submit}
              style={[styles.btn, styles.confirm, !value.trim() && { opacity: 0.4 }]}
              disabled={!value.trim()}
              accessibilityRole="button"
            >
              <Txt variant="label" style={{ color: color.accentFg }}>
                {confirmLabel}
              </Txt>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.window,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineLit,
  },
  input: {
    height: 46,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    color: color.text,
    fontFamily: 'Figtree_400Regular',
    fontSize: 15,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  btn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.pill },
  confirm: { backgroundColor: color.accent },
})
