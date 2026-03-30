/**
 * MetallicIcon — Dimensional Metallic Gold SVG Renderer
 * ─────────────────────────────────────────────────────────
 * Renders ECS icon paths with a machined brass aesthetic:
 *   • Linear gradient metallic body (top-left light source)
 *   • Subtle bevel highlight edge
 *   • Darker under-stroke depth layer
 *   • Soft shadow fall bottom-right
 *   • No glow, no neon, no background
 *
 * COLOR PALETTE:
 *   Primary highlight:  #FFD166
 *   Mid gold body:      #E6B84F
 *   Shadow depth gold:  #B88A2F
 *   Shadow accent:      rgba(0,0,0,0.25)
 *
 * ViewBox: 48×48 (designed for 44–48px render size)
 */

import React, { useMemo } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import type { IconPathSet, EcsIconKey } from './EcsIconPaths';
import { ECS_ICON_REGISTRY } from './EcsIconPaths';

// ── Color constants ─────────────────────────────────────
const GOLD_HIGHLIGHT = '#FFD166';
const GOLD_MID = '#E6B84F';
const GOLD_SHADOW = '#B88A2F';
const SHADOW_COLOR = 'rgba(0,0,0,0.25)';

const ICON_VB = 48;
const VIEWBOX = `0 0 ${ICON_VB} ${ICON_VB}`;

// ── Unique ID generator for SVG defs ────────────────────
let _idCounter = 0;
function nextId(): string {
  return `ecs_${++_idCounter}`;
}

// ── Props ───────────────────────────────────────────────
export interface MetallicIconProps {
  /** Icon path set to render */
  paths: IconPathSet;
  /** Render size in pixels (default: 48) */
  size?: number;
  /** Override highlight color */
  highlightColor?: string;
  /** Override mid body color */
  bodyColor?: string;
  /** Override shadow depth color */
  shadowColor?: string;
  /** Opacity (0–1) */
  opacity?: number;
}

// ── Web SVG Renderer ────────────────────────────────────
function MetallicIconWeb({
  paths,
  size = 48,
  highlightColor = GOLD_HIGHLIGHT,
  bodyColor = GOLD_MID,
  shadowColor: shadowDepth = GOLD_SHADOW,
  opacity = 1,
}: MetallicIconProps) {
  const ids = useMemo(() => ({
    grad: nextId(),
    shadow: nextId(),
    bevel: nextId(),
  }), []);

  const children: React.ReactElement[] = [];
  let keyIdx = 0;

  // ── Defs: gradient + filters ──────────────────────────
  const gradStops = [
    React.createElement('stop', {
      key: 'gs0',
      offset: '0%',
      stopColor: highlightColor,
      stopOpacity: '1',
    }),
    React.createElement('stop', {
      key: 'gs1',
      offset: '45%',
      stopColor: bodyColor,
      stopOpacity: '1',
    }),
    React.createElement('stop', {
      key: 'gs2',
      offset: '100%',
      stopColor: shadowDepth,
      stopOpacity: '1',
    }),
  ];

  const gradient = React.createElement('linearGradient', {
    key: 'grad',
    id: ids.grad,
    x1: '0',
    y1: '0',
    x2: '1',
    y2: '1',
    gradientUnits: 'objectBoundingBox',
  }, ...gradStops);

  // Drop shadow filter
  const shadowFilter = React.createElement('filter', {
    key: 'shadowFilter',
    id: ids.shadow,
    x: '-10%',
    y: '-10%',
    width: '130%',
    height: '130%',
  },
    React.createElement('feDropShadow', {
      key: 'ds',
      dx: '1.2',
      dy: '1.5',
      stdDeviation: '0.8',
      floodColor: SHADOW_COLOR,
      floodOpacity: '1',
    })
  );

  const defs = React.createElement('defs', { key: 'defs' }, gradient, shadowFilter);
  children.push(defs);

  // ── Shadow layer (offset bottom-right) ────────────────
  const shadowGroup: React.ReactElement[] = [];
  for (const d of paths.body) {
    shadowGroup.push(
      React.createElement('path', {
        key: `sb-${keyIdx++}`,
        d,
        fill: SHADOW_COLOR,
        transform: 'translate(1.5, 1.8)',
      })
    );
  }
  children.push(
    React.createElement('g', {
      key: 'shadow-group',
      opacity: '0.6',
    }, ...shadowGroup)
  );

  // ── Depth / under-stroke layer ────────────────────────
  for (const d of paths.body) {
    children.push(
      React.createElement('path', {
        key: `depth-${keyIdx++}`,
        d,
        fill: shadowDepth,
        stroke: shadowDepth,
        strokeWidth: '1.2',
        strokeLinejoin: 'round',
      })
    );
  }

  // ── Main body layer (metallic gradient) ───────────────
  for (const d of paths.body) {
    children.push(
      React.createElement('path', {
        key: `body-${keyIdx++}`,
        d,
        fill: `url(#${ids.grad})`,
        filter: `url(#${ids.shadow})`,
      })
    );
  }

  // ── Highlight bevel edge (top-left light source) ──────
  for (const d of paths.body) {
    children.push(
      React.createElement('path', {
        key: `bevel-${keyIdx++}`,
        d,
        fill: 'none',
        stroke: highlightColor,
        strokeWidth: '0.6',
        strokeLinejoin: 'round',
        opacity: '0.55',
      })
    );
  }

  // ── Detail shapes (secondary, subtler) ────────────────
  for (const d of paths.detail) {
    // Detail shadow
    children.push(
      React.createElement('path', {
        key: `dsh-${keyIdx++}`,
        d,
        fill: SHADOW_COLOR,
        transform: 'translate(0.8, 1)',
        opacity: '0.3',
      })
    );
    // Detail body
    children.push(
      React.createElement('path', {
        key: `det-${keyIdx++}`,
        d,
        fill: shadowDepth,
        opacity: '0.65',
      })
    );
    // Detail highlight
    children.push(
      React.createElement('path', {
        key: `dhl-${keyIdx++}`,
        d,
        fill: 'none',
        stroke: highlightColor,
        strokeWidth: '0.35',
        opacity: '0.3',
      })
    );
  }

  return React.createElement(
    'svg',
    {
      viewBox: VIEWBOX,
      preserveAspectRatio: 'xMidYMid meet',
      width: size,
      height: size,
      style: {
        display: 'block',
        opacity,
      },
      xmlns: 'http://www.w3.org/2000/svg',
    },
    ...children
  );
}

// ── Native Fallback ─────────────────────────────────────
// Simple gold rectangle placeholder for native (no SVG support)
function MetallicIconNative({
  size = 48,
  opacity = 1,
}: MetallicIconProps) {
  return (
    <View style={[styles.nativeBox, { width: size, height: size, opacity }]}>
      <View style={[styles.nativeInner, {
        width: size * 0.6,
        height: size * 0.6,
        backgroundColor: GOLD_MID,
        borderRadius: 3,
      }]} />
    </View>
  );
}

// ── Exported Renderer ───────────────────────────────────
export default function MetallicIcon(props: MetallicIconProps) {
  if (Platform.OS === 'web') {
    return <MetallicIconWeb {...props} />;
  }
  return <MetallicIconNative {...props} />;
}

// ── Convenience: Render by icon key ─────────────────────
export interface EcsIconProps {
  /** Icon key from the registry */
  icon: EcsIconKey;
  /** Render size (default: 48) */
  size?: number;
  /** Override highlight color */
  highlightColor?: string;
  /** Override body color */
  bodyColor?: string;
  /** Override shadow color */
  shadowColor?: string;
  /** Opacity */
  opacity?: number;
}

export function EcsIcon({ icon, ...rest }: EcsIconProps) {
  const paths = ECS_ICON_REGISTRY[icon];
  if (!paths) return null;
  return <MetallicIcon paths={paths} {...rest} />;
}

// ── Named convenience components ────────────────────────
// Each wraps EcsIcon with a fixed icon key for clean JSX usage.

type SimpleIconProps = Omit<EcsIconProps, 'icon'>;

export function CabRackIcon(props: SimpleIconProps) { return <EcsIcon icon="cab-rack" {...props} />; }
export function StorageBoxIcon(props: SimpleIconProps) { return <EcsIcon icon="storage-box" {...props} />; }
export function RttIcon(props: SimpleIconProps) { return <EcsIcon icon="rtt" {...props} />; }
export function BedRackIcon(props: SimpleIconProps) { return <EcsIcon icon="bed-rack" {...props} />; }
export function BedCoverIcon(props: SimpleIconProps) { return <EcsIcon icon="bed-cover" {...props} />; }
export function SmartcapIcon(props: SimpleIconProps) { return <EcsIcon icon="smartcap" {...props} />; }
export function AlucabIcon(props: SimpleIconProps) { return <EcsIcon icon="alucab" {...props} />; }
export function TopperIcon(props: SimpleIconProps) { return <EcsIcon icon="topper" {...props} />; }
export function OpenBedIcon(props: SimpleIconProps) { return <EcsIcon icon="open-bed" {...props} />; }
export function HalfBinsIcon(props: SimpleIconProps) { return <EcsIcon icon="half-bins" {...props} />; }
export function FullBinsIcon(props: SimpleIconProps) { return <EcsIcon icon="full-bins" {...props} />; }
export function KitchenSlideoutIcon(props: SimpleIconProps) { return <EcsIcon icon="kitchen-slideout" {...props} />; }
export function DrawerSingleIcon(props: SimpleIconProps) { return <EcsIcon icon="drawer-single" {...props} />; }
export function DrawerDualIcon(props: SimpleIconProps) { return <EcsIcon icon="drawer-dual" {...props} />; }
export function DrawerKitchenIcon(props: SimpleIconProps) { return <EcsIcon icon="drawer-kitchen" {...props} />; }
export function HitchNoneIcon(props: SimpleIconProps) { return <EcsIcon icon="hitch-none" {...props} />; }
export function HitchTireCarrierIcon(props: SimpleIconProps) { return <EcsIcon icon="hitch-tire-carrier" {...props} />; }
export function HitchCargoCarrierIcon(props: SimpleIconProps) { return <EcsIcon icon="hitch-cargo-carrier" {...props} />; }
export function HitchBikeRackIcon(props: SimpleIconProps) { return <EcsIcon icon="hitch-bike-rack" {...props} />; }
export function HitchRecoveryIcon(props: SimpleIconProps) { return <EcsIcon icon="hitch-recovery" {...props} />; }
export function Bins1Icon(props: SimpleIconProps) { return <EcsIcon icon="bins-1" {...props} />; }
export function Bins2Icon(props: SimpleIconProps) { return <EcsIcon icon="bins-2" {...props} />; }
export function Bins3Icon(props: SimpleIconProps) { return <EcsIcon icon="bins-3" {...props} />; }
export function Bins4Icon(props: SimpleIconProps) { return <EcsIcon icon="bins-4" {...props} />; }

// ── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  nativeBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeInner: {
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
});



