/**
 * Emergency Protocol Illustrations — Tactical Schematic Style
 *
 * Large-format tactical illustrations for the protocol modal.
 * Aircraft emergency card / military technical manual aesthetic.
 *
 * Design constraints:
 * - Monoline construction (2.5px base stroke, scaled)
 * - 90° and 45° angles ONLY — no rounded internal curves
 * - Black background (inherited from modal)
 * - White silhouettes + accent color highlights
 * - No gradients, no shadows, no realism
 * - No classic medical symbols (no cross, droplet, flame, snowflake)
 * - Operational, field-ready, mechanical feel
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';

interface IllustrationProps {
  accentColor: string;
  size?: number;
}

const BASE = 100;
function p(val: number, size: number) { return (val / BASE) * size; }
function sw(size: number) { return Math.max(1.5, (2.5 / BASE) * size); }

// ═══════════════════════════════════════════════════════════
// 1. SEVERE BLEEDING — Compression Clamp Schematic
//
// Large tourniquet/pressure device diagram. Two compression
// plates with central pressure mechanism and tightening
// ratchet indicators.
// ═══════════════════════════════════════════════════════════
export function SevereBleedingIllustration({ accentColor, size = 100 }: IllustrationProps) {
  const stroke = sw(size);
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Top compression plate */}
      <View style={[styles.abs, {
        top: p(10, size), left: p(15, size),
        width: p(70, size), height: stroke,
        backgroundColor: accentColor,
      }]} />
      {/* Bottom compression plate */}
      <View style={[styles.abs, {
        top: p(70, size), left: p(15, size),
        width: p(70, size), height: stroke,
        backgroundColor: accentColor,
      }]} />
      {/* Left vertical frame */}
      <View style={[styles.abs, {
        top: p(10, size), left: p(15, size),
        width: stroke, height: p(60, size),
        backgroundColor: '#FFFFFF', opacity: 0.5,
      }]} />
      {/* Right vertical frame */}
      <View style={[styles.abs, {
        top: p(10, size), left: p(85, size) - stroke,
        width: stroke, height: p(60, size),
        backgroundColor: '#FFFFFF', opacity: 0.5,
      }]} />
      {/* Central pressure chevron — left arm */}
      <View style={[styles.abs, {
        top: p(24, size), left: p(34, size),
        width: p(18, size), height: stroke,
        backgroundColor: accentColor,
        transform: [{ rotate: '45deg' }],
      }]} />
      {/* Central pressure chevron — right arm */}
      <View style={[styles.abs, {
        top: p(24, size), right: p(34, size),
        width: p(18, size), height: stroke,
        backgroundColor: accentColor,
        transform: [{ rotate: '-45deg' }],
      }]} />
      {/* Second chevron (lower) — left */}
      <View style={[styles.abs, {
        top: p(34, size), left: p(34, size),
        width: p(18, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.5,
        transform: [{ rotate: '45deg' }],
      }]} />
      {/* Second chevron (lower) — right */}
      <View style={[styles.abs, {
        top: p(34, size), right: p(34, size),
        width: p(18, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.5,
        transform: [{ rotate: '-45deg' }],
      }]} />
      {/* Central vertical pressure line */}
      <View style={[styles.abs, {
        top: p(38, size), left: p(50, size) - stroke / 2,
        width: stroke, height: p(20, size),
        backgroundColor: accentColor, opacity: 0.6,
      }]} />
      {/* Tightening ratchet marks — left */}
      {[0, 1, 2].map(i => (
        <View key={`tl${i}`} style={[styles.abs, {
          top: p(42 + i * 8, size), left: p(22, size),
          width: p(8, size), height: stroke * 0.7,
          backgroundColor: '#FFFFFF', opacity: 0.3,
        }]} />
      ))}
      {/* Tightening ratchet marks — right */}
      {[0, 1, 2].map(i => (
        <View key={`tr${i}`} style={[styles.abs, {
          top: p(42 + i * 8, size), right: p(22, size),
          width: p(8, size), height: stroke * 0.7,
          backgroundColor: '#FFFFFF', opacity: 0.3,
        }]} />
      ))}
      {/* Time marker — bottom center */}
      <View style={[styles.abs, {
        top: p(78, size), left: p(40, size),
        width: p(20, size), height: stroke * 0.7,
        backgroundColor: accentColor, opacity: 0.35,
      }]} />
      <View style={[styles.abs, {
        top: p(82, size), left: p(48, size),
        width: stroke, height: p(6, size),
        backgroundColor: accentColor, opacity: 0.35,
      }]} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 2. HYPOTHERMIA — Thermal Containment Shell
//
// Nested containment layers around a core element.
// Corner reinforcement brackets at 45°. Layered insulation
// perimeters with decreasing opacity.
// ═══════════════════════════════════════════════════════════
export function HypothermiaIllustration({ accentColor, size = 100 }: IllustrationProps) {
  const stroke = sw(size);
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer containment perimeter */}
      <View style={[styles.abs, {
        top: p(8, size), left: p(8, size),
        width: p(84, size), height: p(84, size),
        borderWidth: stroke, borderColor: accentColor, opacity: 0.35,
      }]} />
      {/* Middle insulation layer */}
      <View style={[styles.abs, {
        top: p(20, size), left: p(20, size),
        width: p(60, size), height: p(60, size),
        borderWidth: stroke, borderColor: accentColor, opacity: 0.55,
      }]} />
      {/* Inner insulation layer */}
      <View style={[styles.abs, {
        top: p(32, size), left: p(32, size),
        width: p(36, size), height: p(36, size),
        borderWidth: stroke, borderColor: accentColor, opacity: 0.75,
      }]} />
      {/* Core element */}
      <View style={[styles.abs, {
        top: p(44, size), left: p(44, size),
        width: p(12, size), height: p(12, size),
        backgroundColor: accentColor,
      }]} />
      {/* 45° corner brackets — top-left */}
      <View style={[styles.abs, {
        top: p(4, size), left: p(4, size),
        width: p(12, size), height: stroke,
        backgroundColor: '#FFFFFF', opacity: 0.4,
        transform: [{ rotate: '45deg' }],
        transformOrigin: 'left center',
      }]} />
      {/* 45° corner brackets — top-right */}
      <View style={[styles.abs, {
        top: p(4, size), right: p(4, size),
        width: p(12, size), height: stroke,
        backgroundColor: '#FFFFFF', opacity: 0.4,
        transform: [{ rotate: '-45deg' }],
        transformOrigin: 'right center',
      }]} />
      {/* 45° corner brackets — bottom-left */}
      <View style={[styles.abs, {
        bottom: p(4, size), left: p(4, size),
        width: p(12, size), height: stroke,
        backgroundColor: '#FFFFFF', opacity: 0.4,
        transform: [{ rotate: '-45deg' }],
        transformOrigin: 'left center',
      }]} />
      {/* 45° corner brackets — bottom-right */}
      <View style={[styles.abs, {
        bottom: p(4, size), right: p(4, size),
        width: p(12, size), height: stroke,
        backgroundColor: '#FFFFFF', opacity: 0.4,
        transform: [{ rotate: '45deg' }],
        transformOrigin: 'right center',
      }]} />
      {/* Thermal barrier indicators — horizontal */}
      {[0, 1].map(i => (
        <View key={`hb${i}`} style={[styles.abs, {
          top: p(26 + i * 48, size), left: p(14, size),
          width: p(72, size), height: stroke * 0.5,
          backgroundColor: accentColor, opacity: 0.15,
        }]} />
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 3. HEAT STROKE — Thermal Overload Warning
//
// Vertical measurement axis with threshold line.
// Upward chevrons above critical threshold.
// Tick marks and critical zone fill.
// ═══════════════════════════════════════════════════════════
export function HeatStrokeIllustration({ accentColor, size = 100 }: IllustrationProps) {
  const stroke = sw(size);
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Vertical measurement axis */}
      <View style={[styles.abs, {
        top: p(8, size), left: p(18, size),
        width: stroke, height: p(80, size),
        backgroundColor: '#FFFFFF', opacity: 0.5,
      }]} />
      {/* Threshold line (horizontal) */}
      <View style={[styles.abs, {
        top: p(40, size), left: p(10, size),
        width: p(22, size), height: stroke,
        backgroundColor: accentColor,
      }]} />
      {/* Critical zone fill (above threshold) */}
      <View style={[styles.abs, {
        top: p(8, size), left: p(18, size) + stroke,
        width: p(10, size), height: p(32, size),
        backgroundColor: accentColor, opacity: 0.06,
      }]} />
      {/* Tick marks on axis */}
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <View key={`tk${i}`} style={[styles.abs, {
          top: p(12 + i * 10, size), left: p(12, size),
          width: p(6, size), height: stroke * 0.6,
          backgroundColor: '#FFFFFF', opacity: 0.25,
        }]} />
      ))}
      {/* Upward chevrons — set of 4 */}
      {[0, 1, 2, 3].map(i => (
        <React.Fragment key={`chev${i}`}>
          {/* Left arm */}
          <View style={[styles.abs, {
            top: p(10 + i * 14, size), left: p(45, size),
            width: p(14, size), height: stroke,
            backgroundColor: accentColor,
            opacity: 1 - i * 0.2,
            transform: [{ rotate: '-45deg' }],
          }]} />
          {/* Right arm */}
          <View style={[styles.abs, {
            top: p(10 + i * 14, size), left: p(55, size),
            width: p(14, size), height: stroke,
            backgroundColor: accentColor,
            opacity: 1 - i * 0.2,
            transform: [{ rotate: '45deg' }],
          }]} />
        </React.Fragment>
      ))}
      {/* Overload indicator — bottom right */}
      <View style={[styles.abs, {
        bottom: p(10, size), right: p(12, size),
        width: p(16, size), height: p(16, size),
        borderWidth: stroke, borderColor: accentColor, opacity: 0.3,
      }]} />
      {/* Overload X inside */}
      <View style={[styles.abs, {
        bottom: p(14, size), right: p(16, size),
        width: p(8, size), height: stroke * 0.7,
        backgroundColor: accentColor, opacity: 0.3,
        transform: [{ rotate: '45deg' }],
      }]} />
      <View style={[styles.abs, {
        bottom: p(14, size), right: p(16, size),
        width: p(8, size), height: stroke * 0.7,
        backgroundColor: accentColor, opacity: 0.3,
        transform: [{ rotate: '-45deg' }],
      }]} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 4. IMPALEMENT — Object Retention Bracket
//
// Penetrating object (vertical bar) with stabilization
// brackets on each side. DO NOT EXTRACT marker (X).
// Padding blocks around object. Base reference.
// ═══════════════════════════════════════════════════════════
export function ImpalementIllustration({ accentColor, size = 100 }: IllustrationProps) {
  const stroke = sw(size);
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Torso outline — rectangular (no curves) */}
      <View style={[styles.abs, {
        top: p(18, size), left: p(30, size),
        width: p(40, size), height: p(55, size),
        borderWidth: stroke, borderColor: '#FFFFFF', opacity: 0.3,
      }]} />
      {/* Penetrating object (diagonal at 45°) */}
      <View style={[styles.abs, {
        top: p(8, size), left: p(54, size),
        width: stroke * 1.5, height: p(45, size),
        backgroundColor: accentColor,
        transform: [{ rotate: '-20deg' }],
      }]} />
      {/* Left stabilization bracket — vertical */}
      <View style={[styles.abs, {
        top: p(30, size), left: p(36, size),
        width: stroke, height: p(20, size),
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Left bracket — top horizontal */}
      <View style={[styles.abs, {
        top: p(30, size), left: p(36, size),
        width: p(14, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Left bracket — bottom horizontal */}
      <View style={[styles.abs, {
        top: p(50, size) - stroke, left: p(36, size),
        width: p(14, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Right stabilization bracket — vertical */}
      <View style={[styles.abs, {
        top: p(30, size), right: p(30, size),
        width: stroke, height: p(20, size),
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Right bracket — top horizontal */}
      <View style={[styles.abs, {
        top: p(30, size), right: p(30, size),
        width: p(14, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Right bracket — bottom horizontal */}
      <View style={[styles.abs, {
        top: p(50, size) - stroke, right: p(30, size),
        width: p(14, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Padding blocks around object */}
      {[0, 1].map(i => (
        <View key={`pad${i}`} style={[styles.abs, {
          top: p(35 + i * 10, size), left: p(56 + i * 2, size),
          width: p(8, size), height: p(4, size),
          borderWidth: stroke * 0.7, borderColor: '#FFFFFF', opacity: 0.35,
        }]} />
      ))}
      {/* DO NOT EXTRACT — X mark */}
      <View style={[styles.abs, {
        top: p(78, size), left: p(42, size),
        width: p(16, size), height: stroke,
        backgroundColor: accentColor,
        transform: [{ rotate: '45deg' }],
      }]} />
      <View style={[styles.abs, {
        top: p(78, size), left: p(42, size),
        width: p(16, size), height: stroke,
        backgroundColor: accentColor,
        transform: [{ rotate: '-45deg' }],
      }]} />
      {/* Base reference line */}
      <View style={[styles.abs, {
        bottom: p(5, size), left: p(20, size),
        width: p(60, size), height: stroke * 0.5,
        backgroundColor: '#FFFFFF', opacity: 0.15,
      }]} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 5. VEHICLE ROLL — Chassis Inversion Schematic
//
// Tilted vehicle chassis rectangle at 45°. Ground reference.
// Impact burst at contact point. Roll direction indicator.
// Structural frame lines.
// ═══════════════════════════════════════════════════════════
export function VehicleRollIllustration({ accentColor, size = 100 }: IllustrationProps) {
  const stroke = sw(size);
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Tilted chassis — main body */}
      <View style={[styles.abs, {
        top: p(15, size), left: p(20, size),
        width: p(50, size), height: p(25, size),
        borderWidth: stroke, borderColor: '#FFFFFF', opacity: 0.6,
        transform: [{ rotate: '45deg' }],
      }]} />
      {/* Chassis internal frame line */}
      <View style={[styles.abs, {
        top: p(22, size), left: p(28, size),
        width: p(34, size), height: stroke * 0.7,
        backgroundColor: '#FFFFFF', opacity: 0.2,
        transform: [{ rotate: '45deg' }],
      }]} />
      {/* Axle indicators (squares, not circles) */}
      <View style={[styles.abs, {
        top: p(42, size), left: p(14, size),
        width: p(8, size), height: p(8, size),
        borderWidth: stroke, borderColor: accentColor,
      }]} />
      <View style={[styles.abs, {
        top: p(22, size), right: p(18, size),
        width: p(8, size), height: p(8, size),
        borderWidth: stroke, borderColor: accentColor,
      }]} />
      {/* Ground reference line */}
      <View style={[styles.abs, {
        bottom: p(14, size), left: p(8, size),
        width: p(84, size), height: stroke,
        backgroundColor: '#FFFFFF', opacity: 0.25,
      }]} />
      {/* Impact burst — 3 lines radiating from contact point */}
      <View style={[styles.abs, {
        bottom: p(16, size), left: p(10, size),
        width: p(14, size), height: stroke * 0.8,
        backgroundColor: accentColor, opacity: 0.7,
        transform: [{ rotate: '-45deg' }],
      }]} />
      <View style={[styles.abs, {
        bottom: p(20, size), left: p(8, size),
        width: p(12, size), height: stroke * 0.8,
        backgroundColor: accentColor, opacity: 0.5,
      }]} />
      <View style={[styles.abs, {
        bottom: p(16, size), left: p(14, size),
        width: stroke * 0.8, height: p(12, size),
        backgroundColor: accentColor, opacity: 0.5,
      }]} />
      {/* Roll direction arrow — shaft */}
      <View style={[styles.abs, {
        top: p(8, size), right: p(14, size),
        width: p(18, size), height: stroke * 0.8,
        backgroundColor: accentColor, opacity: 0.5,
      }]} />
      {/* Roll direction arrow — head */}
      <View style={[styles.abs, {
        top: p(4, size), right: p(12, size),
        width: p(8, size), height: stroke * 0.8,
        backgroundColor: accentColor, opacity: 0.5,
        transform: [{ rotate: '45deg' }],
      }]} />
      {/* Debris marks */}
      {[0, 1, 2].map(i => (
        <View key={`db${i}`} style={[styles.abs, {
          bottom: p(10 + i * 3, size), left: p(24 + i * 16, size),
          width: p(4, size), height: stroke * 0.5,
          backgroundColor: accentColor, opacity: 0.25,
        }]} />
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 6. ALTITUDE SICKNESS — Elevation Descent Schematic
//
// Stepped descent staircase. Horizontal reference lines at
// elevation levels. Downward arrow directive. Pressure
// indicator tick marks.
// ═══════════════════════════════════════════════════════════
export function AltitudeSicknessIllustration({ accentColor, size = 100 }: IllustrationProps) {
  const stroke = sw(size);
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Step 1 — top platform */}
      <View style={[styles.abs, {
        top: p(12, size), left: p(10, size),
        width: p(20, size), height: stroke,
        backgroundColor: accentColor,
      }]} />
      {/* Step 1 — vertical drop */}
      <View style={[styles.abs, {
        top: p(12, size), left: p(30, size) - stroke,
        width: stroke, height: p(18, size),
        backgroundColor: accentColor,
      }]} />
      {/* Step 2 — platform */}
      <View style={[styles.abs, {
        top: p(30, size) - stroke, left: p(30, size) - stroke,
        width: p(20, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Step 2 — vertical drop */}
      <View style={[styles.abs, {
        top: p(30, size) - stroke, left: p(50, size) - stroke * 2,
        width: stroke, height: p(18, size),
        backgroundColor: accentColor, opacity: 0.8,
      }]} />
      {/* Step 3 — platform */}
      <View style={[styles.abs, {
        top: p(48, size) - stroke * 2, left: p(50, size) - stroke * 2,
        width: p(20, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.6,
      }]} />
      {/* Step 3 — vertical drop */}
      <View style={[styles.abs, {
        top: p(48, size) - stroke * 2, left: p(70, size) - stroke * 3,
        width: stroke, height: p(18, size),
        backgroundColor: accentColor, opacity: 0.6,
      }]} />
      {/* Step 4 — bottom platform */}
      <View style={[styles.abs, {
        top: p(66, size) - stroke * 3, left: p(70, size) - stroke * 3,
        width: p(20, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.4,
      }]} />
      {/* Elevation reference lines (horizontal, faint) */}
      {[0, 1, 2, 3].map(i => (
        <View key={`elv${i}`} style={[styles.abs, {
          top: p(12 + i * 18, size), left: p(80, size),
          width: p(12, size), height: stroke * 0.5,
          backgroundColor: '#FFFFFF', opacity: 0.15,
        }]} />
      ))}
      {/* Pressure tick marks — left column */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <View key={`ptk${i}`} style={[styles.abs, {
          top: p(14 + i * 11, size), left: p(4, size),
          width: p(4, size), height: stroke * 0.5,
          backgroundColor: '#FFFFFF', opacity: 0.2,
        }]} />
      ))}
      {/* Downward arrow — shaft */}
      <View style={[styles.abs, {
        top: p(72, size), left: p(48, size),
        width: stroke, height: p(16, size),
        backgroundColor: accentColor, opacity: 0.7,
      }]} />
      {/* Downward arrow — head left (45°) */}
      <View style={[styles.abs, {
        top: p(84, size), left: p(40, size),
        width: p(10, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.7,
        transform: [{ rotate: '45deg' }],
      }]} />
      {/* Downward arrow — head right (45°) */}
      <View style={[styles.abs, {
        top: p(84, size), left: p(48, size),
        width: p(10, size), height: stroke,
        backgroundColor: accentColor, opacity: 0.7,
        transform: [{ rotate: '-45deg' }],
      }]} />
      {/* Person marker at top (square, not circle) */}
      <View style={[styles.abs, {
        top: p(4, size), left: p(16, size),
        width: p(6, size), height: p(6, size),
        borderWidth: stroke, borderColor: '#FFFFFF', opacity: 0.5,
      }]} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// Illustration Picker
// ═══════════════════════════════════════════════════════════
export function getProtocolIllustration(protocolId: string, accentColor: string, size?: number) {
  const props = { accentColor, size };
  switch (protocolId) {
    case 'severe-bleeding': return <SevereBleedingIllustration {...props} />;
    case 'hypothermia': return <HypothermiaIllustration {...props} />;
    case 'heat-stroke': return <HeatStrokeIllustration {...props} />;
    case 'impalement': return <ImpalementIllustration {...props} />;
    case 'vehicle-roll': return <VehicleRollIllustration {...props} />;
    case 'altitude-sickness': return <AltitudeSicknessIllustration {...props} />;
    default: return null;
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  abs: {
    position: 'absolute',
  },
});



