/**
 * ECS Image Compositor
 * ─────────────────────────────────────────────────────────
 * Composes a complete vehicle preview by stacking PNG image
 * layers with absolute positioning inside a 1:1 container.
 *
 * All images share a 1024×1024 grid. Accessory layers are
 * offset per-vehicle using the anchor map system to snap
 * accessories to each vehicle's correct geometry.
 *
 * ANIMATION SYSTEM:
 *   Accessory layers fade in/out smoothly when added or removed.
 *   Each layer has its own Animated.Value for opacity.
 *   Base vehicle layer does not animate (always visible).
 *   Uses cubic ease-out timing for instrument-grade feel.
 *
 * DEBUG OVERLAY MODE:
 *   When debugOverlay=true, renders crosshair markers at
 *   each anchor point so offsets can be precisely calibrated.
 *   Each crosshair is color-coded by accessory category.
 *
 * RENDERING CONSTRAINTS:
 *   - 1:1 aspect ratio container
 *   - resizeMode: 'contain' for proportional scaling
 *   - No scaleX / scaleY transforms
 *   - No stretch alignment
 *   - Wheels remain perfectly circular
 *
 * STACKING ORDER (bottom to top):
 *   1. Base vehicle image
 *   2. Bed module (truck only)
 *   3. Roof rack (if selected or auto-required)
 *   4. Roof storage OR roof tent
 *   5. Hitch module
 */

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Image, Text, StyleSheet, Animated, Easing } from 'react-native';
import type { ImageVehicleConfig } from './AssetRegistry';
import {
  resolveImageLayers,
  VEHICLE_DISPLAY_NAMES,
  getDebugAnchorPoints,
} from './AssetRegistry';
import type { DebugAnchorPoint, ImageLayer } from './AssetRegistry';

// ── Constants ───────────────────────────────────────────
/** Source image grid size */
const GRID_SIZE = 1024;

/** Crosshair arm length in screen pixels */
const CROSSHAIR_SIZE = 16;

/** Crosshair line thickness in screen pixels */
const CROSSHAIR_THICKNESS = 1.5;

/** Fade-in duration for accessory layers (ms) */
const LAYER_FADE_IN = 280;

/** Fade-out duration for accessory layers (ms) */
const LAYER_FADE_OUT = 200;

/** Easing curve for layer transitions */
const LAYER_EASING = Easing.out(Easing.cubic);

// ── Animated Layer Tracker ──────────────────────────────
// Tracks animated opacity values for each layer key.
// Layers that are added get faded in; layers that are
// removed get faded out and then cleaned up.

interface TrackedLayer {
  key: string;
  layer: ImageLayer;
  opacity: Animated.Value;
  removing: boolean;
}

// ── Props ───────────────────────────────────────────────
interface ImageCompositorProps {
  /** Vehicle configuration to render */
  config: ImageVehicleConfig;
  /** Container width — height will match (1:1 aspect ratio) */
  width: number;
  /** Optional tint color for accessory overlays */
  accessoryTint?: string;
  /** Opacity (0-1) */
  opacity?: number;
  /** Show vehicle name label below */
  showLabel?: boolean;
  /** Label color */
  labelColor?: string;
  /** Enable debug overlay with crosshair markers at anchor points */
  debugOverlay?: boolean;
}

export default function ImageCompositor({
  config,
  width,
  accessoryTint = '#D4AF37',
  opacity = 1,
  showLabel = false,
  labelColor = '#8A8A85',
  debugOverlay = false,
}: ImageCompositorProps) {
  // Resolve ordered image layers from config (includes anchor offsets)
  const layers = useMemo(() => resolveImageLayers(config), [config]);

  // Get debug anchor points for crosshair rendering
  const debugPoints = useMemo(
    () => (debugOverlay ? getDebugAnchorPoints(config.vehicleType) : []),
    [debugOverlay, config.vehicleType],
  );

  // Container is 1:1 to match the 1024×1024 source grid
  const containerSize = width;

  // Scale factor: converts 1024-space offsets to screen-space pixels
  const scale = containerSize / GRID_SIZE;

  // ── Animated Layer Management ─────────────────────────
  // We track each layer with its own Animated.Value so we can
  // independently fade layers in and out.
  const trackedLayersRef = useRef<TrackedLayer[]>([]);
  const [, forceUpdate] = React.useState(0);

  // Sync tracked layers with resolved layers
  useEffect(() => {
    const currentKeys = new Set(layers.map(l => l.key));
    const trackedKeys = new Set(trackedLayersRef.current.map(t => t.key));
    let changed = false;

    // 1. Mark removed layers for fade-out
    for (const tracked of trackedLayersRef.current) {
      if (!currentKeys.has(tracked.key) && !tracked.removing) {
        tracked.removing = true;
        changed = true;
        Animated.timing(tracked.opacity, {
          toValue: 0,
          duration: LAYER_FADE_OUT,
          easing: LAYER_EASING,
          useNativeDriver: true,
        }).start(() => {
          // Remove from tracked list after fade-out completes
          trackedLayersRef.current = trackedLayersRef.current.filter(
            t => t.key !== tracked.key,
          );
          forceUpdate(n => n + 1);
        });
      }
    }

    // 2. Add new layers with fade-in
    for (const layer of layers) {
      if (!trackedKeys.has(layer.key)) {
        const opacityVal = new Animated.Value(layer.isBase ? 1 : 0);
        trackedLayersRef.current.push({
          key: layer.key,
          layer,
          opacity: opacityVal,
          removing: false,
        });
        changed = true;

        if (!layer.isBase) {
          Animated.timing(opacityVal, {
            toValue: 1,
            duration: LAYER_FADE_IN,
            easing: LAYER_EASING,
            useNativeDriver: true,
          }).start();
        }
      } else {
        // Update existing layer data (in case anchor offsets changed)
        const existing = trackedLayersRef.current.find(t => t.key === layer.key);
        if (existing && !existing.removing) {
          existing.layer = layer;
        }
      }
    }

    // 3. Re-sort tracked layers to match stacking order
    if (changed) {
      const layerOrder = layers.map(l => l.key);
      trackedLayersRef.current.sort((a, b) => {
        const aIdx = layerOrder.indexOf(a.key);
        const bIdx = layerOrder.indexOf(b.key);
        // Removing layers go behind current layers
        if (a.removing && !b.removing) return -1;
        if (!a.removing && b.removing) return 1;
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return -1;
        if (bIdx === -1) return 1;
        return aIdx - bIdx;
      });
      forceUpdate(n => n + 1);
    }
  }, [layers]);

  // Handle vehicle type change — reset all tracked layers
  const prevVehicleTypeRef = useRef(config.vehicleType);
  useEffect(() => {
    if (config.vehicleType !== prevVehicleTypeRef.current) {
      // Clear all tracked layers on vehicle type change
      trackedLayersRef.current = [];
      prevVehicleTypeRef.current = config.vehicleType;
      forceUpdate(n => n + 1);
    }
  }, [config.vehicleType]);

  const trackedLayers = trackedLayersRef.current;

  if (layers.length === 0 && trackedLayers.length === 0) {
    return (
      <View style={[styles.fallback, { width: containerSize, height: containerSize }]}>
        <Text style={styles.fallbackText}>No vehicle selected</Text>
      </View>
    );
  }

  return (
    <View style={{ opacity }}>
      {/* 1:1 aspect ratio container */}
      <View
        style={[
          styles.container,
          {
            width: containerSize,
            height: containerSize,
          },
        ]}
      >
        {/* ── Animated Image Layers ── */}
        {trackedLayers.map((tracked, index) => {
          const layer = tracked.layer;
          // Convert anchor offset from 1024-space to screen-space
          const offsetLeft = layer.anchorOffset.x * scale;
          const offsetTop = layer.anchorOffset.y * scale;

          return (
            <Animated.Image
              key={tracked.key}
              source={layer.source}
              style={[
                styles.layerImage,
                {
                  width: containerSize,
                  height: containerSize,
                  zIndex: index + 1,
                  // Apply anchor offset for accessory snap alignment
                  top: offsetTop,
                  left: offsetLeft,
                  // Animated opacity for smooth transitions
                  opacity: tracked.opacity,
                },
                // Apply tint to accessory overlays (not base vehicle)
                !layer.isBase && accessoryTint
                  ? { tintColor: accessoryTint }
                  : undefined,
              ]}
              resizeMode="contain"
              // Prevent any layout jumps during load
              fadeDuration={0}
            />
          );
        })}

        {/* ── Debug Overlay: Crosshair Markers ── */}
        {debugOverlay && (
          <View style={[styles.debugOverlayContainer, { zIndex: 100 }]} pointerEvents="none">
            {/* Grid reference lines (center cross) */}
            <View
              style={[
                styles.debugGridLineH,
                {
                  top: containerSize / 2,
                  width: containerSize,
                },
              ]}
            />
            <View
              style={[
                styles.debugGridLineV,
                {
                  left: containerSize / 2,
                  height: containerSize,
                },
              ]}
            />

            {/* Anchor point crosshairs */}
            {debugPoints.map((point, idx) => {
              const cx = point.offset.x * scale;
              const cy = point.offset.y * scale;

              const isZeroOffset = point.offset.x === 0 && point.offset.y === 0;
              const displayCx = isZeroOffset ? 20 : cx + containerSize / 2;
              const displayCy = isZeroOffset ? 20 + idx * 30 : cy + containerSize / 2;

              return (
                <React.Fragment key={`debug-${idx}`}>
                  {/* Horizontal crosshair arm */}
                  <View
                    style={[
                      styles.crosshairH,
                      {
                        top: displayCy - CROSSHAIR_THICKNESS / 2,
                        left: displayCx - CROSSHAIR_SIZE,
                        width: CROSSHAIR_SIZE * 2,
                        height: CROSSHAIR_THICKNESS,
                        backgroundColor: point.color,
                      },
                    ]}
                  />
                  {/* Vertical crosshair arm */}
                  <View
                    style={[
                      styles.crosshairV,
                      {
                        top: displayCy - CROSSHAIR_SIZE,
                        left: displayCx - CROSSHAIR_THICKNESS / 2,
                        width: CROSSHAIR_THICKNESS,
                        height: CROSSHAIR_SIZE * 2,
                        backgroundColor: point.color,
                      },
                    ]}
                  />
                  {/* Center dot */}
                  <View
                    style={[
                      styles.crosshairDot,
                      {
                        top: displayCy - 3,
                        left: displayCx - 3,
                        backgroundColor: point.color,
                      },
                    ]}
                  />
                  {/* Label */}
                  <View
                    style={[
                      styles.crosshairLabel,
                      {
                        top: displayCy + CROSSHAIR_SIZE + 2,
                        left: displayCx - 40,
                      },
                    ]}
                  >
                    <Text style={[styles.crosshairLabelText, { color: point.color }]}>
                      {point.label}
                    </Text>
                    <Text style={[styles.crosshairOffsetText, { color: point.color }]}>
                      ({point.offset.x}, {point.offset.y})
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}

            {/* Debug info panel */}
            <View style={styles.debugInfoPanel}>
              <Text style={styles.debugInfoTitle}>
                DEBUG: {config.vehicleType.toUpperCase()}
              </Text>
              <Text style={styles.debugInfoText}>
                Grid: {GRID_SIZE}x{GRID_SIZE}
              </Text>
              <Text style={styles.debugInfoText}>
                Container: {Math.round(containerSize)}px
              </Text>
              <Text style={styles.debugInfoText}>
                Scale: {scale.toFixed(3)}
              </Text>
              <Text style={styles.debugInfoText}>
                Layers: {layers.length} (tracked: {trackedLayers.length})
              </Text>
              {layers.filter(l => !l.isBase).map(l => (
                <Text key={l.key} style={styles.debugLayerText}>
                  {l.key}: ({l.anchorOffset.x}, {l.anchorOffset.y})
                </Text>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Optional label */}
      {showLabel && (
        <Text style={[styles.label, { color: labelColor }]}>
          {VEHICLE_DISPLAY_NAMES[config.vehicleType]}
          {config.bedModule !== 'none' ? ` + ${config.bedModule}` : ''}
          {config.roofModule !== 'none' ? ` + ${config.roofModule}` : ''}
          {config.hitchModule !== 'none' ? ` + ${config.hitchModule}` : ''}
        </Text>
      )}

      {/* Debug anchor legend */}
      {debugOverlay && (
        <View style={styles.debugLegend}>
          {debugPoints.map((point, idx) => (
            <View key={`legend-${idx}`} style={styles.debugLegendRow}>
              <View style={[styles.debugLegendDot, { backgroundColor: point.color }]} />
              <Text style={styles.debugLegendText}>
                {point.label}: ({point.offset.x}, {point.offset.y})
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  layerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(138,138,138,0.2)',
    borderRadius: 8,
  },
  fallbackText: {
    fontSize: 11,
    color: '#8A8A85',
    letterSpacing: 0.5,
  },
  label: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // ── Debug Overlay ──
  debugOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  debugGridLineH: {
    position: 'absolute',
    left: 0,
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  debugGridLineV: {
    position: 'absolute',
    top: 0,
    width: 0.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Crosshair ──
  crosshairH: {
    position: 'absolute',
  },
  crosshairV: {
    position: 'absolute',
  },
  crosshairDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  crosshairLabel: {
    position: 'absolute',
    width: 80,
    alignItems: 'center',
  },
  crosshairLabelText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  crosshairOffsetText: {
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
    opacity: 0.8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // ── Debug Info Panel ──
  debugInfoPanel: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  debugInfoTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FF6B6B',
    letterSpacing: 1,
    marginBottom: 2,
  },
  debugInfoText: {
    fontSize: 7,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
    lineHeight: 11,
  },
  debugLayerText: {
    fontSize: 6,
    fontWeight: '500',
    color: '#D4AF37',
    letterSpacing: 0.3,
    lineHeight: 10,
    marginTop: 1,
  },

  // ── Debug Legend ──
  debugLegend: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
  },
  debugLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 1,
  },
  debugLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  debugLegendText: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.3,
  },
});



