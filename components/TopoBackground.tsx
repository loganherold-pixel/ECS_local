/**
 * TopoBackground — Unified cinematic background for all ECS screens
 *
 * Uses the ECS global background formula:
 *   Base: ECS.bgPrimary (#0B0E12)
 *   Overlay: subtle radial gradient from top-center for depth
 *
 * All screens using TopoBackground inherit the same visual foundation.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ECS } from '../lib/theme';

const TOPO_IMAGE = 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1771546206665_9e4a0d84.jpg';

export default function TopoBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: TOPO_IMAGE }}
        style={styles.bgImage}
        contentFit="cover"
      />
      {/* Radial gradient simulation: top-center depth overlay */}
      <View style={styles.gradientOverlay}>
        <View style={styles.radialCore} />
      </View>
      <View style={styles.overlay} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    overflow: 'hidden',
  },
  radialCore: {
    position: 'absolute',
    top: -100,
    width: '120%',
    height: 400,
    borderRadius: 999,
    backgroundColor: 'rgba(18,22,28,0.8)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,14,18,0.55)',
  },
});



