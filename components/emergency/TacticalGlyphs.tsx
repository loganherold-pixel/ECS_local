/**
 * TacticalGlyphs — Custom Stabilization Icon Set
 *
 * Monoline vector glyphs for the ECS Emergency tab.
 *
 * Design constraints:
 * - 2.5px stroke weight (scaled)
 * - Sharp 90° + 45° angles ONLY
 * - No rounded internal curves
 * - No gradients, no soft medical styling
 * - Aircraft emergency card / military technical manual aesthetic
 * - Works in single accent color per widget
 *
 * Each glyph is built from positioned View elements with
 * borders and transforms limited to 0°, 45°, 90°, 135°, etc.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';

interface GlyphProps {
  color: string;
  size: number;
}

const STROKE = 2.5; // base stroke at size=24

function s(base: number, size: number) {
  return (base / 24) * size;
}

function sw(size: number) {
  return Math.max(1.5, (STROKE / 24) * size);
}

// ═══════════════════════════════════════════════════════════
// 1. SEVERE BLEEDING — "Compression Clamp"
//
// Two horizontal compression bars with central pressure
// chevron and tightening hash marks. Tourniquet schematic.
// ═══════════════════════════════════════════════════════════
export function GlyphSevereBleed({ color, size }: GlyphProps) {
  const stroke = sw(size);
  return (
    <View style={[glyphStyles.container, { width: size, height: size }]}>
      {/* Top compression bar */}
      <View style={{
        position: 'absolute',
        top: s(3, size),
        left: s(4, size),
        width: s(16, size),
        height: stroke,
        backgroundColor: color,
      }} />
      {/* Bottom compression bar */}
      <View style={{
        position: 'absolute',
        bottom: s(3, size),
        left: s(4, size),
        width: s(16, size),
        height: stroke,
        backgroundColor: color,
      }} />
      {/* Left vertical connector */}
      <View style={{
        position: 'absolute',
        top: s(3, size),
        left: s(4, size),
        width: stroke,
        height: s(18, size),
        backgroundColor: color,
      }} />
      {/* Right vertical connector */}
      <View style={{
        position: 'absolute',
        top: s(3, size),
        right: s(4, size),
        width: stroke,
        height: s(18, size),
        backgroundColor: color,
      }} />
      {/* Central pressure chevron — left arm (45°) */}
      <View style={{
        position: 'absolute',
        top: s(7, size),
        left: s(8.5, size),
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Central pressure chevron — right arm (45°) */}
      <View style={{
        position: 'absolute',
        top: s(7, size),
        right: s(8.5, size),
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Tightening hash — left */}
      <View style={{
        position: 'absolute',
        top: s(13, size),
        left: s(7, size),
        width: s(3, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.6,
      }} />
      {/* Tightening hash — right */}
      <View style={{
        position: 'absolute',
        top: s(13, size),
        right: s(7, size),
        width: s(3, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.6,
      }} />
      {/* Center vertical pressure line */}
      <View style={{
        position: 'absolute',
        top: s(10, size),
        left: size / 2 - stroke / 2,
        width: stroke,
        height: s(6, size),
        backgroundColor: color,
        opacity: 0.5,
      }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 2. HYPOTHERMIA — "Thermal Containment Shell"
//
// Nested rectangles = layered insulation. 45° corner
// reinforcement brackets. Core element at center.
// ═══════════════════════════════════════════════════════════
export function GlyphHypothermia({ color, size }: GlyphProps) {
  const stroke = sw(size);
  return (
    <View style={[glyphStyles.container, { width: size, height: size }]}>
      {/* Outer containment rectangle */}
      <View style={{
        position: 'absolute',
        top: s(2, size),
        left: s(2, size),
        width: s(20, size),
        height: s(20, size),
        borderWidth: stroke,
        borderColor: color,
      }} />
      {/* Inner insulation rectangle */}
      <View style={{
        position: 'absolute',
        top: s(6, size),
        left: s(6, size),
        width: s(12, size),
        height: s(12, size),
        borderWidth: stroke,
        borderColor: color,
        opacity: 0.65,
      }} />
      {/* Core element */}
      <View style={{
        position: 'absolute',
        top: s(10, size),
        left: s(10, size),
        width: s(4, size),
        height: s(4, size),
        backgroundColor: color,
      }} />
      {/* 45° corner bracket — top-left */}
      <View style={{
        position: 'absolute',
        top: s(0.5, size),
        left: s(0.5, size),
        width: s(4, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.45,
        transform: [{ rotate: '45deg' }],
        transformOrigin: 'left center',
      }} />
      {/* 45° corner bracket — top-right */}
      <View style={{
        position: 'absolute',
        top: s(0.5, size),
        right: s(0.5, size),
        width: s(4, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.45,
        transform: [{ rotate: '-45deg' }],
        transformOrigin: 'right center',
      }} />
      {/* 45° corner bracket — bottom-left */}
      <View style={{
        position: 'absolute',
        bottom: s(0.5, size),
        left: s(0.5, size),
        width: s(4, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.45,
        transform: [{ rotate: '-45deg' }],
        transformOrigin: 'left center',
      }} />
      {/* 45° corner bracket — bottom-right */}
      <View style={{
        position: 'absolute',
        bottom: s(0.5, size),
        right: s(0.5, size),
        width: s(4, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.45,
        transform: [{ rotate: '45deg' }],
        transformOrigin: 'right center',
      }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 3. HEAT STROKE — "Thermal Overload"
//
// Vertical axis with threshold line. Three upward 45°
// chevrons above threshold = heat exceeding limit.
// Tick marks on axis = measurement scale.
// ═══════════════════════════════════════════════════════════
export function GlyphHeatStroke({ color, size }: GlyphProps) {
  const stroke = sw(size);
  return (
    <View style={[glyphStyles.container, { width: size, height: size }]}>
      {/* Vertical measurement axis */}
      <View style={{
        position: 'absolute',
        top: s(2, size),
        left: s(5, size),
        width: stroke,
        height: s(20, size),
        backgroundColor: color,
      }} />
      {/* Threshold line (horizontal) */}
      <View style={{
        position: 'absolute',
        top: s(10, size),
        left: s(3, size),
        width: s(8, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      {/* Tick marks on axis */}
      {[0, 1, 2, 3].map(i => (
        <View key={`tick${i}`} style={{
          position: 'absolute',
          top: s(4 + i * 4.5, size),
          left: s(3.5, size),
          width: s(3, size),
          height: stroke * 0.7,
          backgroundColor: color,
          opacity: 0.35,
        }} />
      ))}
      {/* Upward chevron 1 (top) — left arm */}
      <View style={{
        position: 'absolute',
        top: s(2.5, size),
        left: s(13, size),
        width: s(4.5, size),
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Upward chevron 1 — right arm */}
      <View style={{
        position: 'absolute',
        top: s(2.5, size),
        left: s(16, size),
        width: s(4.5, size),
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Upward chevron 2 (middle) — left arm */}
      <View style={{
        position: 'absolute',
        top: s(7.5, size),
        left: s(13, size),
        width: s(4.5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.7,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Upward chevron 2 — right arm */}
      <View style={{
        position: 'absolute',
        top: s(7.5, size),
        left: s(16, size),
        width: s(4.5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.7,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Upward chevron 3 (bottom) — left arm */}
      <View style={{
        position: 'absolute',
        top: s(12.5, size),
        left: s(13, size),
        width: s(4.5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.4,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Upward chevron 3 — right arm */}
      <View style={{
        position: 'absolute',
        top: s(12.5, size),
        left: s(16, size),
        width: s(4.5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.4,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Critical zone fill (above threshold) */}
      <View style={{
        position: 'absolute',
        top: s(2, size),
        left: s(5, size) + stroke,
        width: s(3, size),
        height: s(8, size),
        backgroundColor: color,
        opacity: 0.08,
      }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 4. IMPALEMENT — "Object Retention Bracket"
//
// Vertical penetrating object with L-shaped stabilization
// brackets on each side. X mark below = do not extract.
// ═══════════════════════════════════════════════════════════
export function GlyphImpalement({ color, size }: GlyphProps) {
  const stroke = sw(size);
  return (
    <View style={[glyphStyles.container, { width: size, height: size }]}>
      {/* Penetrating object (vertical bar) */}
      <View style={{
        position: 'absolute',
        top: s(1, size),
        left: size / 2 - stroke / 2,
        width: stroke,
        height: s(14, size),
        backgroundColor: color,
      }} />
      {/* Left bracket — vertical */}
      <View style={{
        position: 'absolute',
        top: s(6, size),
        left: s(4, size),
        width: stroke,
        height: s(6, size),
        backgroundColor: color,
        opacity: 0.8,
      }} />
      {/* Left bracket — horizontal (top) */}
      <View style={{
        position: 'absolute',
        top: s(6, size),
        left: s(4, size),
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.8,
      }} />
      {/* Left bracket — horizontal (bottom) */}
      <View style={{
        position: 'absolute',
        top: s(12, size) - stroke,
        left: s(4, size),
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.8,
      }} />
      {/* Right bracket — vertical */}
      <View style={{
        position: 'absolute',
        top: s(6, size),
        right: s(4, size),
        width: stroke,
        height: s(6, size),
        backgroundColor: color,
        opacity: 0.8,
      }} />
      {/* Right bracket — horizontal (top) */}
      <View style={{
        position: 'absolute',
        top: s(6, size),
        right: s(4, size),
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.8,
      }} />
      {/* Right bracket — horizontal (bottom) */}
      <View style={{
        position: 'absolute',
        top: s(12, size) - stroke,
        right: s(4, size),
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.8,
      }} />
      {/* X mark — do not extract — stroke 1 */}
      <View style={{
        position: 'absolute',
        top: s(18, size),
        left: size / 2 - s(3, size),
        width: s(6, size),
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* X mark — stroke 2 */}
      <View style={{
        position: 'absolute',
        top: s(18, size),
        left: size / 2 - s(3, size),
        width: s(6, size),
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Base reference line */}
      <View style={{
        position: 'absolute',
        bottom: s(1, size),
        left: s(3, size),
        width: s(18, size),
        height: stroke * 0.6,
        backgroundColor: color,
        opacity: 0.25,
      }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 5. VEHICLE ROLL — "Chassis Inversion"
//
// Rectangle at 45° tilt (chassis). Horizontal ground line.
// Impact burst at contact corner. Roll direction indicator.
// ═══════════════════════════════════════════════════════════
export function GlyphVehicleRoll({ color, size }: GlyphProps) {
  const stroke = sw(size);
  return (
    <View style={[glyphStyles.container, { width: size, height: size }]}>
      {/* Tilted chassis rectangle */}
      <View style={{
        position: 'absolute',
        top: s(4, size),
        left: s(5, size),
        width: s(14, size),
        height: s(8, size),
        borderWidth: stroke,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Ground reference line */}
      <View style={{
        position: 'absolute',
        bottom: s(3, size),
        left: s(2, size),
        width: s(20, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.35,
      }} />
      {/* Impact burst — line 1 (45° from corner) */}
      <View style={{
        position: 'absolute',
        bottom: s(4, size),
        left: s(3, size),
        width: s(4, size),
        height: stroke * 0.8,
        backgroundColor: color,
        opacity: 0.6,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Impact burst — line 2 (horizontal) */}
      <View style={{
        position: 'absolute',
        bottom: s(5.5, size),
        left: s(2, size),
        width: s(3.5, size),
        height: stroke * 0.8,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      {/* Impact burst — line 3 (vertical) */}
      <View style={{
        position: 'absolute',
        bottom: s(4, size),
        left: s(4.5, size),
        width: stroke * 0.8,
        height: s(3.5, size),
        backgroundColor: color,
        opacity: 0.5,
      }} />
      {/* Roll direction arrow — shaft */}
      <View style={{
        position: 'absolute',
        top: s(2, size),
        right: s(4, size),
        width: s(5, size),
        height: stroke * 0.8,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      {/* Roll direction arrow — head (45°) */}
      <View style={{
        position: 'absolute',
        top: s(0.5, size),
        right: s(3.5, size),
        width: s(3, size),
        height: stroke * 0.8,
        backgroundColor: color,
        opacity: 0.5,
        transform: [{ rotate: '45deg' }],
      }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 6. ALTITUDE SICKNESS — "Elevation Descent"
//
// Stepped descent staircase pattern. Horizontal reference
// lines at elevation levels. Downward arrow = descend.
// Pressure indicator tick marks.
// ═══════════════════════════════════════════════════════════
export function GlyphAltitude({ color, size }: GlyphProps) {
  const stroke = sw(size);
  return (
    <View style={[glyphStyles.container, { width: size, height: size }]}>
      {/* Step 1 — top platform */}
      <View style={{
        position: 'absolute',
        top: s(3, size),
        left: s(3, size),
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
      }} />
      {/* Step 1 — drop */}
      <View style={{
        position: 'absolute',
        top: s(3, size),
        left: s(8, size) - stroke,
        width: stroke,
        height: s(5, size),
        backgroundColor: color,
      }} />
      {/* Step 2 — platform */}
      <View style={{
        position: 'absolute',
        top: s(8, size) - stroke,
        left: s(8, size) - stroke,
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
      }} />
      {/* Step 2 — drop */}
      <View style={{
        position: 'absolute',
        top: s(8, size) - stroke,
        left: s(13, size) - stroke * 2,
        width: stroke,
        height: s(5, size),
        backgroundColor: color,
      }} />
      {/* Step 3 — bottom platform */}
      <View style={{
        position: 'absolute',
        top: s(13, size) - stroke * 2,
        left: s(13, size) - stroke * 2,
        width: s(5, size),
        height: stroke,
        backgroundColor: color,
      }} />
      {/* Elevation reference lines (dashed effect) */}
      {[0, 1, 2].map(i => (
        <View key={`ref${i}`} style={{
          position: 'absolute',
          top: s(3 + i * 5, size),
          right: s(3, size),
          width: s(3, size),
          height: stroke * 0.6,
          backgroundColor: color,
          opacity: 0.25,
        }} />
      ))}
      {/* Downward arrow — shaft */}
      <View style={{
        position: 'absolute',
        top: s(15, size),
        left: size / 2 - stroke / 2,
        width: stroke,
        height: s(5, size),
        backgroundColor: color,
        opacity: 0.7,
      }} />
      {/* Downward arrow — head left (45°) */}
      <View style={{
        position: 'absolute',
        top: s(18.5, size),
        left: size / 2 - s(2.5, size),
        width: s(3, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.7,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* Downward arrow — head right (45°) */}
      <View style={{
        position: 'absolute',
        top: s(18.5, size),
        left: size / 2 + s(0, size),
        width: s(3, size),
        height: stroke,
        backgroundColor: color,
        opacity: 0.7,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Pressure tick marks — left side */}
      {[0, 1, 2, 3].map(i => (
        <View key={`ptick${i}`} style={{
          position: 'absolute',
          top: s(4 + i * 3.5, size),
          left: s(1, size),
          width: s(1.5, size),
          height: stroke * 0.6,
          backgroundColor: color,
          opacity: 0.3,
        }} />
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// Glyph Picker — maps protocol ID to component
// ═══════════════════════════════════════════════════════════
export function getTacticalGlyph(protocolId: string, color: string, size: number) {
  const props = { color, size };
  switch (protocolId) {
    case 'severe-bleeding':   return <GlyphSevereBleed {...props} />;
    case 'hypothermia':       return <GlyphHypothermia {...props} />;
    case 'heat-stroke':       return <GlyphHeatStroke {...props} />;
    case 'impalement':        return <GlyphImpalement {...props} />;
    case 'vehicle-roll':      return <GlyphVehicleRoll {...props} />;
    case 'altitude-sickness': return <GlyphAltitude {...props} />;
    default: return null;
  }
}

const glyphStyles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
  },
});



