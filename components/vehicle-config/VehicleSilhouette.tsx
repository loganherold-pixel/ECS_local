/**
 * VehicleSilhouette — Hardware-accurate side-profile schematic
 *
 * REBUILT: Proportionally accurate full-size pickup (RAM 2500–inspired).
 * Crew cab, long bed, overland stance.
 *
 * Line hierarchy:
 *   Primary outline: 2.5px
 *   Secondary detail: 1.5–2px
 *   Segmentation: 1px
 *
 * Monoline vector. Angular geometry. No rounded caps.
 * No gradients. No 3D shading. Muted gray base.
 * Modified overlays: Gold (#D4AF37 @ 85%).
 *
 * Built with pure React Native Views — no SVG dependency.
 */
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

// ── Stroke weights ──────────────────────────────────────
const S_PRIMARY = 2.5;
const S_SECONDARY = 1.8;
const S_DETAIL = 1.2;
const S_TIRE = 3.5;
const S_SEG = 1;

// ── Colors ──────────────────────────────────────────────
const BASE = 'rgba(138, 138, 138, 0.60)';
const BASE_LIGHT = 'rgba(138, 138, 138, 0.30)';
const BASE_FAINT = 'rgba(138, 138, 138, 0.15)';
const GOLD = 'rgba(212, 175, 55, 0.85)';
const GOLD_UNDER = 'rgba(212, 175, 55, 0.10)';
const GOLD_ZONE = 'rgba(212, 175, 55, 0.06)';

// ── Key geometry (normalized 0–1) ───────────────────────
// RAM 2500 crew cab long bed proportions
// Cab-to-bed ratio ~55/45
const G = {
  // Ground & undercarriage
  ground: 0.86,
  undercarriage: 0.73,
  // Front
  bumperFrontX: 0.05,
  bumperTopY: 0.50,
  grilleTopY: 0.38,
  hoodFrontX: 0.06,
  hoodRearX: 0.22,
  hoodY: 0.36,
  // Windshield
  wsBaseX: 0.22,
  wsBaseY: 0.36,
  wsTopX: 0.275,
  wsTopY: 0.11,
  // Cab roof
  roofFrontX: 0.275,
  roofRearX: 0.52,
  roofY: 0.11,
  // C-pillar / rear cab
  cPillarX: 0.52,
  cPillarTopY: 0.11,
  cPillarBotY: 0.36,
  // Beltline
  beltFrontY: 0.50,
  beltRearY: 0.36,
  // Bed
  bedWallTopY: 0.28,
  bedFloorY: 0.54,
  bedStartX: 0.54,
  bedEndX: 0.94,
  // Tailgate
  tailgateX: 0.94,
  tailgateBotY: 0.73,
  // Rear bumper
  rearBumperX: 0.96,
  // Wheels
  frontWheelX: 0.19,
  rearWheelX: 0.79,
  wheelCenterY: 0.76,
  wheelRadius: 0.065,
  // Wheel arches
  archHeight: 0.12,
  archWidth: 0.16,
  // Fender flares
  fenderFrontStartX: 0.11,
  fenderFrontEndX: 0.27,
  fenderRearStartX: 0.71,
  fenderRearEndX: 0.87,
};

interface Props {
  width: number;
  height: number;
  activeOverlays?: Set<string>;
  emphasisZone?: string | null;
  showZones?: boolean;
}

export default function VehicleSilhouette({
  width,
  height,
  activeOverlays = new Set(),
  emphasisZone = null,
  showZones = false,
}: Props) {
  const sx = (pct: number) => pct * width;
  const sy = (pct: number) => pct * height;
  const has = (id: string) => activeOverlays.has(id);

  // Emphasis zone regions
  const emphasisStyle = useMemo(() => {
    if (!emphasisZone) return null;
    switch (emphasisZone) {
      case 'roof':
        return { left: width * 0.10, top: height * 0.01, width: width * 0.84, height: height * 0.18 };
      case 'bed':
        return { left: width * 0.52, top: height * 0.22, width: width * 0.44, height: height * 0.52 };
      case 'interior':
        return { left: width * 0.06, top: height * 0.14, width: width * 0.46, height: height * 0.42 };
      case 'drawer':
        return { left: width * 0.54, top: height * 0.54, width: width * 0.40, height: height * 0.20 };
      case 'hitch':
        return { left: width * 0.90, top: height * 0.40, width: width * 0.10, height: height * 0.36 };
      default:
        return null;
    }
  }, [emphasisZone, height, width]);

  const cabRackColor = has('cab_rack') ? GOLD : BASE;
  const smartcapColor = has('smartcap') || has('topper') || has('alu_cab') ? GOLD : BASE;
  const rttColor = has('rtt') ? GOLD : BASE;
  const binsColor = has('bins') ? GOLD : BASE;
  const rackColor = has('rack') ? GOLD : BASE;
  const drawerColor = has('drawer') ? GOLD : BASE;
  const hitchColor = has('hitch') ? GOLD : BASE;
  const bedCoverColor = has('bed_cover') ? GOLD : BASE;

  // Wheel dimensions
  const wDiam = sx(G.wheelRadius * 2);
  const wRad = wDiam / 2;

  return (
    <View style={[styles.container, { width, height }]}>
      {/* ── Emphasis zone highlight ─────────────────────── */}
      {emphasisStyle && (
        <View style={[styles.emphasisZone, {
          left: emphasisStyle.left, top: emphasisStyle.top,
          width: emphasisStyle.width, height: emphasisStyle.height,
          backgroundColor: GOLD, opacity: 0.06,
        }]} />
      )}

      {/* ── Zone segmentation lines ────────────────────── */}
      {showZones && (
        <>
          {/* Front/Mid divider (at C-pillar) */}
          <View style={[styles.segLine, {
            left: sx(G.cPillarX), top: sy(0.08), height: sy(0.76),
          }]} />
          {/* Mid/Rear divider (at bed start) */}
          <View style={[styles.segLine, {
            left: sx(G.bedStartX), top: sy(0.08), height: sy(0.76),
          }]} />
        </>
      )}

      {/* ── Ground baseline ────────────────────────────── */}
      <View style={[styles.hPrimary, {
        left: sx(0.03), top: sy(G.ground), width: sx(0.94),
        borderColor: BASE_FAINT,
      }]} />

      {/* ════════════════════════════════════════════════════
           BASE SILHOUETTE — RAM 2500 Crew Cab Long Bed
         ════════════════════════════════════════════════════ */}

      {/* ── Front bumper vertical ──────────────────────── */}
      <View style={[styles.vPrimary, {
        left: sx(G.bumperFrontX), top: sy(G.bumperTopY),
        height: sy(G.undercarriage - G.bumperTopY),
        borderColor: BASE,
      }]} />

      {/* ── Front bumper lower bar ─────────────────────── */}
      <View style={[styles.hSecondary, {
        left: sx(G.bumperFrontX), top: sy(G.undercarriage),
        width: sx(0.04), borderColor: BASE,
      }]} />

      {/* ── Grille / front face ────────────────────────── */}
      <View style={[styles.vSecondary, {
        left: sx(G.bumperFrontX), top: sy(G.grilleTopY),
        height: sy(G.bumperTopY - G.grilleTopY),
        borderColor: BASE,
      }]} />

      {/* ── Grille horizontal detail ───────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(G.bumperFrontX), top: sy(0.44),
        width: sx(0.03), borderColor: BASE_LIGHT,
      }]} />

      {/* ── Hood line (slight slope) ───────────────────── */}
      <View style={[styles.hoodAngle, {
        left: sx(G.hoodFrontX), top: sy(G.grilleTopY),
        width: sx(G.hoodRearX - G.hoodFrontX),
        borderColor: BASE,
        transform: [{ rotate: '-1.5deg' }],
      }]} />

      {/* ── Hood surface detail ────────────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(0.10), top: sy(G.hoodY + 0.03),
        width: sx(0.10), borderColor: BASE_FAINT,
      }]} />

      {/* ── Windshield (steep angle) ───────────────────── */}
      <View style={[styles.windshield, {
        left: sx(G.wsBaseX),
        top: sy(G.wsTopY),
        width: sx(0.08),
        height: sy(G.wsBaseY - G.wsTopY),
        borderColor: BASE,
        transform: [{ skewX: '-14deg' }],
      }]} />

      {/* ── A-pillar accent ────────────────────────────── */}
      <View style={[styles.vDetail, {
        left: sx(G.wsBaseX - 0.005), top: sy(G.wsTopY + 0.02),
        height: sy(0.22), borderColor: BASE_LIGHT,
      }]} />

      {/* ── Cab roof line ──────────────────────────────── */}
      <View style={[styles.hPrimary, {
        left: sx(G.roofFrontX), top: sy(G.roofY),
        width: sx(G.roofRearX - G.roofFrontX),
        borderColor: BASE,
      }]} />

      {/* ── Roof drip rail detail ──────────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(G.roofFrontX + 0.02), top: sy(G.roofY + 0.02),
        width: sx(G.roofRearX - G.roofFrontX - 0.04),
        borderColor: BASE_FAINT,
      }]} />

      {/* ── Rear window / C-pillar ─────────────────────── */}
      <View style={[styles.vPrimary, {
        left: sx(G.cPillarX), top: sy(G.cPillarTopY),
        height: sy(G.cPillarBotY - G.cPillarTopY),
        borderColor: BASE,
      }]} />

      {/* ── Cab side / beltline ────────────────────────── */}
      <View style={[styles.hPrimary, {
        left: sx(G.bumperFrontX), top: sy(G.beltFrontY),
        width: sx(G.wsBaseX - G.bumperFrontX),
        borderColor: BASE,
      }]} />
      {/* Beltline upper (door line) */}
      <View style={[styles.hSecondary, {
        left: sx(G.wsBaseX), top: sy(G.beltRearY),
        width: sx(G.cPillarX - G.wsBaseX),
        borderColor: BASE,
      }]} />

      {/* ── Door line (lower) ──────────────────────────── */}
      <View style={[styles.hPrimary, {
        left: sx(G.bumperFrontX + 0.01), top: sy(G.beltFrontY),
        width: sx(G.cPillarX - G.bumperFrontX - 0.01),
        borderColor: BASE,
      }]} />

      {/* ── Door handle details ────────────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(0.30), top: sy(0.42),
        width: sx(0.04), borderColor: BASE_LIGHT,
      }]} />
      <View style={[styles.hDetail, {
        left: sx(0.42), top: sy(0.42),
        width: sx(0.04), borderColor: BASE_LIGHT,
      }]} />

      {/* ── Window dividers (B-pillar, C-pillar) ───────── */}
      <View style={[styles.vDetail, {
        left: sx(0.34), top: sy(G.roofY + 0.02),
        height: sy(G.beltRearY - G.roofY - 0.02),
        borderColor: BASE_LIGHT,
      }]} />
      <View style={[styles.vDetail, {
        left: sx(0.44), top: sy(G.roofY + 0.02),
        height: sy(G.beltRearY - G.roofY - 0.02),
        borderColor: BASE_LIGHT,
      }]} />

      {/* ── Cab-to-bed transition ──────────────────────── */}
      <View style={[styles.vSecondary, {
        left: sx(G.cPillarX), top: sy(G.cPillarBotY),
        height: sy(G.beltFrontY - G.cPillarBotY),
        borderColor: BASE,
      }]} />

      {/* ── Bed wall top rail ──────────────────────────── */}
      <View style={[styles.hPrimary, {
        left: sx(G.bedStartX), top: sy(G.bedWallTopY),
        width: sx(G.bedEndX - G.bedStartX),
        borderColor: BASE,
      }]} />

      {/* ── Bed wall inner line ────────────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(G.bedStartX + 0.02), top: sy(G.bedWallTopY + 0.04),
        width: sx(G.bedEndX - G.bedStartX - 0.04),
        borderColor: BASE_FAINT,
      }]} />

      {/* ── Bed floor ──────────────────────────────────── */}
      <View style={[styles.hPrimary, {
        left: sx(G.bedStartX), top: sy(G.bedFloorY),
        width: sx(G.bedEndX - G.bedStartX),
        borderColor: BASE,
      }]} />

      {/* ── Bed side wall (front vertical) ─────────────── */}
      <View style={[styles.vPrimary, {
        left: sx(G.bedStartX), top: sy(G.bedWallTopY),
        height: sy(G.bedFloorY - G.bedWallTopY),
        borderColor: BASE,
      }]} />

      {/* ── Tailgate ───────────────────────────────────── */}
      <View style={[styles.vPrimary, {
        left: sx(G.bedEndX), top: sy(G.bedWallTopY),
        height: sy(G.tailgateBotY - G.bedWallTopY),
        borderColor: BASE,
      }]} />

      {/* ── Tailgate detail line ───────────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(G.bedEndX - 0.01), top: sy(G.bedWallTopY + 0.10),
        width: sx(0.01), borderColor: BASE_LIGHT,
      }]} />

      {/* ── Rear bumper ────────────────────────────────── */}
      <View style={[styles.hSecondary, {
        left: sx(G.bedEndX), top: sy(G.undercarriage),
        width: sx(G.rearBumperX - G.bedEndX),
        borderColor: BASE,
      }]} />
      <View style={[styles.vSecondary, {
        left: sx(G.rearBumperX), top: sy(0.66),
        height: sy(G.undercarriage - 0.66),
        borderColor: BASE,
      }]} />

      {/* ── Undercarriage / frame rail ─────────────────── */}
      <View style={[styles.hPrimary, {
        left: sx(G.bumperFrontX + 0.04), top: sy(G.undercarriage),
        width: sx(G.bedEndX - G.bumperFrontX - 0.04),
        borderColor: BASE,
      }]} />

      {/* ── Frame cross-members (detail) ───────────────── */}
      <View style={[styles.vDetail, {
        left: sx(0.30), top: sy(G.undercarriage),
        height: sy(0.04), borderColor: BASE_FAINT,
      }]} />
      <View style={[styles.vDetail, {
        left: sx(0.50), top: sy(G.undercarriage),
        height: sy(0.04), borderColor: BASE_FAINT,
      }]} />
      <View style={[styles.vDetail, {
        left: sx(0.65), top: sy(G.undercarriage),
        height: sy(0.04), borderColor: BASE_FAINT,
      }]} />

      {/* ── Rocker panel line ──────────────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(0.10), top: sy(0.64),
        width: sx(0.60), borderColor: BASE_FAINT,
      }]} />

      {/* ════════════════════════════════════════════════════
           WHEEL ARCHES + TIRES
         ════════════════════════════════════════════════════ */}

      {/* ── Front wheel arch ───────────────────────────── */}
      <View style={[styles.wheelArch, {
        left: sx(G.frontWheelX) - sx(G.archWidth / 2),
        top: sy(G.wheelCenterY) - sy(G.archHeight),
        width: sx(G.archWidth),
        height: sy(G.archHeight),
        borderColor: BASE,
        borderTopLeftRadius: sx(G.archWidth / 2),
        borderTopRightRadius: sx(G.archWidth / 2),
      }]} />

      {/* ── Front tire ─────────────────────────────────── */}
      <View style={[styles.tire, {
        left: sx(G.frontWheelX) - wRad,
        top: sy(G.wheelCenterY) - wRad,
        width: wDiam, height: wDiam,
        borderRadius: wRad,
        borderColor: BASE,
      }]} />
      {/* Front hub */}
      <View style={[styles.hub, {
        left: sx(G.frontWheelX) - wRad * 0.35,
        top: sy(G.wheelCenterY) - wRad * 0.35,
        width: wRad * 0.7, height: wRad * 0.7,
        borderRadius: wRad * 0.35,
        borderColor: BASE,
      }]} />
      {/* Front hub center */}
      <View style={[styles.hubCenter, {
        left: sx(G.frontWheelX) - 2,
        top: sy(G.wheelCenterY) - 2,
        width: 4, height: 4, borderRadius: 2,
        backgroundColor: BASE,
      }]} />

      {/* ── Rear wheel arch ────────────────────────────── */}
      <View style={[styles.wheelArch, {
        left: sx(G.rearWheelX) - sx(G.archWidth / 2),
        top: sy(G.wheelCenterY) - sy(G.archHeight),
        width: sx(G.archWidth),
        height: sy(G.archHeight),
        borderColor: BASE,
        borderTopLeftRadius: sx(G.archWidth / 2),
        borderTopRightRadius: sx(G.archWidth / 2),
      }]} />

      {/* ── Rear tire ──────────────────────────────────── */}
      <View style={[styles.tire, {
        left: sx(G.rearWheelX) - wRad,
        top: sy(G.wheelCenterY) - wRad,
        width: wDiam, height: wDiam,
        borderRadius: wRad,
        borderColor: BASE,
      }]} />
      {/* Rear hub */}
      <View style={[styles.hub, {
        left: sx(G.rearWheelX) - wRad * 0.35,
        top: sy(G.wheelCenterY) - wRad * 0.35,
        width: wRad * 0.7, height: wRad * 0.7,
        borderRadius: wRad * 0.35,
        borderColor: BASE,
      }]} />
      {/* Rear hub center */}
      <View style={[styles.hubCenter, {
        left: sx(G.rearWheelX) - 2,
        top: sy(G.wheelCenterY) - 2,
        width: 4, height: 4, borderRadius: 2,
        backgroundColor: BASE,
      }]} />

      {/* ── Fender flare accents ───────────────────────── */}
      <View style={[styles.hDetail, {
        left: sx(G.fenderFrontStartX), top: sy(0.62),
        width: sx(G.fenderFrontEndX - G.fenderFrontStartX),
        borderColor: BASE_LIGHT,
      }]} />
      <View style={[styles.hDetail, {
        left: sx(G.fenderRearStartX), top: sy(0.62),
        width: sx(G.fenderRearEndX - G.fenderRearStartX),
        borderColor: BASE_LIGHT,
      }]} />

      {/* ════════════════════════════════════════════════════
           OVERLAYS — Physically attached to base geometry
         ════════════════════════════════════════════════════ */}

      {/* ── OVERLAY: Cab Rack ──────────────────────────── */}
      {has('cab_rack') && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(0.26), top: sy(0.01),
            width: sx(0.28), height: sy(0.12),
            backgroundColor: GOLD_UNDER,
          }]} />
          {/* Rack platform */}
          <View style={[styles.hPrimary, {
            left: sx(0.27), top: sy(0.04),
            width: sx(0.26), borderColor: cabRackColor,
          }]} />
          {/* Left vertical support (attached to roof) */}
          <View style={[styles.vSecondary, {
            left: sx(0.28), top: sy(0.04),
            height: sy(G.roofY - 0.04), borderColor: cabRackColor,
          }]} />
          {/* Right vertical support */}
          <View style={[styles.vSecondary, {
            left: sx(0.52), top: sy(0.04),
            height: sy(G.roofY - 0.04), borderColor: cabRackColor,
          }]} />
          {/* Mid support */}
          <View style={[styles.vDetail, {
            left: sx(0.40), top: sy(0.04),
            height: sy(G.roofY - 0.04), borderColor: cabRackColor,
            opacity: 0.5,
          }]} />
          {/* Cross bar detail */}
          <View style={[styles.hDetail, {
            left: sx(0.30), top: sy(0.07),
            width: sx(0.20), borderColor: cabRackColor,
            opacity: 0.4,
          }]} />
        </>
      )}

      {/* ── OVERLAY: Bed Rack ──────────────────────────── */}
      {has('rack') && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(G.bedStartX), top: sy(0.10),
            width: sx(G.bedEndX - G.bedStartX), height: sy(0.20),
            backgroundColor: GOLD_UNDER,
          }]} />
          {/* Rack top rail */}
          <View style={[styles.hPrimary, {
            left: sx(G.bedStartX + 0.01), top: sy(0.14),
            width: sx(G.bedEndX - G.bedStartX - 0.02),
            borderColor: rackColor,
          }]} />
          {/* Left upright (attached to bed wall) */}
          <View style={[styles.vSecondary, {
            left: sx(G.bedStartX + 0.02), top: sy(0.14),
            height: sy(G.bedWallTopY - 0.14), borderColor: rackColor,
          }]} />
          {/* Right upright */}
          <View style={[styles.vSecondary, {
            left: sx(G.bedEndX - 0.03), top: sy(0.14),
            height: sy(G.bedWallTopY - 0.14), borderColor: rackColor,
          }]} />
          {/* Mid upright */}
          <View style={[styles.vDetail, {
            left: sx(0.74), top: sy(0.14),
            height: sy(G.bedWallTopY - 0.14), borderColor: rackColor,
            opacity: 0.4,
          }]} />
          {/* Cross rail */}
          <View style={[styles.hDetail, {
            left: sx(G.bedStartX + 0.04), top: sy(0.20),
            width: sx(G.bedEndX - G.bedStartX - 0.08),
            borderColor: rackColor, opacity: 0.35,
          }]} />
        </>
      )}

      {/* ── OVERLAY: SmartCap / Topper / AluCab ────────── */}
      {(has('smartcap') || has('topper') || has('alu_cab')) && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(G.bedStartX - 0.01), top: sy(G.roofY - 0.02),
            width: sx(G.bedEndX - G.bedStartX + 0.02),
            height: sy(G.bedFloorY - G.roofY + 0.04),
            backgroundColor: GOLD_UNDER,
          }]} />
          {/* Cap roofline (follows cab roof height, slight taper rear) */}
          <View style={[styles.hPrimary, {
            left: sx(G.cPillarX), top: sy(G.roofY + 0.01),
            width: sx(G.bedEndX - G.cPillarX - 0.02),
            borderColor: smartcapColor,
          }]} />
          {/* Rear taper (angled down to tailgate) */}
          <View style={[styles.vSecondary, {
            left: sx(G.bedEndX - 0.02), top: sy(G.roofY + 0.01),
            height: sy(G.bedWallTopY - G.roofY + 0.02),
            borderColor: smartcapColor,
            transform: [{ rotate: '4deg' }],
          }]} />
          {/* Cap rear wall */}
          <View style={[styles.vPrimary, {
            left: sx(G.bedEndX), top: sy(G.bedWallTopY),
            height: sy(G.bedFloorY - G.bedWallTopY),
            borderColor: smartcapColor,
          }]} />
          {/* Cap front connection to C-pillar */}
          <View style={[styles.vSecondary, {
            left: sx(G.cPillarX), top: sy(G.roofY + 0.01),
            height: sy(G.bedWallTopY - G.roofY),
            borderColor: smartcapColor,
          }]} />
          {/* Window cut lines */}
          <View style={[styles.hDetail, {
            left: sx(G.bedStartX + 0.04), top: sy(G.roofY + 0.06),
            width: sx(0.12), borderColor: smartcapColor, opacity: 0.5,
          }]} />
          <View style={[styles.hDetail, {
            left: sx(0.72), top: sy(G.roofY + 0.06),
            width: sx(0.12), borderColor: smartcapColor, opacity: 0.5,
          }]} />
          {/* Window vertical dividers */}
          <View style={[styles.vDetail, {
            left: sx(0.66), top: sy(G.roofY + 0.03),
            height: sy(0.10), borderColor: smartcapColor, opacity: 0.35,
          }]} />
          <View style={[styles.vDetail, {
            left: sx(0.80), top: sy(G.roofY + 0.03),
            height: sy(0.10), borderColor: smartcapColor, opacity: 0.35,
          }]} />
        </>
      )}

      {/* ── OVERLAY: Bed Cover ─────────────────────────── */}
      {has('bed_cover') && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(G.bedStartX), top: sy(G.bedWallTopY - 0.02),
            width: sx(G.bedEndX - G.bedStartX), height: sy(0.06),
            backgroundColor: GOLD_UNDER,
          }]} />
          <View style={[styles.hPrimary, {
            left: sx(G.bedStartX), top: sy(G.bedWallTopY),
            width: sx(G.bedEndX - G.bedStartX),
            borderColor: bedCoverColor,
          }]} />
          {/* Cover hinge detail */}
          <View style={[styles.hDetail, {
            left: sx(0.72), top: sy(G.bedWallTopY + 0.02),
            width: sx(0.02), borderColor: bedCoverColor, opacity: 0.5,
          }]} />
        </>
      )}

      {/* ── OVERLAY: RTT (Roof Top Tent) ───────────────── */}
      {has('rtt') && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(0.56), top: sy(0.00),
            width: sx(0.30), height: sy(0.14),
            backgroundColor: GOLD_UNDER,
          }]} />
          {/* RTT body */}
          <View style={[styles.rttBox, {
            left: sx(0.58), top: sy(0.01),
            width: sx(0.26), height: sy(0.10),
            borderColor: rttColor,
          }]} />
          {/* RTT internal fold line */}
          <View style={[styles.hDetail, {
            left: sx(0.62), top: sy(0.06),
            width: sx(0.18), borderColor: rttColor, opacity: 0.35,
          }]} />
          {/* RTT hinge detail */}
          <View style={[styles.vDetail, {
            left: sx(0.71), top: sy(0.01),
            height: sy(0.10), borderColor: rttColor, opacity: 0.25,
          }]} />
        </>
      )}

      {/* ── OVERLAY: Bins ──────────────────────────────── */}
      {has('bins') && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(0.56), top: sy(G.bedFloorY - 0.16),
            width: sx(0.34), height: sy(0.18),
            backgroundColor: GOLD_UNDER,
          }]} />
          {/* Left bin — cutaway view */}
          <View style={[styles.binBox, {
            left: sx(0.57), top: sy(G.bedFloorY - 0.14),
            width: sx(0.14), height: sy(0.12),
            borderColor: binsColor,
          }]} />
          {/* Left bin handle notch */}
          <View style={[styles.hDetail, {
            left: sx(0.60), top: sy(G.bedFloorY - 0.08),
            width: sx(0.06), borderColor: binsColor, opacity: 0.6,
          }]} />
          {/* Right bin */}
          <View style={[styles.binBox, {
            left: sx(0.73), top: sy(G.bedFloorY - 0.14),
            width: sx(0.14), height: sy(0.12),
            borderColor: binsColor,
          }]} />
          {/* Right bin handle notch */}
          <View style={[styles.hDetail, {
            left: sx(0.76), top: sy(G.bedFloorY - 0.08),
            width: sx(0.06), borderColor: binsColor, opacity: 0.6,
          }]} />
        </>
      )}

      {/* ── OVERLAY: Open Bed highlight ────────────────── */}
      {has('open_bed') && (
        <View style={[styles.overlayUnder, {
          left: sx(G.bedStartX), top: sy(G.bedWallTopY),
          width: sx(G.bedEndX - G.bedStartX),
          height: sy(G.bedFloorY - G.bedWallTopY),
          backgroundColor: GOLD_UNDER,
        }]} />
      )}

      {/* ── OVERLAY: Drawer System ─────────────────────── */}
      {has('drawer') && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(G.bedStartX + 0.01), top: sy(G.bedFloorY),
            width: sx(G.bedEndX - G.bedStartX - 0.02),
            height: sy(G.undercarriage - G.bedFloorY),
            backgroundColor: GOLD_UNDER,
          }]} />
          {/* Drawer body — integrated into bed geometry */}
          <View style={[styles.drawerBox, {
            left: sx(G.bedStartX + 0.02), top: sy(G.bedFloorY + 0.01),
            width: sx(G.bedEndX - G.bedStartX - 0.04),
            height: sy(G.undercarriage - G.bedFloorY - 0.03),
            borderColor: drawerColor,
          }]} />
          {/* Sliding plane indicator */}
          <View style={[styles.hDetail, {
            left: sx(G.bedStartX + 0.04),
            top: sy(G.bedFloorY + 0.02),
            width: sx(G.bedEndX - G.bedStartX - 0.08),
            borderColor: drawerColor, opacity: 0.4,
          }]} />
          {/* Handle notch */}
          <View style={[styles.hSecondary, {
            left: sx(0.68),
            top: sy((G.bedFloorY + G.undercarriage) / 2),
            width: sx(0.10), borderColor: drawerColor, opacity: 0.7,
          }]} />
          {/* Drawer divider (dual) */}
          <View style={[styles.vDetail, {
            left: sx((G.bedStartX + G.bedEndX) / 2),
            top: sy(G.bedFloorY + 0.01),
            height: sy(G.undercarriage - G.bedFloorY - 0.03),
            borderColor: drawerColor, opacity: 0.35,
          }]} />
          {/* Slide rail indicators */}
          <View style={[styles.hDetail, {
            left: sx(G.bedStartX + 0.04),
            top: sy(G.undercarriage - 0.03),
            width: sx(0.14), borderColor: drawerColor, opacity: 0.25,
          }]} />
          <View style={[styles.hDetail, {
            left: sx(0.76),
            top: sy(G.undercarriage - 0.03),
            width: sx(0.14), borderColor: drawerColor, opacity: 0.25,
          }]} />
        </>
      )}

      {/* ── OVERLAY: Trailer Hitch ─────────────────────── */}
      {has('hitch') && (
        <>
          <View style={[styles.overlayUnder, {
            left: sx(G.bedEndX - 0.01), top: sy(0.58),
            width: sx(0.08), height: sy(0.18),
            backgroundColor: GOLD_UNDER,
          }]} />
          {/* Receiver tube (centered under rear bumper) */}
          <View style={[styles.hSecondary, {
            left: sx(G.bedEndX), top: sy(G.undercarriage - 0.04),
            width: sx(0.05), borderColor: hitchColor,
          }]} />
          {/* Receiver opening */}
          <View style={[styles.vSecondary, {
            left: sx(G.rearBumperX + 0.02),
            top: sy(G.undercarriage - 0.07),
            height: sy(0.06), borderColor: hitchColor,
          }]} />
          {/* Hitch pin hole */}
          <View style={[styles.hubCenter, {
            left: sx(G.rearBumperX + 0.02) - 1.5,
            top: sy(G.undercarriage - 0.04) - 1.5,
            width: 3, height: 3, borderRadius: 1.5,
            backgroundColor: hitchColor,
          }]} />
          {/* Drop mount */}
          <View style={[styles.vDetail, {
            left: sx(G.rearBumperX + 0.03),
            top: sy(0.60), height: sy(G.undercarriage - 0.64),
            borderColor: hitchColor, opacity: 0.6,
          }]} />
          {/* Accessory platform */}
          <View style={[styles.hitchPlatform, {
            left: sx(G.rearBumperX), top: sy(0.58),
            width: sx(0.04), height: sy(0.10),
            borderColor: hitchColor,
          }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  // ── Primary lines (2.5px) ─────────────────────────────
  hPrimary: {
    position: 'absolute',
    height: 0,
    borderTopWidth: S_PRIMARY,
  },
  vPrimary: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: S_PRIMARY,
  },
  // ── Secondary lines (1.8px) ───────────────────────────
  hSecondary: {
    position: 'absolute',
    height: 0,
    borderTopWidth: S_SECONDARY,
  },
  vSecondary: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: S_SECONDARY,
  },
  // ── Detail lines (1.2px) ──────────────────────────────
  hDetail: {
    position: 'absolute',
    height: 0,
    borderTopWidth: S_DETAIL,
  },
  vDetail: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: S_DETAIL,
  },
  // ── Hood angle ────────────────────────────────────────
  hoodAngle: {
    position: 'absolute',
    height: 0,
    borderTopWidth: S_PRIMARY,
    transformOrigin: 'left center',
  },
  // ── Windshield ────────────────────────────────────────
  windshield: {
    position: 'absolute',
    borderRightWidth: S_PRIMARY,
    backgroundColor: 'transparent',
  },
  // ── Segmentation lines ────────────────────────────────
  segLine: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: S_SEG,
    borderColor: BASE_FAINT,
    borderStyle: 'dashed',
  },
  // ── Emphasis zone ─────────────────────────────────────
  emphasisZone: {
    position: 'absolute',
    borderRadius: 4,
  },
  // ── Wheel arch ────────────────────────────────────────
  wheelArch: {
    position: 'absolute',
    borderTopWidth: S_SECONDARY,
    borderLeftWidth: S_SECONDARY,
    borderRightWidth: S_SECONDARY,
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  // ── Tire (thicker stroke) ─────────────────────────────
  tire: {
    position: 'absolute',
    borderWidth: S_TIRE,
    backgroundColor: 'transparent',
  },
  // ── Hub ───────────────────────────────────────────────
  hub: {
    position: 'absolute',
    borderWidth: S_SECONDARY,
    backgroundColor: 'transparent',
  },
  // ── Hub center dot ────────────────────────────────────
  hubCenter: {
    position: 'absolute',
  },
  // ── Overlay underlay ──────────────────────────────────
  overlayUnder: {
    position: 'absolute',
    borderRadius: 2,
  },
  // ── RTT box ───────────────────────────────────────────
  rttBox: {
    position: 'absolute',
    borderWidth: S_PRIMARY,
    backgroundColor: 'transparent',
  },
  // ── Bin box (cutaway) ─────────────────────────────────
  binBox: {
    position: 'absolute',
    borderWidth: S_SECONDARY,
    backgroundColor: 'transparent',
  },
  // ── Drawer box ────────────────────────────────────────
  drawerBox: {
    position: 'absolute',
    borderWidth: S_SECONDARY,
    backgroundColor: 'transparent',
  },
  // ── Hitch platform ────────────────────────────────────
  hitchPlatform: {
    position: 'absolute',
    borderWidth: S_SECONDARY,
    backgroundColor: 'transparent',
  },
});



