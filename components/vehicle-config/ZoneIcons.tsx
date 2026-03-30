/**
 * ZoneIcons — ECS Icon System (Metallic Gold + Legacy)
 * ─────────────────────────────────────────────────────────
 *
 * PRIMARY SYSTEM (NEW):
 *   Dimensional metallic gold glyphs via MetallicIcon/EcsIcon.
 *   Machined brass aesthetic with bevel, highlight, shadow.
 *   Designed for 44–48px render size.
 *
 * LEGACY SYSTEM (PRESERVED):
 *   24x24 View-based line icons for backward compatibility.
 *   Used where monochrome zone-accent coloring is needed.
 *
 * USAGE:
 *   getZoneIcon(zoneId, zoneType, size)  → metallic gold icon
 *   getLegacyZoneIcon(zoneId, zoneType, size, color) → old monochrome
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ICON_GRID } from '../../lib/theme';
import { EcsIcon } from '../ecs-vectors/MetallicIcon';
import type { EcsIconKey } from '../ecs-vectors/EcsIconPaths';

// ════════════════════════════════════════════════════════════
// METALLIC ICON SYSTEM — Primary
// ════════════════════════════════════════════════════════════

/**
 * Resolve zone ID / type to the appropriate EcsIconKey.
 * Returns null if no specific metallic icon matches.
 */
function resolveIconKey(zoneId: string, zoneType: string): EcsIconKey | null {
  const id = (zoneId || '').toLowerCase();
  const type = (zoneType || '').toLowerCase();

  // ── Cab rack ──────────────────────────────────────────
  if (id.includes('cab_rack') && !id.includes('storage') && !id.includes('rtt')) return 'cab-rack';

  // ── Storage / cargo boxes ─────────────────────────────
  if (id.includes('rack_storage') || id.includes('cab_rack_storage') || id.includes('storage_box')) return 'storage-box';

  // ── Roof top tent ─────────────────────────────────────
  if (id.includes('rtt') || id.includes('roof_tent') || id.includes('rooftop_tent')) return 'rtt';

  // ── Bed rack ──────────────────────────────────────────
  if (id.includes('bed_rack') && !id.includes('storage')) return 'bed-rack';

  // ── Bed cover ─────────────────────────────────────────
  if (id.includes('bed_cover') || id.includes('tonneau')) return 'bed-cover';

  // ── SmartCap ──────────────────────────────────────────
  if (id.includes('smart_cap') || id.includes('smartcap') || id.includes('rsi')) return 'smartcap';

  // ── AluCab ────────────────────────────────────────────
  if (id.includes('alu_cab') || id.includes('alucab')) return 'alucab';

  // ── Other topper / shell ──────────────────────────────
  if (id.includes('topper') || id.includes('shell') || id.includes('camper_shell')) return 'topper';

  // ── Open bed ──────────────────────────────────────────
  if (id.includes('open_bed') || id.includes('bed_area')) return 'open-bed';

  // ── Bins ──────────────────────────────────────────────
  if (id.includes('half_bin') || id.includes('half-bin')) return 'half-bins';
  if (id.includes('full_bin') || id.includes('full-bin')) return 'full-bins';
  if (id.includes('bin_4') || id.includes('bins_4')) return 'bins-4';
  if (id.includes('bin_3') || id.includes('bins_3')) return 'bins-3';
  if (id.includes('bin_2') || id.includes('bins_2')) return 'bins-2';
  if (id.includes('bin_1') || id.includes('bins_1')) return 'bins-1';
  if (id.includes('bin_') || id.includes('bins')) return 'bins-2';

  // ── Kitchen slideout ──────────────────────────────────
  if (id.includes('kitchen_slide') || id.includes('kitchen-slide') || id.includes('slideout')) return 'kitchen-slideout';
  if (id.includes('kitchen')) return 'kitchen-slideout';

  // ── Drawers ───────────────────────────────────────────
  if (id.includes('drawer_kitchen') || id.includes('drawer-kitchen')) return 'drawer-kitchen';
  if (id.includes('drawer_dual') || id.includes('dual_drawer') || id.includes('double_drawer')) return 'drawer-dual';
  if (id.includes('drawer_single') || id.includes('single_drawer')) return 'drawer-single';
  if (id.includes('drawer')) return 'drawer-single';

  // ── Hitch modules ─────────────────────────────────────
  if (id.includes('hitch_tire') || id.includes('tire_carrier') || id.includes('spare_tire')) return 'hitch-tire-carrier';
  if (id.includes('hitch_cargo') || id.includes('cargo_carrier') || id.includes('cargo_basket')) return 'hitch-cargo-carrier';
  if (id.includes('hitch_bike') || id.includes('bike_rack')) return 'hitch-bike-rack';
  if (id.includes('hitch_recovery') || id.includes('d_ring') || id.includes('shackle')) return 'hitch-recovery';
  if (id.includes('hitch_none') || id.includes('hitch_receiver')) return 'hitch-none';
  if (id.includes('hitch')) return 'hitch-none';

  // ── Roof rack ─────────────────────────────────────────
  if (id.includes('roof_rack')) return 'cab-rack';

  // ── Fallback by zone type ─────────────────────────────
  switch (type) {
    case 'cab_rack':
    case 'rack':
      return 'cab-rack';
    case 'bed':
    case 'bed_area':
      return 'open-bed';
    case 'bed_rack':
      return 'bed-rack';
    case 'drawer':
      return 'drawer-single';
    case 'hitch':
      return 'hitch-none';
    case 'bin':
    case 'bins':
      return 'bins-2';
    case 'kitchen':
      return 'kitchen-slideout';
    case 'rtt':
    case 'tent':
      return 'rtt';
    case 'smartcap':
    case 'shell':
    case 'topper':
      return 'smartcap';
    case 'alucab':
      return 'alucab';
    default:
      return null;
  }
}

/**
 * Get metallic gold zone icon for a zone ID/type.
 * Returns the dimensional metallic gold glyph.
 *
 * @param zoneId   Zone identifier string
 * @param zoneType Zone type category
 * @param size     Render size in pixels (default: 48)
 * @param _color   Ignored for metallic icons (kept for API compat)
 */
export function getZoneIcon(
  zoneId: string,
  zoneType: string,
  size?: number,
  _color?: string,
): React.ReactNode {
  const iconSize = size || 48;
  const key = resolveIconKey(zoneId, zoneType);

  if (key) {
    return <EcsIcon icon={key} size={iconSize} />;
  }

  // Ultimate fallback — open bed icon
  return <EcsIcon icon="open-bed" size={iconSize} />;
}

/**
 * Get metallic icon by explicit EcsIconKey.
 * Use when you know the exact icon you want.
 */
export function getEcsIconByKey(
  key: EcsIconKey,
  size?: number,
): React.ReactNode {
  return <EcsIcon icon={key} size={size || 48} />;
}


// ════════════════════════════════════════════════════════════
// LEGACY VIEW-BASED ICONS — Preserved for backward compat
// ════════════════════════════════════════════════════════════

const S = ICON_GRID.PRIMARY_STROKE;
const SD = ICON_GRID.DETAIL_STROKE;

interface IconProps {
  size?: number;
  color?: string;
}

function gp(gridUnits: number, iconSize: number): number {
  return (gridUnits / ICON_GRID.MASTER_SIZE) * iconSize;
}

// ── Legacy icons (unchanged from original) ──────────────

export function CabInteriorIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(10, size), borderColor: color, transform: [{ rotate: '10deg' }] }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(14, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(18, size), top: gp(4, size), height: gp(10, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(14, size), width: gp(14, size), borderColor: color }]} />
      <View style={[g.vd, { left: gp(12, size), top: gp(8, size), height: gp(6, size), borderColor: color, opacity: 0.45 }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(12, size), width: gp(6, size), borderColor: color, opacity: 0.35 }]} />
      <View style={[g.hd, { left: gp(4, size), top: gp(20, size), width: gp(14, size), borderColor: color, opacity: 0.25 }]} />
    </View>
  );
}

export function RoofRackIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(10, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(10, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(6, size), top: gp(8, size), width: gp(12, size), borderColor: color, opacity: 0.4 }]} />
      <View style={[g.hd, { left: gp(6, size), top: gp(12, size), width: gp(12, size), borderColor: color, opacity: 0.4 }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(14, size), width: gp(16, size), borderColor: color, opacity: 0.3 }]} />
      <View style={[g.vd, { left: gp(12, size), top: gp(4, size), height: gp(10, size), borderColor: color, opacity: 0.2 }]} />
    </View>
  );
}

export function CabRackIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(12, size), width: gp(16, size), borderColor: color, opacity: 0.35 }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(8, size), width: gp(8, size), borderColor: color, opacity: 0.35 }]} />
      <View style={[g.vd, { left: gp(12, size), top: gp(4, size), height: gp(8, size), borderColor: color, opacity: 0.2 }]} />
    </View>
  );
}

export function BedAreaIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(10, size), width: gp(8, size), borderColor: color, opacity: 0.25 }]} />
      <View style={[g.hd, { left: gp(16, size), top: gp(20, size), width: gp(4, size), borderColor: color, opacity: 0.2 }]} />
    </View>
  );
}

export function SmartCapIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(14, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(14, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(18, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(8, size), width: gp(4, size), borderColor: color, opacity: 0.45 }]} />
      <View style={[g.hd, { left: gp(14, size), top: gp(8, size), width: gp(4, size), borderColor: color, opacity: 0.45 }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(12, size), width: gp(8, size), borderColor: color, opacity: 0.2 }]} />
    </View>
  );
}

export function DrawerIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(8, size), top: gp(10, size), width: gp(8, size), borderColor: color }]} />
      <View style={[g.vd, { left: gp(12, size), top: gp(6, size), height: gp(8, size), borderColor: color, opacity: 0.3 }]} />
      <View style={[g.hd, { left: gp(4, size), top: gp(20, size), width: gp(8, size), borderColor: color, opacity: 0.3 }]} />
      <View style={[g.hd, { left: gp(12, size), top: gp(20, size), width: gp(8, size), borderColor: color, opacity: 0.3 }]} />
    </View>
  );
}

export function HitchIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(8, size), width: gp(8, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(8, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(12, size), top: gp(8, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(10, size), top: gp(12, size), width: gp(2, size), borderColor: color, opacity: 0.6 }]} />
      <View style={[g.v, { left: gp(16, size), top: gp(4, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(14, size), top: gp(4, size), width: gp(6, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(14, size), top: gp(16, size), width: gp(6, size), borderColor: color, opacity: 0.3 }]} />
    </View>
  );
}

export function BinIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(8, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(12, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(6, size), top: gp(10, size), width: gp(4, size), borderColor: color, opacity: 0.5 }]} />
      <View style={[g.h, { left: gp(14, size), top: gp(4, size), width: gp(6, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(14, size), top: gp(16, size), width: gp(6, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(14, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(16, size), top: gp(10, size), width: gp(2, size), borderColor: color, opacity: 0.5 }]} />
      <View style={[g.hd, { left: gp(4, size), top: gp(20, size), width: gp(16, size), borderColor: color, opacity: 0.25 }]} />
    </View>
  );
}

export function RackStorageIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(12, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(12, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(12, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(8, size), top: gp(4, size), width: gp(8, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(8, size), top: gp(10, size), width: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(8, size), top: gp(4, size), height: gp(6, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(16, size), top: gp(4, size), height: gp(6, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(10, size), top: gp(8, size), width: gp(4, size), borderColor: color, opacity: 0.4 }]} />
    </View>
  );
}

export function RTTIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(12, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(8, size), width: gp(8, size), borderColor: color, opacity: 0.3 }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(16, size), borderColor: color, opacity: 0.3 }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(12, size), height: gp(8, size), borderColor: color, opacity: 0.3 }]} />
      <View style={[g.hd, { left: gp(18, size), top: gp(16, size), width: gp(4, size), borderColor: color, opacity: 0.2 }]} />
      <View style={[g.hd, { left: gp(18, size), top: gp(20, size), width: gp(4, size), borderColor: color, opacity: 0.2 }]} />
    </View>
  );
}

export function ShellInteriorIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(14, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(14, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(18, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(8, size), width: gp(8, size), borderColor: color, opacity: 0.4 }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(12, size), width: gp(8, size), borderColor: color, opacity: 0.18 }]} />
    </View>
  );
}

export function KitchenIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(4, size), top: gp(10, size), width: gp(16, size), borderColor: color, opacity: 0.4 }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(6, size), width: gp(2, size), borderColor: color, opacity: 0.45 }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(8, size), width: gp(2, size), borderColor: color, opacity: 0.45 }]} />
      <View style={[g.hd, { left: gp(14, size), top: gp(6, size), width: gp(2, size), borderColor: color, opacity: 0.45 }]} />
      <View style={[g.hd, { left: gp(14, size), top: gp(8, size), width: gp(2, size), borderColor: color, opacity: 0.45 }]} />
      <View style={[g.h, { left: gp(8, size), top: gp(14, size), width: gp(8, size), borderColor: color, opacity: 0.5 }]} />
      <View style={[g.hd, { left: gp(4, size), top: gp(20, size), width: gp(8, size), borderColor: color, opacity: 0.25 }]} />
      <View style={[g.hd, { left: gp(12, size), top: gp(20, size), width: gp(8, size), borderColor: color, opacity: 0.25 }]} />
    </View>
  );
}

export function RearCargoIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(12, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(8, size), top: gp(8, size), width: gp(4, size), borderColor: color, opacity: 0.25 }]} />
      <View style={[g.h, { left: gp(8, size), top: gp(14, size), width: gp(4, size), borderColor: color, opacity: 0.25 }]} />
      <View style={[g.v, { left: gp(8, size), top: gp(8, size), height: gp(6, size), borderColor: color, opacity: 0.25 }]} />
      <View style={[g.v, { left: gp(12, size), top: gp(8, size), height: gp(6, size), borderColor: color, opacity: 0.25 }]} />
    </View>
  );
}

export function PowerIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(8, size), width: gp(12, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(16, size), width: gp(12, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(8, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(16, size), top: gp(8, size), height: gp(8, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(8, size), top: gp(4, size), height: gp(4, size), borderColor: color, opacity: 0.5 }]} />
      <View style={[g.v, { left: gp(12, size), top: gp(4, size), height: gp(4, size), borderColor: color, opacity: 0.5 }]} />
      <View style={[g.vd, { left: gp(10, size), top: gp(10, size), height: gp(4, size), borderColor: color, opacity: 0.3 }]} />
      <View style={[g.hd, { left: gp(18, size), top: gp(4, size), width: gp(4, size), borderColor: color, opacity: 0.35 }]} />
      <View style={[g.hd, { left: gp(18, size), top: gp(8, size), width: gp(4, size), borderColor: color, opacity: 0.35 }]} />
      <View style={[g.hd, { left: gp(18, size), top: gp(12, size), width: gp(4, size), borderColor: color, opacity: 0.35 }]} />
    </View>
  );
}

export function WaterIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.h, { left: gp(4, size), top: gp(18, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(14, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(14, size), borderColor: color }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(12, size), width: gp(8, size), borderColor: color, opacity: 0.4 }]} />
      <View style={[g.vd, { left: gp(12, size), top: gp(18, size), height: gp(4, size), borderColor: color, opacity: 0.4 }]} />
      <View style={[g.hd, { left: gp(10, size), top: gp(2, size), width: gp(4, size), borderColor: color, opacity: 0.5 }]} />
    </View>
  );
}

export function SafetyIcon({ size = 24, color = 'rgba(138,138,138,0.6)' }: IconProps) {
  return (
    <View style={[g.box, { width: size, height: size }]}>
      <View style={[g.h, { left: gp(4, size), top: gp(4, size), width: gp(16, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(4, size), top: gp(4, size), height: gp(10, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(20, size), top: gp(4, size), height: gp(10, size), borderColor: color }]} />
      <View style={[g.v, { left: gp(6, size), top: gp(14, size), height: gp(4, size), borderColor: color, transform: [{ rotate: '20deg' }] }]} />
      <View style={[g.v, { left: gp(18, size), top: gp(14, size), height: gp(4, size), borderColor: color, transform: [{ rotate: '-20deg' }] }]} />
      <View style={[g.vd, { left: gp(12, size), top: gp(8, size), height: gp(8, size), borderColor: color, opacity: 0.4 }]} />
      <View style={[g.hd, { left: gp(8, size), top: gp(12, size), width: gp(8, size), borderColor: color, opacity: 0.4 }]} />
    </View>
  );
}

/**
 * Legacy zone icon resolver — returns View-based monochrome icons.
 * Use when you need zone-accent colored icons instead of metallic gold.
 */
export function getLegacyZoneIcon(
  zoneId: string,
  zoneType: string,
  size?: number,
  color?: string,
): React.ReactNode {
  const props = { size: size || ICON_GRID.MASTER_SIZE, color };

  if (zoneId.includes('cab_interior') || zoneId === 'cabin') return <CabInteriorIcon {...props} />;
  if (zoneId.includes('cab_rack') && !zoneId.includes('storage') && !zoneId.includes('rtt')) return <CabRackIcon {...props} />;
  if (zoneId.includes('rack_storage') || zoneId.includes('cab_rack_storage')) return <RackStorageIcon {...props} />;
  if (zoneId.includes('rtt')) return <RTTIcon {...props} />;
  if (zoneId.includes('bin_')) return <BinIcon {...props} />;
  if (zoneId.includes('drawer')) return <DrawerIcon {...props} />;
  if (zoneId.includes('kitchen')) return <KitchenIcon {...props} />;
  if (zoneId.includes('hitch')) return <HitchIcon {...props} />;
  if (zoneId.includes('shell') || zoneId.includes('alu_cab') || zoneId.includes('topper')) return <ShellInteriorIcon {...props} />;
  if (zoneId.includes('smart_cap') || zoneId.includes('smartcap') || zoneId.includes('rsi')) return <SmartCapIcon {...props} />;
  if (zoneId.includes('bed_area') || (zoneId.includes('bed_rack') && !zoneId.includes('storage'))) return <BedAreaIcon {...props} />;
  if (zoneId.includes('rear_cargo') || zoneId.includes('jeep_cargo')) return <RearCargoIcon {...props} />;
  if (zoneId.includes('roof_rack')) return <RoofRackIcon {...props} />;
  if (zoneId.includes('power') || zoneId.includes('battery') || zoneId.includes('solar')) return <PowerIcon {...props} />;
  if (zoneId.includes('water')) return <WaterIcon {...props} />;
  if (zoneId.includes('safety') || zoneId.includes('emergency') || zoneId.includes('first_aid')) return <SafetyIcon {...props} />;

  switch (zoneType.toUpperCase()) {
    case 'CAB': return <CabInteriorIcon {...props} />;
    case 'RACK': return <CabRackIcon {...props} />;
    case 'BED': return <BedAreaIcon {...props} />;
    case 'DRAWER': return <DrawerIcon {...props} />;
    case 'HITCH': return <HitchIcon {...props} />;
    case 'AREA': return <RearCargoIcon {...props} />;
    case 'POWER': return <PowerIcon {...props} />;
    case 'WATER': return <WaterIcon {...props} />;
    case 'SAFETY': return <SafetyIcon {...props} />;
    default: return <BedAreaIcon {...props} />;
  }
}


// ── Styles ──────────────────────────────────────────────
const g = StyleSheet.create({
  box: {
    position: 'relative',
  },
  h: {
    position: 'absolute',
    height: 0,
    borderTopWidth: S,
  },
  v: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: S,
  },
  hd: {
    position: 'absolute',
    height: 0,
    borderTopWidth: SD,
  },
  vd: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: SD,
  },
});



