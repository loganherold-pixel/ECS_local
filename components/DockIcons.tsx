/**
 * DockIcons — ECS Tactical Monoline Vector Icons for CommandDock
 *
 * Phase 16 — ECS Navigation Icon Upgrade:
 *   • Fleet: Stylized overland vehicle silhouette with raised suspension,
 *     roof rack, bull bar, and angular tactical geometry
 *   • Navigate: Directional compass arrow with outer bezel, north pointer,
 *     cardinal tick marks, and center pivot
 *   • Discover: Mountain peak with trail path, dual summits, and
 *     winding expedition trail
 *   • Intel: Radar sweep with concentric rings, angular sweep line,
 *     signal contact blips, and cross-hair ticks
 *   • Alert: Shield + signal awareness with angular shield outline,
 *     concentric alert pulse arcs, central exclamation indicator,
 *     and cross-hair tick marks (SVG + View dual-rendering)
 *
 * Design rules:
 *   • Monoline vector — 2.8px stroke native / 2.0px SVG web
 *   • Angular geometry (no rounded caps on structural elements)
 *   • No gradients, no filled cartoon shapes
 *   • 24px grid base
 *   • Muted gold-bronze inactive / Brighter gold active
 *   • No glow halos
 *   • Web: SVG path rendering for crisp resolution-independent display
 *   • Native: View-based rendering with matching visual output
 */


import React from 'react';
import { View, Platform } from 'react-native';

interface IconProps {
  color: string;
  size?: number;
}

const STROKE = 2.8;

// ── SVG Helper — renders actual SVG on web, null on native ───
function SvgIcon({
  size,
  children,
  viewBox = '0 0 24 24',
}: {
  size: number;
  children: React.ReactElement[];
  viewBox?: string;
}) {
  if (Platform.OS !== 'web') return null;
  return React.createElement(
    'svg',
    {
      viewBox,
      width: size,
      height: size,
      style: { display: 'block' },
      xmlns: 'http://www.w3.org/2000/svg',
    },
    ...children
  );
}

// ── Utility: create SVG path element ─────────────────────────
function svgPath(d: string, color: string, opts?: {
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  key?: string;
}) {
  return React.createElement('path', {
    key: opts?.key || d.slice(0, 20) + Math.random(),
    d,
    stroke: color,
    strokeWidth: opts?.strokeWidth ?? 2.2,
    fill: opts?.fill ?? 'none',
    opacity: opts?.opacity ?? 1,
    strokeLinecap: opts?.strokeLinecap ?? 'square',
    strokeLinejoin: opts?.strokeLinejoin ?? 'miter',
  });
}

function svgCircle(cx: number, cy: number, r: number, color: string, opts?: {
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  key?: string;
}) {
  return React.createElement('circle', {
    key: opts?.key || `c${cx}${cy}${r}`,
    cx,
    cy,
    r,
    stroke: opts?.fill ? 'none' : color,
    strokeWidth: opts?.strokeWidth ?? 2.2,
    fill: opts?.fill ?? 'none',
    opacity: opts?.opacity ?? 1,
  });
}

function svgLine(x1: number, y1: number, x2: number, y2: number, color: string, opts?: {
  strokeWidth?: number;
  opacity?: number;
  key?: string;
}) {
  return React.createElement('line', {
    key: opts?.key || `l${x1}${y1}${x2}${y2}`,
    x1, y1, x2, y2,
    stroke: color,
    strokeWidth: opts?.strokeWidth ?? 2.2,
    opacity: opts?.opacity ?? 1,
    strokeLinecap: 'square',
  });
}


// ═══════════════════════════════════════════════════════════════
// FLEET — Stylized Overland Vehicle Silhouette
// ═══════════════════════════════════════════════════════════════
// Angular overland truck profile with raised suspension, roof rack,
// bull bar, prominent wheel arches, and tactical geometry.
// Represents fleet/garage management.

export function FleetIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;

  // ── Web: SVG rendering ──────────────────────────────────
  if (Platform.OS === 'web') {
    const sw = 2.0;
    const elements = [
      // Vehicle body — angular overland profile with raised ground clearance
      // Bull bar → front fender → windshield → roof → rear → tailgate → rear fender
      svgPath(
        'M 2,15.8 L 2,12.5 L 3.2,12.5 L 5,9.8 L 9.5,9.8 L 10.5,7.2 L 17,7.2 L 17.8,9.8 L 21,9.8 L 22,12.5 L 22,15.8',
        color,
        { strokeWidth: sw, key: 'body', strokeLinejoin: 'miter' }
      ),
      // Roof rack — upper bar
      svgPath(
        'M 11,7.2 L 16.5,7.2',
        color,
        { strokeWidth: sw * 0.7, opacity: 0.55, key: 'rack-top' }
      ),
      // Roof rack — cross bars (3 evenly spaced)
      svgLine(11.8, 6.0, 11.8, 7.2, color, { strokeWidth: sw * 0.6, opacity: 0.45, key: 'rack-x1' }),
      svgLine(13.8, 6.0, 13.8, 7.2, color, { strokeWidth: sw * 0.6, opacity: 0.45, key: 'rack-x2' }),
      svgLine(15.8, 6.0, 15.8, 7.2, color, { strokeWidth: sw * 0.6, opacity: 0.45, key: 'rack-x3' }),
      // Roof rack — top rail
      svgLine(11.2, 6.0, 16.2, 6.0, color, { strokeWidth: sw * 0.6, opacity: 0.45, key: 'rack-rail' }),
      // Bull bar — front protection
      svgPath(
        'M 2,12.5 L 1,12.5 L 1,14.8',
        color,
        { strokeWidth: sw * 0.85, opacity: 0.7, key: 'bullbar' }
      ),
      // Windshield divider line
      svgLine(9.5, 9.8, 10.5, 7.2, color, { strokeWidth: sw * 0.5, opacity: 0.35, key: 'windshield' }),
      // Skid plate / running board
      svgLine(5.5, 15.8, 18.5, 15.8, color, { strokeWidth: sw * 0.5, opacity: 0.25, key: 'skid' }),
      // Front wheel
      svgCircle(6.5, 17.2, 2.4, color, { strokeWidth: sw, key: 'fw-tire' }),
      svgCircle(6.5, 17.2, 1.2, color, { strokeWidth: sw * 0.6, opacity: 0.5, key: 'fw-rim' }),
      svgCircle(6.5, 17.2, 0.4, color, { fill: color, strokeWidth: 0, key: 'fw-hub' }),
      // Rear wheel
      svgCircle(17.5, 17.2, 2.4, color, { strokeWidth: sw, key: 'rw-tire' }),
      svgCircle(17.5, 17.2, 1.2, color, { strokeWidth: sw * 0.6, opacity: 0.5, key: 'rw-rim' }),
      svgCircle(17.5, 17.2, 0.4, color, { fill: color, strokeWidth: 0, key: 'rw-hub' }),
      // Ground line
      svgLine(0.5, 20.2, 23.5, 20.2, color, { strokeWidth: sw * 0.4, opacity: 0.2, key: 'ground' }),
    ];

    return (
      <View style={{ width: s, height: s }}>
        <SvgIcon size={s}>{elements}</SvgIcon>
      </View>
    );
  }

  // ── Native: View-based rendering ────────────────────────
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Vehicle body — angular overland profile */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.22,
        left: s * 0.06,
        width: s * 0.88,
        height: s * 0.32,
        borderWidth: st,
        borderColor: color,
        borderBottomWidth: 0,
      }} />
      {/* Cabin / windshield — angled top section */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.54,
        left: s * 0.38,
        width: s * 0.38,
        height: s * 0.24,
        borderWidth: st,
        borderColor: color,
        borderBottomWidth: 0,
      }} />
      {/* Roof rack — top rail */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.76,
        left: s * 0.42,
        width: s * 0.30,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      {/* Roof rack — cross bar 1 */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.72,
        left: s * 0.46,
        width: st * 0.5,
        height: s * 0.06,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      {/* Roof rack — cross bar 2 */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.72,
        left: s * 0.55,
        width: st * 0.5,
        height: s * 0.06,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      {/* Roof rack — cross bar 3 */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.72,
        left: s * 0.64,
        width: st * 0.5,
        height: s * 0.06,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      {/* Bull bar — front protection */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.30,
        left: s * 0.02,
        width: st * 0.8,
        height: s * 0.14,
        backgroundColor: color,
        opacity: 0.7,
      }} />
      <View style={{
        position: 'absolute',
        bottom: s * 0.42,
        left: s * 0.02,
        width: s * 0.06,
        height: st * 0.8,
        backgroundColor: color,
        opacity: 0.7,
      }} />
      {/* Front wheel */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.08,
        left: s * 0.12,
        width: s * 0.22,
        height: s * 0.22,
        borderWidth: st,
        borderColor: color,
        borderRadius: s * 0.11,
      }} />
      {/* Front wheel hub */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.15,
        left: s * 0.19,
        width: s * 0.08,
        height: s * 0.08,
        borderWidth: st * 0.5,
        borderColor: color,
        borderRadius: s * 0.04,
        opacity: 0.5,
      }} />
      {/* Rear wheel */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.08,
        right: s * 0.10,
        width: s * 0.22,
        height: s * 0.22,
        borderWidth: st,
        borderColor: color,
        borderRadius: s * 0.11,
      }} />
      {/* Rear wheel hub */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.15,
        right: s * 0.17,
        width: s * 0.08,
        height: s * 0.08,
        borderWidth: st * 0.5,
        borderColor: color,
        borderRadius: s * 0.04,
        opacity: 0.5,
      }} />
      {/* Ground line */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.04,
        left: s * 0.02,
        right: s * 0.02,
        height: st * 0.4,
        backgroundColor: color,
        opacity: 0.2,
      }} />
      {/* Skid plate line */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.22,
        left: s * 0.20,
        right: s * 0.20,
        height: st * 0.4,
        backgroundColor: color,
        opacity: 0.25,
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// NAVIGATE — Directional Compass Arrow
// ═══════════════════════════════════════════════════════════════
// Clean compass with outer bezel, prominent north-pointing arrow,
// cardinal direction tick marks, and center pivot point.
// Represents navigation and route guidance.

export function NavigateIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;
  const c = s / 2;

  // ── Web: SVG rendering ──────────────────────────────────
  if (Platform.OS === 'web') {
    const sw = 2.0;
    const cx = 12, cy = 12, r = 9.5;
    const elements = [
      // Outer compass bezel — circle
      svgCircle(cx, cy, r, color, { strokeWidth: sw, key: 'bezel' }),
      // North arrow — filled elongated triangle pointing up
      svgPath(
        'M 12,3.5 L 14,11 L 12,9.5 L 10,11 Z',
        color,
        { strokeWidth: sw * 0.5, fill: color, key: 'north-arrow' }
      ),
      // South arrow — thinner, dimmer
      svgPath(
        'M 12,20.5 L 10.5,13.5 L 12,14.8 L 13.5,13.5 Z',
        color,
        { strokeWidth: sw * 0.4, fill: color, opacity: 0.3, key: 'south-arrow' }
      ),
      // East tick mark
      svgLine(20.5, 12, 22, 12, color, { strokeWidth: sw * 0.7, opacity: 0.45, key: 'tick-e' }),
      // West tick mark
      svgLine(2, 12, 3.5, 12, color, { strokeWidth: sw * 0.7, opacity: 0.45, key: 'tick-w' }),
      // NE tick
      svgLine(18.2, 5.8, 19.3, 4.7, color, { strokeWidth: sw * 0.5, opacity: 0.25, key: 'tick-ne' }),
      // NW tick
      svgLine(5.8, 5.8, 4.7, 4.7, color, { strokeWidth: sw * 0.5, opacity: 0.25, key: 'tick-nw' }),
      // SE tick
      svgLine(18.2, 18.2, 19.3, 19.3, color, { strokeWidth: sw * 0.5, opacity: 0.25, key: 'tick-se' }),
      // SW tick
      svgLine(5.8, 18.2, 4.7, 19.3, color, { strokeWidth: sw * 0.5, opacity: 0.25, key: 'tick-sw' }),
      // Center pivot dot
      svgCircle(cx, cy, 1.2, color, { fill: color, strokeWidth: 0, key: 'pivot' }),
      // Inner ring (subtle)
      svgCircle(cx, cy, 4.5, color, { strokeWidth: sw * 0.4, opacity: 0.2, key: 'inner-ring' }),
    ];

    return (
      <View style={{ width: s, height: s }}>
        <SvgIcon size={s}>{elements}</SvgIcon>
      </View>
    );
  }

  // ── Native: View-based rendering ────────────────────────
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer compass bezel */}
      <View style={{
        width: s * 0.82,
        height: s * 0.82,
        borderWidth: st,
        borderColor: color,
        borderRadius: s * 0.41,
      }} />
      {/* Inner ring (subtle) */}
      <View style={{
        position: 'absolute',
        width: s * 0.38,
        height: s * 0.38,
        borderWidth: st * 0.4,
        borderColor: color,
        borderRadius: s * 0.19,
        opacity: 0.2,
      }} />
      {/* North arrow — filled triangle pointing up */}
      <View style={{
        position: 'absolute',
        top: s * 0.08,
        left: c - s * 0.1,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.1,
        borderRightWidth: s * 0.1,
        borderBottomWidth: s * 0.34,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }} />
      {/* South arrow — dimmer, thinner */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.08,
        left: c - s * 0.06,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.06,
        borderRightWidth: s * 0.06,
        borderTopWidth: s * 0.28,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
        opacity: 0.3,
      }} />
      {/* East tick */}
      <View style={{
        position: 'absolute',
        right: s * 0.02,
        top: c - st * 0.4,
        width: s * 0.1,
        height: st * 0.7,
        backgroundColor: color,
        opacity: 0.45,
      }} />
      {/* West tick */}
      <View style={{
        position: 'absolute',
        left: s * 0.02,
        top: c - st * 0.4,
        width: s * 0.1,
        height: st * 0.7,
        backgroundColor: color,
        opacity: 0.45,
      }} />
      {/* NE tick */}
      <View style={{
        position: 'absolute',
        top: s * 0.14,
        right: s * 0.14,
        width: s * 0.07,
        height: st * 0.5,
        backgroundColor: color,
        opacity: 0.25,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* NW tick */}
      <View style={{
        position: 'absolute',
        top: s * 0.14,
        left: s * 0.14,
        width: s * 0.07,
        height: st * 0.5,
        backgroundColor: color,
        opacity: 0.25,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* SE tick */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.14,
        right: s * 0.14,
        width: s * 0.07,
        height: st * 0.5,
        backgroundColor: color,
        opacity: 0.25,
        transform: [{ rotate: '45deg' }],
      }} />
      {/* SW tick */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.14,
        left: s * 0.14,
        width: s * 0.07,
        height: st * 0.5,
        backgroundColor: color,
        opacity: 0.25,
        transform: [{ rotate: '-45deg' }],
      }} />
      {/* Center pivot dot */}
      <View style={{
        position: 'absolute',
        width: s * 0.1,
        height: s * 0.1,
        backgroundColor: color,
        borderRadius: s * 0.05,
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// EXPEDITION — Compass rose with angular cardinal points
// ═══════════════════════════════════════════════════════════════
// (Unchanged — not part of icon upgrade)

export function ExpeditionIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;
  const center = s / 2;
  const outerR = s * 0.38;

  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        width: outerR * 2,
        height: outerR * 2,
        borderWidth: st,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
      <View style={{
        position: 'absolute',
        top: s * 0.04,
        left: center - st / 2,
        width: st,
        height: s * 0.18,
        backgroundColor: color,
      }} />
      <View style={{
        position: 'absolute',
        bottom: s * 0.04,
        left: center - st / 2,
        width: st,
        height: s * 0.14,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      <View style={{
        position: 'absolute',
        right: s * 0.04,
        top: center - st / 2,
        width: s * 0.14,
        height: st,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      <View style={{
        position: 'absolute',
        left: s * 0.04,
        top: center - st / 2,
        width: s * 0.14,
        height: st,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      <View style={{
        width: s * 0.12,
        height: s * 0.12,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// MAP — Angular folded map with terrain lines
// ═══════════════════════════════════════════════════════════════
// (Unchanged — not part of icon upgrade)

export function MapIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;

  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        left: s * 0.06,
        top: s * 0.1,
        width: s * 0.34,
        height: s * 0.76,
        borderWidth: st,
        borderColor: color,
      }} />
      <View style={{
        position: 'absolute',
        right: s * 0.06,
        top: s * 0.14,
        width: s * 0.34,
        height: s * 0.72,
        borderWidth: st,
        borderColor: color,
      }} />
      <View style={{
        position: 'absolute',
        left: s * 0.48,
        top: s * 0.12,
        width: st * 0.6,
        height: s * 0.74,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      <View style={{
        position: 'absolute',
        left: s * 0.14,
        top: s * 0.34,
        width: s * 0.22,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      <View style={{
        position: 'absolute',
        right: s * 0.14,
        top: s * 0.5,
        width: s * 0.22,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      <View style={{
        position: 'absolute',
        left: s * 0.14,
        top: s * 0.62,
        width: s * 0.18,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.35,
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// LOADOUT — Angular container/crate with internal grid
// ═══════════════════════════════════════════════════════════════
// (Unchanged — not part of icon upgrade)

export function LoadoutIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;

  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: s * 0.82,
        height: s * 0.7,
        borderWidth: st,
        borderColor: color,
        position: 'relative',
      }}>
        <View style={{
          position: 'absolute',
          top: s * 0.14,
          left: 0,
          right: 0,
          height: st * 0.7,
          backgroundColor: color,
          opacity: 0.6,
        }} />
        <View style={{
          position: 'absolute',
          top: s * 0.16,
          left: '48%',
          width: st * 0.6,
          height: s * 0.35,
          backgroundColor: color,
          opacity: 0.4,
        }} />
        <View style={{
          position: 'absolute',
          top: '55%',
          left: s * 0.06,
          right: s * 0.06,
          height: st * 0.6,
          backgroundColor: color,
          opacity: 0.4,
        }} />
        <View style={{
          position: 'absolute',
          top: -st * 0.5,
          left: s * 0.1,
          width: s * 0.08,
          height: st,
          backgroundColor: color,
          opacity: 0.7,
        }} />
        <View style={{
          position: 'absolute',
          top: -st * 0.5,
          right: s * 0.1,
          width: s * 0.08,
          height: st,
          backgroundColor: color,
          opacity: 0.7,
        }} />
      </View>
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// DASHBOARD CREST — Shield silhouette for center dock
// ═══════════════════════════════════════════════════════════════
// (Unchanged — not part of icon upgrade)

export function DashboardCrestIcon({ color, size = 24, active = false }: IconProps & { active?: boolean }) {
  const s = size;
  const st = STROKE;
  const bodyW = s * 0.78;
  const bodyH = s * 0.52;
  const pointH = s * 0.3;

  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'flex-start', paddingTop: s * 0.04 }}>
      <View style={{
        width: bodyW,
        height: bodyH,
        borderWidth: st,
        borderColor: color,
        borderTopLeftRadius: s * 0.1,
        borderTopRightRadius: s * 0.1,
        borderBottomWidth: 0,
        backgroundColor: active ? `${color}15` : 'transparent',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: '15%',
          right: '15%',
          height: bodyH * 0.55,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            width: 0,
            height: 0,
            borderLeftWidth: bodyW * 0.22,
            borderRightWidth: bodyW * 0.22,
            borderBottomWidth: bodyH * 0.48,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: active ? `${color}20` : `${color}12`,
          }} />
        </View>
        <View style={{
          position: 'absolute',
          bottom: bodyH * 0.22,
          left: s * 0.04,
          right: s * 0.04,
          height: st * 0.6,
          backgroundColor: color,
          opacity: active ? 0.5 : 0.25,
        }} />
      </View>
      <View style={{
        width: 0,
        height: 0,
        borderLeftWidth: bodyW / 2,
        borderRightWidth: bodyW / 2,
        borderTopWidth: pointH,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
        marginTop: -st * 0.3,
        opacity: active ? 1 : 0.8,
      }} />
      <View style={{
        position: 'absolute',
        top: s * 0.04 + bodyH - st * 0.3,
        width: 0,
        height: 0,
        borderLeftWidth: (bodyW / 2) - st,
        borderRightWidth: (bodyW / 2) - st,
        borderTopWidth: pointH - st * 1.5,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: active ? `${color}15` : 'transparent',
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// CONFIG — Wrench/gear icon for vehicle configuration
// ═══════════════════════════════════════════════════════════════
// (Unchanged — not part of icon upgrade)

export function ConfigIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;
  const c = s / 2;

  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: s * 0.48,
        height: s * 0.48,
        borderWidth: st,
        borderColor: color,
        transform: [{ rotate: '22.5deg' }],
      }} />
      <View style={{
        position: 'absolute',
        width: s * 0.22,
        height: s * 0.22,
        borderWidth: st * 0.8,
        borderColor: color,
        borderRadius: s * 0.11,
      }} />
      <View style={{
        position: 'absolute',
        top: s * 0.08,
        left: c - st * 0.8,
        width: st * 1.6,
        height: s * 0.14,
        backgroundColor: color,
      }} />
      <View style={{
        position: 'absolute',
        bottom: s * 0.08,
        left: c - st * 0.8,
        width: st * 1.6,
        height: s * 0.14,
        backgroundColor: color,
      }} />
      <View style={{
        position: 'absolute',
        left: s * 0.08,
        top: c - st * 0.8,
        width: s * 0.14,
        height: st * 1.6,
        backgroundColor: color,
      }} />
      <View style={{
        position: 'absolute',
        right: s * 0.08,
        top: c - st * 0.8,
        width: s * 0.14,
        height: st * 1.6,
        backgroundColor: color,
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// SAFETY — Shield with cross/plus indicator
// ═══════════════════════════════════════════════════════════════
// (Unchanged — not part of icon upgrade)

export function SafetyIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;
  const c = s / 2;

  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: s * 0.62,
        height: s * 0.52,
        borderWidth: st,
        borderColor: color,
        borderTopLeftRadius: s * 0.08,
        borderTopRightRadius: s * 0.08,
        borderBottomWidth: 0,
      }} />
      <View style={{
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.31,
        borderRightWidth: s * 0.31,
        borderTopWidth: s * 0.22,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
        marginTop: -st * 0.3,
      }} />
      <View style={{
        position: 'absolute',
        top: s * 0.2,
        left: c - st * 0.5,
        width: st,
        height: s * 0.32,
        backgroundColor: color,
        opacity: 0.7,
      }} />
      <View style={{
        position: 'absolute',
        top: s * 0.3,
        left: c - s * 0.12,
        width: s * 0.24,
        height: st,
        backgroundColor: color,
        opacity: 0.7,
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// INTEL — Radar Sweep / Signal Intelligence
// ═══════════════════════════════════════════════════════════════
// Tactical radar display with concentric rings, angular sweep line,
// signal contact blips, and cross-hair tick marks.
// Represents strategic intelligence and awareness.

export function IntelIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;
  const c = s / 2;

  // ── Web: SVG rendering ──────────────────────────────────
  if (Platform.OS === 'web') {
    const sw = 2.0;
    const cx = 12, cy = 12;
    const elements = [
      // Outer radar ring
      svgCircle(cx, cy, 10, color, { strokeWidth: sw, key: 'outer' }),
      // Middle ring
      svgCircle(cx, cy, 6.5, color, { strokeWidth: sw * 0.6, opacity: 0.4, key: 'mid' }),
      // Inner ring
      svgCircle(cx, cy, 3.2, color, { strokeWidth: sw * 0.45, opacity: 0.25, key: 'inner' }),
      // Cross-hair — North tick
      svgLine(cx, 1.5, cx, 4, color, { strokeWidth: sw * 0.6, opacity: 0.5, key: 'ch-n' }),
      // Cross-hair — South tick
      svgLine(cx, 20, cx, 22.5, color, { strokeWidth: sw * 0.6, opacity: 0.3, key: 'ch-s' }),
      // Cross-hair — East tick
      svgLine(20, cy, 22.5, cy, color, { strokeWidth: sw * 0.6, opacity: 0.3, key: 'ch-e' }),
      // Cross-hair — West tick
      svgLine(1.5, cy, 4, cy, color, { strokeWidth: sw * 0.6, opacity: 0.3, key: 'ch-w' }),
      // Sweep line — from center toward ~2 o'clock (30°)
      svgLine(cx, cy, cx + 8.5, cy - 4.9, color, { strokeWidth: sw * 0.9, opacity: 0.75, key: 'sweep' }),
      // Sweep trail — fading arc suggestion (thin line at ~1 o'clock)
      svgLine(cx, cy, cx + 6.5, cy - 7.5, color, { strokeWidth: sw * 0.4, opacity: 0.2, key: 'sweep-trail' }),
      // Signal contact blip 1 — near sweep line
      svgCircle(cx + 5.5, cy - 3.2, 1.1, color, { fill: color, strokeWidth: 0, opacity: 0.85, key: 'blip1' }),
      // Signal contact blip 2 — further out
      svgCircle(cx + 2.5, cy - 6, 0.8, color, { fill: color, strokeWidth: 0, opacity: 0.5, key: 'blip2' }),
      // Signal contact blip 3 — opposite quadrant (faded)
      svgCircle(cx - 4, cy + 3.5, 0.7, color, { fill: color, strokeWidth: 0, opacity: 0.25, key: 'blip3' }),
      // Center dot
      svgCircle(cx, cy, 1.4, color, { fill: color, strokeWidth: 0, key: 'center' }),
    ];

    return (
      <View style={{ width: s, height: s }}>
        <SvgIcon size={s}>{elements}</SvgIcon>
      </View>
    );
  }

  // ── Native: View-based rendering ────────────────────────
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer radar ring */}
      <View style={{
        width: s * 0.84,
        height: s * 0.84,
        borderWidth: st,
        borderColor: color,
        borderRadius: s * 0.42,
      }} />
      {/* Middle ring */}
      <View style={{
        position: 'absolute',
        width: s * 0.54,
        height: s * 0.54,
        borderWidth: st * 0.55,
        borderColor: color,
        borderRadius: s * 0.27,
        opacity: 0.4,
      }} />
      {/* Inner ring */}
      <View style={{
        position: 'absolute',
        width: s * 0.27,
        height: s * 0.27,
        borderWidth: st * 0.4,
        borderColor: color,
        borderRadius: s * 0.135,
        opacity: 0.25,
      }} />
      {/* Cross-hair — North tick */}
      <View style={{
        position: 'absolute',
        top: s * 0.04,
        left: c - st * 0.3,
        width: st * 0.6,
        height: s * 0.12,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      {/* Cross-hair — South tick */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.04,
        left: c - st * 0.3,
        width: st * 0.6,
        height: s * 0.1,
        backgroundColor: color,
        opacity: 0.3,
      }} />
      {/* Cross-hair — East tick */}
      <View style={{
        position: 'absolute',
        right: s * 0.04,
        top: c - st * 0.3,
        width: s * 0.1,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.3,
      }} />
      {/* Cross-hair — West tick */}
      <View style={{
        position: 'absolute',
        left: s * 0.04,
        top: c - st * 0.3,
        width: s * 0.1,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.3,
      }} />
      {/* Sweep line — angled from center toward upper-right (~30°) */}
      <View style={{
        position: 'absolute',
        top: c,
        left: c,
        width: s * 0.38,
        height: st * 0.8,
        backgroundColor: color,
        opacity: 0.75,
        transform: [{ rotate: '-30deg' }],
        transformOrigin: 'left center',
      }} />
      {/* Sweep trail — fainter line at ~60° */}
      <View style={{
        position: 'absolute',
        top: c,
        left: c,
        width: s * 0.30,
        height: st * 0.4,
        backgroundColor: color,
        opacity: 0.2,
        transform: [{ rotate: '-55deg' }],
        transformOrigin: 'left center',
      }} />
      {/* Signal blip 1 — near sweep */}
      <View style={{
        position: 'absolute',
        top: c - s * 0.16,
        right: s * 0.18,
        width: s * 0.09,
        height: s * 0.09,
        backgroundColor: color,
        borderRadius: s * 0.045,
        opacity: 0.85,
      }} />
      {/* Signal blip 2 — further out */}
      <View style={{
        position: 'absolute',
        top: s * 0.16,
        right: s * 0.28,
        width: s * 0.07,
        height: s * 0.07,
        backgroundColor: color,
        borderRadius: s * 0.035,
        opacity: 0.5,
      }} />
      {/* Signal blip 3 — opposite quadrant (faded) */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.26,
        left: s * 0.22,
        width: s * 0.06,
        height: s * 0.06,
        backgroundColor: color,
        borderRadius: s * 0.03,
        opacity: 0.25,
      }} />
      {/* Center dot */}
      <View style={{
        position: 'absolute',
        width: s * 0.12,
        height: s * 0.12,
        backgroundColor: color,
        borderRadius: s * 0.06,
      }} />
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// ALERT — Shield + Signal Awareness (Upgraded ECS Icon)
// ═══════════════════════════════════════════════════════════════
// Angular shield outline with concentric alert pulse arcs,
// central exclamation indicator, and cross-hair tick marks.
// Dual-rendering: SVG on web, View-based on native.
// Represents alert awareness, safety monitoring, and threat detection.

export function AlertIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;
  const c = s / 2;

  // ── Web: SVG rendering ──────────────────────────────────
  if (Platform.OS === 'web') {
    const sw = 2.0;
    const elements = [
      // Shield outline — angular tactical pentagon
      // Flat top, angled shoulders, pointed base
      svgPath(
        'M 4,4 L 20,4 L 20,12 L 12,20.5 L 4,12 Z',
        color,
        { strokeWidth: sw, key: 'shield', strokeLinejoin: 'miter' }
      ),
      // Cross-hair tick — North (extends above shield top)
      svgLine(12, 1.5, 12, 4, color, { strokeWidth: sw * 0.6, opacity: 0.5, key: 'ch-n' }),
      // Cross-hair tick — East (extends right of shield)
      svgLine(20, 10, 22.5, 10, color, { strokeWidth: sw * 0.6, opacity: 0.4, key: 'ch-e' }),
      // Cross-hair tick — West (extends left of shield)
      svgLine(1.5, 10, 4, 10, color, { strokeWidth: sw * 0.6, opacity: 0.4, key: 'ch-w' }),
      // Cross-hair tick — South (extends below shield point)
      svgLine(12, 20.5, 12, 23, color, { strokeWidth: sw * 0.5, opacity: 0.3, key: 'ch-s' }),
      // Alert pulse arc — outer (upper half, radiating from center)
      svgPath(
        'M 5.5,10 A 6.5,6.5 0 0,1 18.5,10',
        color,
        { strokeWidth: sw * 0.55, opacity: 0.25, key: 'arc-outer', strokeLinecap: 'round' }
      ),
      // Alert pulse arc — middle
      svgPath(
        'M 7.5,10 A 4.5,4.5 0 0,1 16.5,10',
        color,
        { strokeWidth: sw * 0.6, opacity: 0.4, key: 'arc-mid', strokeLinecap: 'round' }
      ),
      // Alert pulse arc — inner
      svgPath(
        'M 9.5,10 A 2.5,2.5 0 0,1 14.5,10',
        color,
        { strokeWidth: sw * 0.65, opacity: 0.6, key: 'arc-inner', strokeLinecap: 'round' }
      ),
      // Central exclamation — vertical bar
      svgLine(12, 11.5, 12, 16, color, { strokeWidth: sw * 0.9, opacity: 0.85, key: 'excl-bar' }),
      // Central exclamation — dot
      svgCircle(12, 18, 1.0, color, { fill: color, strokeWidth: 0, opacity: 0.85, key: 'excl-dot' }),
    ];

    return (
      <View style={{ width: s, height: s }}>
        <SvgIcon size={s}>{elements}</SvgIcon>
      </View>
    );
  }

  // ── Native: View-based rendering ────────────────────────
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Shield body — rectangular upper portion */}
      <View style={{
        position: 'absolute',
        top: s * 0.14,
        left: s * 0.14,
        width: s * 0.72,
        height: s * 0.38,
        borderWidth: st,
        borderColor: color,
        borderTopLeftRadius: s * 0.02,
        borderTopRightRadius: s * 0.02,
        borderBottomWidth: 0,
      }} />
      {/* Shield point — downward triangle */}
      <View style={{
        position: 'absolute',
        top: s * 0.14 + s * 0.38 - st * 0.3,
        left: s * 0.14,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.36,
        borderRightWidth: s * 0.36,
        borderTopWidth: s * 0.36,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
        opacity: 0.9,
      }} />
      {/* Shield point inner — cutout to make outline only */}
      <View style={{
        position: 'absolute',
        top: s * 0.14 + s * 0.38 - st * 0.3 + st * 0.5,
        left: s * 0.14 + st * 0.8,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.36 - st * 0.8,
        borderRightWidth: s * 0.36 - st * 0.8,
        borderTopWidth: s * 0.36 - st * 1.2,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#151A21',
        zIndex: 1,
      }} />
      {/* Cross-hair tick — North */}
      <View style={{
        position: 'absolute',
        top: s * 0.04,
        left: c - st * 0.3,
        width: st * 0.6,
        height: s * 0.10,
        backgroundColor: color,
        opacity: 0.5,
      }} />
      {/* Cross-hair tick — East */}
      <View style={{
        position: 'absolute',
        top: s * 0.38,
        right: s * 0.02,
        width: s * 0.12,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      {/* Cross-hair tick — West */}
      <View style={{
        position: 'absolute',
        top: s * 0.38,
        left: s * 0.02,
        width: s * 0.12,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      {/* Cross-hair tick — South */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.0,
        left: c - st * 0.25,
        width: st * 0.5,
        height: s * 0.08,
        backgroundColor: color,
        opacity: 0.3,
      }} />
      {/* Alert pulse arc — outer (semicircle, upper half) */}
      <View style={{
        position: 'absolute',
        top: s * 0.14,
        left: c - s * 0.28,
        width: s * 0.56,
        height: s * 0.28,
        borderWidth: st * 0.5,
        borderColor: color,
        borderTopLeftRadius: s * 0.28,
        borderTopRightRadius: s * 0.28,
        borderBottomWidth: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        opacity: 0.25,
      }} />
      {/* Alert pulse arc — middle */}
      <View style={{
        position: 'absolute',
        top: s * 0.20,
        left: c - s * 0.20,
        width: s * 0.40,
        height: s * 0.20,
        borderWidth: st * 0.55,
        borderColor: color,
        borderTopLeftRadius: s * 0.20,
        borderTopRightRadius: s * 0.20,
        borderBottomWidth: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        opacity: 0.4,
      }} />
      {/* Alert pulse arc — inner */}
      <View style={{
        position: 'absolute',
        top: s * 0.26,
        left: c - s * 0.12,
        width: s * 0.24,
        height: s * 0.12,
        borderWidth: st * 0.6,
        borderColor: color,
        borderTopLeftRadius: s * 0.12,
        borderTopRightRadius: s * 0.12,
        borderBottomWidth: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        opacity: 0.6,
      }} />
      {/* Central exclamation — vertical bar */}
      <View style={{
        position: 'absolute',
        top: s * 0.48,
        left: c - st * 0.4,
        width: st * 0.8,
        height: s * 0.20,
        backgroundColor: color,
        opacity: 0.85,
        zIndex: 2,
      }} />
      {/* Central exclamation — dot */}
      <View style={{
        position: 'absolute',
        top: s * 0.72,
        left: c - s * 0.04,
        width: s * 0.08,
        height: s * 0.08,
        backgroundColor: color,
        borderRadius: s * 0.04,
        opacity: 0.85,
        zIndex: 2,
      }} />
    </View>
  );
}



// ═══════════════════════════════════════════════════════════════
// DISCOVER — Mountain Peak with Trail Path
// ═══════════════════════════════════════════════════════════════
// Dual mountain summits with winding expedition trail path.
// Represents expedition opportunity exploration and terrain discovery.

export function DiscoverIcon({ color, size = 24 }: IconProps) {
  const s = size;
  const st = STROKE;
  const c = s / 2;

  // ── Web: SVG rendering ──────────────────────────────────
  if (Platform.OS === 'web') {
    const sw = 2.0;
    const elements = [
      // Primary mountain peak (taller, left-center)
      svgPath(
        'M 3.5,18 L 10,5.5 L 16.5,18',
        color,
        { strokeWidth: sw, key: 'peak1', strokeLinejoin: 'miter' }
      ),
      // Snow cap on primary peak
      svgPath(
        'M 8,9.5 L 10,5.5 L 12,9.5',
        color,
        { strokeWidth: sw * 0.5, opacity: 0.4, key: 'snow1', strokeLinejoin: 'miter' }
      ),
      // Secondary mountain peak (shorter, right)
      svgPath(
        'M 12,18 L 17,9 L 22,18',
        color,
        { strokeWidth: sw * 0.85, opacity: 0.55, key: 'peak2', strokeLinejoin: 'miter' }
      ),
      // Snow cap on secondary peak
      svgPath(
        'M 15.5,12 L 17,9 L 18.5,12',
        color,
        { strokeWidth: sw * 0.4, opacity: 0.3, key: 'snow2', strokeLinejoin: 'miter' }
      ),
      // Horizon / ground line
      svgLine(1, 18, 23, 18, color, { strokeWidth: sw * 0.5, opacity: 0.3, key: 'horizon' }),
      // Winding trail path — from bottom-left curving toward mountains
      svgPath(
        'M 1.5,22 C 3,20 5,19.5 7,20 C 9,20.5 10,19 11.5,18.5',
        color,
        { strokeWidth: sw * 0.7, opacity: 0.5, key: 'trail1', strokeLinecap: 'round' }
      ),
      // Trail continuation (fainter, further away)
      svgPath(
        'M 11.5,18.5 C 12.5,18 13,17 13.5,16',
        color,
        { strokeWidth: sw * 0.5, opacity: 0.3, key: 'trail2', strokeLinecap: 'round' }
      ),
      // Trail marker dot at start
      svgCircle(1.5, 22, 0.9, color, { fill: color, strokeWidth: 0, opacity: 0.5, key: 'marker' }),
    ];

    return (
      <View style={{ width: s, height: s }}>
        <SvgIcon size={s}>{elements}</SvgIcon>
      </View>
    );
  }

  // ── Native: View-based rendering ────────────────────────
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Horizon / ground line */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.22,
        left: s * 0.02,
        right: s * 0.02,
        height: st * 0.5,
        backgroundColor: color,
        opacity: 0.3,
      }} />
      {/* Primary mountain peak (taller, left-center) — semi-transparent fill */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.22,
        left: s * 0.10,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.28,
        borderRightWidth: s * 0.28,
        borderBottomWidth: s * 0.54,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
        opacity: 0.5,
        transform: [{ rotate: '180deg' }],
      }} />
      {/* Snow cap line on primary peak */}
      <View style={{
        position: 'absolute',
        top: s * 0.18,
        left: s * 0.32,
        width: s * 0.18,
        height: st * 0.5,
        backgroundColor: color,
        opacity: 0.4,
      }} />
      {/* Secondary mountain peak (shorter, right) — semi-transparent fill */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.22,
        right: s * 0.04,
        width: 0,
        height: 0,
        borderLeftWidth: s * 0.22,
        borderRightWidth: s * 0.22,
        borderBottomWidth: s * 0.38,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
        opacity: 0.35,
        transform: [{ rotate: '180deg' }],
      }} />
      {/* Trail path — winding line segments */}
      {/* Trail segment 1 (bottom-left) */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.06,
        left: s * 0.04,
        width: s * 0.18,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.5,
        transform: [{ rotate: '-8deg' }],
      }} />
      {/* Trail segment 2 (curving right) */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.10,
        left: s * 0.18,
        width: s * 0.16,
        height: st * 0.6,
        backgroundColor: color,
        opacity: 0.45,
        transform: [{ rotate: '12deg' }],
      }} />
      {/* Trail segment 3 (approaching mountains) */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.14,
        left: s * 0.32,
        width: s * 0.14,
        height: st * 0.5,
        backgroundColor: color,
        opacity: 0.35,
        transform: [{ rotate: '-15deg' }],
      }} />
      {/* Trail segment 4 (fading into distance) */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.20,
        left: s * 0.42,
        width: s * 0.08,
        height: st * 0.4,
        backgroundColor: color,
        opacity: 0.25,
        transform: [{ rotate: '-25deg' }],
      }} />
      {/* Trail marker dot */}
      <View style={{
        position: 'absolute',
        bottom: s * 0.04,
        left: s * 0.04,
        width: s * 0.06,
        height: s * 0.06,
        backgroundColor: color,
        borderRadius: s * 0.03,
        opacity: 0.5,
      }} />
    </View>
  );
}



// ── Legacy exports for backward compatibility ────────────────
export const TripsIcon = ExpeditionIcon;
export const MapsIcon = MapIcon;
export const RouteIcon = NavigateIcon;
export const ManifestIcon = LoadoutIcon;
export { DashboardCrestIcon as ShieldIcon };



