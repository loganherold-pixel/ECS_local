/**
 * Zone Region Mapping — ECS Silhouette Overlay System
 * ─────────────────────────────────────────────────────────
 * Maps loadout zone IDs to rectangular regions in the
 * 1024×1024 viewBox coordinate space.
 *
 * Regions are computed dynamically from vehicle anchors
 * so they align precisely with the rendered silhouette.
 *
 * Each region is a rect: { x, y, width, height } in viewBox units.
 */

import type { VehicleAnchors } from '../ecs-vectors/spec';

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the overlay rectangle for a zone given vehicle anchors.
 * Returns null if the zone cannot be mapped to a region.
 */
export function getZoneRect(
  zoneId: string,
  anchors: VehicleAnchors,
): ZoneRect | null {
  const id = zoneId.toLowerCase();

  const roofY = anchors.roofY;
  const rfx = anchors.roofFrontX;
  const rrx = anchors.roofRearX;
  const frontX = anchors.frontX;
  const rearX = anchors.rearX;
  const underY = anchors.undercarriageY;
  const hasBed = anchors.hasBed;
  const bedSX = anchors.bedStartX ?? 0;
  const bedEX = anchors.bedEndX ?? 0;
  const bedTY = anchors.bedTopY ?? 0;
  const bedFY = anchors.bedFloorY ?? 620;
  const hitchX = anchors.hitchX;
  const cargoDoorX = (anchors as any).cargoDoorX ?? rearX;

  // Padding for visual clarity
  const pad = 6;

  // ── ROOF / RACK zones ─────────────────────────────────
  // These sit above the roofline
  if (
    id === 'cab_rack' ||
    id === 'roof_rack' ||
    id === 'roof_rack_rtt' ||
    id === 'roof_rack_storage' ||
    id === 'cab_rack_rtt' ||
    id === 'cab_rack_storage' ||
    id === 'hard_top' ||
    id === 'other_top' ||
    id === 'jeep_rack' ||
    id === 'jeep_rack_bins'
  ) {
    const rackH = 70;
    return {
      x: rfx - pad,
      y: roofY - rackH - pad,
      width: (rrx - rfx) + pad * 2,
      height: rackH + pad,
    };
  }

  // ── CAB INTERIOR ──────────────────────────────────────
  if (id === 'cab_interior' || id === 'cabin') {
    // Cab area: from windshield to C-pillar, below roof to undercarriage
    const cabFront = rfx - 20;
    const cabRear = hasBed ? (bedSX - 10) : (rfx + (rrx - rfx) * 0.45);
    return {
      x: cabFront,
      y: roofY + pad,
      width: cabRear - cabFront,
      height: (underY - roofY) - pad * 2,
    };
  }

  // ── BED AREA (trucks) ─────────────────────────────────
  if (
    id === 'bed_area' ||
    id === 'open_bed' ||
    id === 'bed_cover'
  ) {
    if (!hasBed) return null;
    return {
      x: bedSX + pad,
      y: bedTY + pad,
      width: (bedEX - bedSX) - pad * 2,
      height: (underY - bedTY) - pad * 2,
    };
  }

  // ── BED RACK (trucks) ─────────────────────────────────
  if (
    id === 'bed_rack' ||
    id === 'bed_rack_storage' ||
    id === 'bed_rack_rtt'
  ) {
    if (!hasBed) return null;
    const rackH = 80;
    return {
      x: bedSX + pad,
      y: bedTY - rackH - pad,
      width: (bedEX - bedSX) - pad * 2,
      height: rackH + pad,
    };
  }

  // ── SHELL / TOPPER / RSI / ALU CAB (trucks) ──────────
  if (
    id === 'shell_interior' ||
    id === 'rsi_smart_cap' ||
    id === 'alu_cab' ||
    id === 'alu_cab_interior' ||
    id === 'other_topper' ||
    id === 'topper_interior' ||
    id === 'jeep_rsi'
  ) {
    if (hasBed) {
      return {
        x: bedSX + pad,
        y: roofY + pad,
        width: (bedEX - bedSX) - pad * 2,
        height: (underY - roofY) - pad * 2,
      };
    }
    // SUV/van fallback — rear cargo area
    const cargoFront = rfx + (rrx - rfx) * 0.5;
    return {
      x: cargoFront,
      y: roofY + pad,
      width: cargoDoorX - cargoFront - pad,
      height: (underY - roofY) - pad * 2,
    };
  }

  // ── CARGO AREA (SUV/Van) ──────────────────────────────
  if (
    id === 'cargo_area' ||
    id === 'rear_cargo' ||
    id === 'jeep_cargo' ||
    id === 'trunk' ||
    id === 'hatch'
  ) {
    // Rear half of the vehicle body
    const cargoFront = hasBed ? bedSX : (rfx + (rrx - rfx) * 0.45);
    const cargoRear = hasBed ? bedEX : (cargoDoorX - pad);
    return {
      x: cargoFront + pad,
      y: roofY + pad * 4,
      width: (cargoRear - cargoFront) - pad * 2,
      height: (underY - roofY) - pad * 6,
    };
  }

  // ── DRAWER zones ──────────────────────────────────────
  if (
    id === 'drawers' ||
    id === 'drawer_system' ||
    id === 'drawer_main'
  ) {
    // Drawers sit low in the bed/cargo area
    const drawerFront = hasBed ? bedSX : (rfx + (rrx - rfx) * 0.45);
    const drawerRear = hasBed ? bedEX : (cargoDoorX - pad);
    return {
      x: drawerFront + pad,
      y: underY - 60,
      width: (drawerRear - drawerFront) - pad * 2,
      height: 54,
    };
  }

  if (id === 'drawer_left' || id === 'jeep_drawer_sys') {
    const drawerFront = hasBed ? bedSX : (rfx + (rrx - rfx) * 0.45);
    const drawerRear = hasBed ? bedEX : (cargoDoorX - pad);
    const midX = (drawerFront + drawerRear) / 2;
    return {
      x: drawerFront + pad,
      y: underY - 60,
      width: (midX - drawerFront) - pad * 2,
      height: 54,
    };
  }

  if (id === 'drawer_right') {
    const drawerFront = hasBed ? bedSX : (rfx + (rrx - rfx) * 0.45);
    const drawerRear = hasBed ? bedEX : (cargoDoorX - pad);
    const midX = (drawerFront + drawerRear) / 2;
    return {
      x: midX + pad,
      y: underY - 60,
      width: (drawerRear - midX) - pad * 2,
      height: 54,
    };
  }

  // ── BIN zones (RSI bins, rack bins) ───────────────────
  if (id === 'bin_left' || id === 'jeep_rsi_bin_left') {
    const binFront = hasBed ? bedSX : (rfx + (rrx - rfx) * 0.5);
    const binRear = hasBed ? bedEX : (cargoDoorX - pad);
    const midX = (binFront + binRear) / 2;
    return {
      x: binFront + pad,
      y: underY - 90,
      width: (midX - binFront) - pad * 2,
      height: 50,
    };
  }

  if (id === 'bin_right' || id === 'jeep_rsi_bin_right') {
    const binFront = hasBed ? bedSX : (rfx + (rrx - rfx) * 0.5);
    const binRear = hasBed ? bedEX : (cargoDoorX - pad);
    const midX = (binFront + binRear) / 2;
    return {
      x: midX + pad,
      y: underY - 90,
      width: (binRear - midX) - pad * 2,
      height: 50,
    };
  }

  // ── KITCHEN MODULE ────────────────────────────────────
  if (id === 'kitchen_module') {
    const kFront = hasBed ? (bedEX - (bedEX - bedSX) * 0.4) : (rrx - 60);
    const kRear = hasBed ? bedEX : cargoDoorX;
    return {
      x: kFront + pad,
      y: underY - 80,
      width: (kRear - kFront) - pad * 2,
      height: 40,
    };
  }

  // ── HITCH zones ───────────────────────────────────────
  if (id === 'hitch_accessories' || id.includes('hitch')) {
    const vw = rearX - frontX;
    const ext = Math.round(vw * 0.08);
    return {
      x: hitchX - 10,
      y: underY - 80,
      width: ext + 20,
      height: 74,
    };
  }

  return null;
}

/**
 * Compute screen-space coordinates from viewBox coordinates.
 * Accounts for SVG aspect ratio preservation (meet).
 */
export function viewBoxToScreen(
  rect: ZoneRect,
  containerWidth: number,
  containerHeight: number,
  viewBoxSize: number = 1024,
): { left: number; top: number; width: number; height: number } {
  const scale = Math.min(containerWidth / viewBoxSize, containerHeight / viewBoxSize);
  const offsetX = (containerWidth - viewBoxSize * scale) / 2;
  const offsetY = (containerHeight - viewBoxSize * scale) / 2;

  return {
    left: rect.x * scale + offsetX,
    top: rect.y * scale + offsetY,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}



