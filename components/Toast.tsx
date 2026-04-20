import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../lib/theme';
import { useToastState } from '../context/AppContext';

export default function Toast() {
  const toastMsg = useToastState();
  if (!toastMsg) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{toastMsg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '600',
  },
});





