import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * TopoBackground
 *
 * Historical shared screen wrapper for ECS tab content.
 * The app-body image now lives at the shell level, so this wrapper
 * stays transparent and simply preserves the existing screen structure.
 */
export default function TopoBackground({ children }: { children: React.ReactNode }) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
