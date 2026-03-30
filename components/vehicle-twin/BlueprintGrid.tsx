/**
 * BlueprintGrid — Technical grid overlay for the vehicle canvas (V2 — Stabilization Phase 2)
 *
 * V2 CHANGES:
 *   - Removed corner registration marks (visual clutter)
 *   - Removed edge tick marks (visual clutter)
 *   - Reduced grid line opacity significantly
 *   - Increased grid spacing on all screens (fewer lines)
 *   - Major grid lines barely visible (was 0.065 → now 0.04)
 *   - Minor grid lines almost invisible (was 0.035 → now 0.02)
 *   - Center crosshair reduced to near-invisible reference
 *   - Result: grid is a subtle depth cue, not a visual distraction
 *
 * The grid should never compete with container zones for attention.
 */
import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');

/* V2: Reduced opacity for all grid elements */
const GRID_COLOR = 'rgba(212,160,23,0.018)';
const GRID_COLOR_MAJOR = 'rgba(212,160,23,0.035)';

/* V2: Increased spacing — fewer lines for cleaner look */
const GRID_SPACING = SCREEN_W < 380 ? 32 : 28;
const MAJOR_EVERY = 4;

interface Props {
  width: number;
  height: number;
}

export function BlueprintGrid({ width, height }: Props) {
  /* Memoize line positions to avoid recalculation on re-render */
  const { hLines, vLines, centerX, centerY } = useMemo(() => {
    const h: number[] = [];
    const v: number[] = [];
    for (let y = GRID_SPACING; y < height; y += GRID_SPACING) h.push(y);
    for (let x = GRID_SPACING; x < width; x += GRID_SPACING) v.push(x);

    return {
      hLines: h,
      vLines: v,
      centerX: Math.round(width / 2),
      centerY: Math.round(height / 2),
    };
  }, [width, height]);

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {/* Horizontal grid lines */}
      {hLines.map((y, i) => (
        <View
          key={`h-${i}`}
          style={{
            position: 'absolute',
            top: y,
            left: 0,
            right: 0,
            height: 0.5,
            backgroundColor: (i + 1) % MAJOR_EVERY === 0 ? GRID_COLOR_MAJOR : GRID_COLOR,
          }}
        />
      ))}

      {/* Vertical grid lines */}
      {vLines.map((x, i) => (
        <View
          key={`v-${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            bottom: 0,
            width: 0.5,
            backgroundColor: (i + 1) % MAJOR_EVERY === 0 ? GRID_COLOR_MAJOR : GRID_COLOR,
          }}
        />
      ))}

      {/* Center crosshair (very subtle reference point) */}
      <View
        style={{
          position: 'absolute',
          top: centerY,
          left: centerX - 6,
          width: 12,
          height: 0.5,
          backgroundColor: 'rgba(212,160,23,0.04)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: centerY - 6,
          left: centerX,
          width: 0.5,
          height: 12,
          backgroundColor: 'rgba(212,160,23,0.04)',
        }}
      />
    </View>
  );
}



