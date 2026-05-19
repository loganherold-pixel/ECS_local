/**
 * Shell Route Layout
 *
 * The visible ECS CommandDock owns primary navigation. Rendering the active
 * child route directly avoids Android/Fabric native tab reparenting faults
 * while preserving the existing dashboard/fleet/navigate/explore/dispatch UI.
 */
import React from 'react';
import { Slot } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function TabLayout() {
  return (
    <View style={styles.container}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
