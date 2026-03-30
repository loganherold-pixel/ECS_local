/**
 * TruckTopDownSvg — Clean top-down truck silhouette (V2 — Stabilization Phase 2)
 * ──────────────────────────────────────────────────────────
 * V2 STABILIZATION CHANGES:
 *   - Reduced visual density: fewer internal detail lines
 *   - Lower opacity strokes (body outline 0.20, details 0.06-0.12)
 *   - Removed heavy shading and dense graphic textures
 *   - Cleaner native fallback with simpler shapes
 *   - Thinner linework throughout (stroke widths reduced)
 *   - Result: a subtle technical reference, not a dominant graphic
 *
 * ViewBox matches body dimensions (0 0 BED_W TOTAL_H).
 * overflow="visible" allows wheel arches outside the viewBox.
 *
 * Web: React.createElement('svg', ...) — real SVG DOM.
 * Native: Simplified View fallback.
 *
 * ECS styling: thin strokes, gold accent outlines, muted internals.
 */

import React from 'react';
import { View, Platform, StyleSheet, Dimensions } from 'react-native';

/* ── Responsive dimensions (shared with BlueprintCanvas) ───── */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

const SIDE_PAD = IS_SMALL ? 24 : 32;
const CANVAS_W = Math.min(SCREEN_W - SIDE_PAD, 420);

/* ── Truck body dimensions ─────────────────────────────────── */
const BODY_H_RAW = Math.round(SCREEN_H * 0.48 - 140);
const BODY_H = Math.max(280, Math.min(400, BODY_H_RAW));

const BED_W = Math.max(150, Math.min(210, Math.round(CANVAS_W * 0.50)));
const CAB_INSET = Math.max(7, Math.round(BED_W * 0.055));
const CAB_W = BED_W - CAB_INSET * 2;

/* Section heights */
const BUMPER_H = 5;
const HOOD_H = 24;
const WINDSHIELD_H = 5;
const ROOF_H = 30;
const PANEL_SEP_H = 8;
const TAILGATE_H = 6;
const FENDER_H = 14;

const REMAINING = BODY_H - BUMPER_H * 2 - HOOD_H - WINDSHIELD_H - ROOF_H - PANEL_SEP_H - FENDER_H - TAILGATE_H;
const CAB_FRAC = 0.32;
const CAB_H = Math.max(40, Math.round(REMAINING * CAB_FRAC));
const BED_H = REMAINING - CAB_H;

/* Radii */
const HOOD_R = Math.max(14, Math.round(CAB_W * 0.12));
const BED_R = 4;
const FENDER_CURVE = 8;

/* Wheel arch */
const WHEEL_W = 10;
const WHEEL_H = 22;
const WHEEL_R = 5;
const WHEEL_GAP = 2;

/* Mirror */
const MIRROR_W = 7;
const MIRROR_H = 14;

/* ── CG area height ───────────────────────────────────────── */
const CG_AREA_H = WINDSHIELD_H + ROOF_H + PANEL_SEP_H + CAB_H + FENDER_H + BED_H + TAILGATE_H;

/* ── Y positions (cumulative from top of body) ─────────────── */
const Y_HOOD_TOP = BUMPER_H;
const Y_WS_TOP = Y_HOOD_TOP + HOOD_H;
const Y_CAB_TOP = Y_WS_TOP + WINDSHIELD_H;
const Y_SEP_TOP = Y_CAB_TOP + ROOF_H;
const Y_CAB_BODY_TOP = Y_SEP_TOP + PANEL_SEP_H;
const Y_FENDER_TOP = Y_CAB_BODY_TOP + CAB_H;
const Y_BED_TOP = Y_FENDER_TOP + FENDER_H;
const Y_TAILGATE_TOP = Y_BED_TOP + BED_H;
const Y_TAILGATE_BOT = Y_TAILGATE_TOP + TAILGATE_H;
const Y_BUMPER_BOT = Y_TAILGATE_BOT + BUMPER_H;

/* Total SVG height */
const TOTAL_H = Y_BUMPER_BOT;

/* Wheel arch Y positions */
const FW_TOP = Y_CAB_TOP + Math.round((ROOF_H + PANEL_SEP_H + CAB_H) * 0.15);
const RW_TOP = Y_BED_TOP + Math.round(BED_H * 0.4);

/* Mirror Y position */
const MIRROR_TOP = Y_CAB_TOP + Math.round(ROOF_H * 0.4);

/* ── Cab edges ─────────────────────────────────────────────── */
const CL = CAB_INSET;
const CR = CAB_INSET + CAB_W;

/* ── Color tokens (V2: reduced opacity across the board) ───── */
const G = {
  '03': 'rgba(212,160,23,0.03)',
  '04': 'rgba(212,160,23,0.04)',
  '06': 'rgba(212,160,23,0.06)',
  '08': 'rgba(212,160,23,0.08)',
  '10': 'rgba(212,160,23,0.10)',
  '12': 'rgba(212,160,23,0.12)',
  '15': 'rgba(212,160,23,0.15)',
  '18': 'rgba(212,160,23,0.18)',
  '20': 'rgba(212,160,23,0.20)',
  '25': 'rgba(212,160,23,0.25)',
};
const AMBER_WARN = '#D4901A';
const AMBER_BORDER = 'rgba(212,144,26,0.35)';
const AMBER_BG = 'rgba(212,144,26,0.04)';
const SHELL_BG = '#0B0E12';

/* ── Imbalance flags ───────────────────────────────────────── */
export interface ImbalanceFlags {
  leftHeavy: boolean;
  rightHeavy: boolean;
  roofOverloaded: boolean;
  rearHeavy: boolean;
}

/* ── Props ─────────────────────────────────────────────────── */
interface Props {
  imbalance?: ImbalanceFlags;
}

/* ═══════════════════════════════════════════════════════════════
   SVG Path Builders (V2: simplified)
   ═══════════════════════════════════════════════════════════════ */

/** Main body outline — single continuous path */
function buildBodyPath(): string {
  const fc = FENDER_CURVE;
  return [
    `M ${CL + HOOD_R} ${Y_HOOD_TOP}`,
    `L ${CR - HOOD_R} ${Y_HOOD_TOP}`,
    `Q ${CR} ${Y_HOOD_TOP} ${CR} ${Y_HOOD_TOP + HOOD_R}`,
    `L ${CR} ${Y_FENDER_TOP}`,
    `C ${CR} ${Y_FENDER_TOP + fc} ${BED_W} ${Y_BED_TOP - fc} ${BED_W} ${Y_BED_TOP}`,
    `L ${BED_W} ${Y_TAILGATE_BOT - BED_R}`,
    `Q ${BED_W} ${Y_TAILGATE_BOT} ${BED_W - BED_R} ${Y_TAILGATE_BOT}`,
    `L ${BED_R} ${Y_TAILGATE_BOT}`,
    `Q 0 ${Y_TAILGATE_BOT} 0 ${Y_TAILGATE_BOT - BED_R}`,
    `L 0 ${Y_BED_TOP}`,
    `C 0 ${Y_BED_TOP - fc} ${CL} ${Y_FENDER_TOP + fc} ${CL} ${Y_FENDER_TOP}`,
    `L ${CL} ${Y_HOOD_TOP + HOOD_R}`,
    `Q ${CL} ${Y_HOOD_TOP} ${CL + HOOD_R} ${Y_HOOD_TOP}`,
    'Z',
  ].join(' ');
}

/** Internal detail lines (V2: reduced set — only essential lines) */
function buildDetails(_ib: ImbalanceFlags) {
  const lines: { d: string; stroke: string; sw: number; dash?: string }[] = [];

  // Grille accent (thinner)
  const gL = CL + Math.round(CAB_W * 0.15);
  const gR = CL + Math.round(CAB_W * 0.85);
  const gY = Y_HOOD_TOP + 4;
  lines.push({ d: `M ${gL} ${gY} L ${gR} ${gY}`, stroke: G['15'], sw: 1.5 });

  // Windshield glass bar (thinner)
  const wsL = CL + Math.round(CAB_W * 0.1);
  const wsR = CL + Math.round(CAB_W * 0.9);
  const wsY = Y_WS_TOP + Math.round(WINDSHIELD_H / 2);
  lines.push({ d: `M ${wsL} ${wsY} L ${wsR} ${wsY}`, stroke: G['18'], sw: 2 });

  // Roof rail separator (dashed, subtle)
  const rrY = Y_SEP_TOP + Math.round(PANEL_SEP_H / 2);
  lines.push({ d: `M ${CL + 8} ${rrY} L ${CR - 8} ${rrY}`, stroke: G['08'], sw: 0.5, dash: '3 2' });

  // B-pillar / fender transition (dashed)
  const bpY = Y_FENDER_TOP + Math.round(FENDER_H / 2);
  lines.push({ d: `M ${CL + 4} ${bpY} L ${CR - 4} ${bpY}`, stroke: G['10'], sw: 0.5, dash: '4 3' });

  // Bed rail lines (subtle)
  const brL = Math.round(BED_W * 0.045);
  const brR = BED_W - Math.round(BED_W * 0.045);
  lines.push({ d: `M ${brL} ${Y_BED_TOP} V ${Y_TAILGATE_TOP}`, stroke: G['06'], sw: 0.5 });
  lines.push({ d: `M ${brR} ${Y_BED_TOP} V ${Y_TAILGATE_TOP}`, stroke: G['06'], sw: 0.5 });

  // Tailgate handle (subtle)
  const thW = Math.round(BED_W * 0.1);
  const thY = Y_TAILGATE_TOP + Math.round(TAILGATE_H / 2);
  const thL = Math.round(BED_W / 2) - Math.round(thW / 2);
  lines.push({ d: `M ${thL} ${thY} L ${thL + thW} ${thY}`, stroke: G['15'], sw: 1.5 });

  return lines;
}

/* ═══════════════════════════════════════════════════════════════
   Web SVG Renderer (V2: cleaner, less dense)
   ═══════════════════════════════════════════════════════════════ */
function WebTruckSvg({ imbalance }: { imbalance: ImbalanceFlags }) {
  const ib = imbalance;
  const viewBox = `0 0 ${BED_W} ${TOTAL_H}`;
  const children: React.ReactElement[] = [];
  let k = 0;

  // ── Body outline (V2: reduced stroke opacity) ───────────
  const bodyStroke = (ib.leftHeavy || ib.rightHeavy) ? AMBER_BORDER : G['20'];
  children.push(
    React.createElement('path', {
      key: `body-${k++}`,
      d: buildBodyPath(),
      fill: SHELL_BG,
      stroke: bodyStroke,
      strokeWidth: 0.75,
    })
  );

  // ── Imbalance highlight fills (V2: very subtle) ─────────
  if (ib.rearHeavy) {
    children.push(React.createElement('rect', {
      key: `bw-${k++}`, x: 1, y: Y_BED_TOP, width: BED_W - 2,
      height: BED_H + TAILGATE_H, fill: AMBER_BG,
    }));
  }
  if (ib.roofOverloaded) {
    children.push(React.createElement('rect', {
      key: `rw-${k++}`, x: CL + 1, y: Y_CAB_TOP, width: CAB_W - 2,
      height: ROOF_H, fill: AMBER_BG,
    }));
  }

  // ── Internal detail lines (V2: reduced set) ────────────
  for (const det of buildDetails(ib)) {
    const p: any = {
      key: `d-${k++}`, d: det.d, fill: 'none',
      stroke: det.stroke, strokeWidth: det.sw,
    };
    if (det.dash) p.strokeDasharray = det.dash;
    children.push(React.createElement('path', p));
  }

  // ── Wheel arches (V2: thinner strokes) ──────────────────
  const wNorm = { stroke: G['12'], fill: G['03'] };
  const wWarn = { stroke: AMBER_BORDER, fill: AMBER_BG };
  const wheelDefs = [
    { x: -WHEEL_W - WHEEL_GAP, y: FW_TOP, ...wNorm },
    { x: BED_W + WHEEL_GAP, y: FW_TOP, ...wNorm },
    { x: -WHEEL_W - WHEEL_GAP, y: RW_TOP, ...(ib.rearHeavy ? wWarn : wNorm) },
    { x: BED_W + WHEEL_GAP, y: RW_TOP, ...(ib.rearHeavy ? wWarn : wNorm) },
  ];
  for (const w of wheelDefs) {
    children.push(React.createElement('rect', {
      key: `wh-${k++}`, x: w.x, y: w.y, width: WHEEL_W, height: WHEEL_H,
      rx: WHEEL_R, ry: WHEEL_R, fill: w.fill, stroke: w.stroke, strokeWidth: 0.75,
    }));
    children.push(React.createElement('line', {
      key: `wt-${k++}`,
      x1: w.x + WHEEL_W / 2, y1: w.y + 4,
      x2: w.x + WHEEL_W / 2, y2: w.y + WHEEL_H - 4,
      stroke: w.stroke, strokeWidth: 1.5, opacity: 0.4,
    }));
  }

  // ── Side mirrors (V2: simpler) ──────────────────────────
  const mirrorDefs = [
    { x: CL - MIRROR_W - 4, y: MIRROR_TOP },
    { x: CR + 4, y: MIRROR_TOP },
  ];
  for (const m of mirrorDefs) {
    children.push(React.createElement('rect', {
      key: `mr-${k++}`, x: m.x, y: m.y, width: MIRROR_W, height: MIRROR_H,
      rx: 3, ry: 3, fill: G['03'], stroke: G['12'], strokeWidth: 0.75,
    }));
  }

  // ── Bumper lines (V2: thinner) ──────────────────────────
  const fbY = Math.round(BUMPER_H / 2);
  const fbL = CL - 3;
  const fbR = CR + 3;
  children.push(React.createElement('line', {
    key: `fb-${k++}`, x1: fbL, y1: fbY, x2: fbR, y2: fbY,
    stroke: G['18'], strokeWidth: 1, strokeLinecap: 'round',
  }));

  const rbY = Y_BUMPER_BOT - Math.round(BUMPER_H / 2);
  const rClr = ib.rearHeavy ? AMBER_BORDER : G['18'];
  children.push(React.createElement('line', {
    key: `rb-${k++}`, x1: -3, y1: rbY, x2: BED_W + 3, y2: rbY,
    stroke: rClr, strokeWidth: 1, strokeLinecap: 'round',
  }));

  return React.createElement(
    'svg',
    {
      viewBox,
      preserveAspectRatio: 'xMidYMid meet',
      width: BED_W,
      height: TOTAL_H,
      overflow: 'visible',
      style: { display: 'block' },
      xmlns: 'http://www.w3.org/2000/svg',
    },
    ...children
  );
}

/* ═══════════════════════════════════════════════════════════════
   Native Fallback (V2: cleaner, simpler shapes)
   ═══════════════════════════════════════════════════════════════ */
function NativeTruckFallback({ imbalance }: { imbalance: ImbalanceFlags }) {
  const ib = imbalance;
  const bs = (ib.leftHeavy || ib.rightHeavy) ? AMBER_BORDER : G['20'];
  return (
    <View style={{ width: BED_W, height: TOTAL_H, position: 'relative' }}>
      {/* Hood + Cab (narrower section) */}
      <View style={[nst.section, {
        left: CL, width: CAB_W, height: HOOD_H, top: Y_HOOD_TOP,
        borderTopLeftRadius: HOOD_R, borderTopRightRadius: HOOD_R,
        borderColor: bs, borderBottomWidth: 0,
      }]} />
      {/* Cab body */}
      <View style={[nst.section, {
        left: CL, width: CAB_W,
        height: WINDSHIELD_H + ROOF_H + PANEL_SEP_H + CAB_H,
        top: Y_WS_TOP, borderColor: bs,
        borderTopWidth: 0, borderBottomWidth: 0,
      }]} />
      {/* Windshield accent */}
      <View style={{
        position: 'absolute',
        top: Y_WS_TOP + 2,
        left: CL + Math.round(CAB_W * 0.1),
        right: BED_W - CR + Math.round(CAB_W * 0.1),
        height: 1.5,
        backgroundColor: G['15'],
        borderRadius: 1,
      }} />
      {/* Bed (wider section) */}
      <View style={[nst.section, {
        left: 0, width: BED_W, height: BED_H + TAILGATE_H,
        top: Y_BED_TOP,
        borderBottomLeftRadius: BED_R, borderBottomRightRadius: BED_R,
        borderColor: ib.rearHeavy ? AMBER_BORDER : bs,
        backgroundColor: ib.rearHeavy ? AMBER_BG : SHELL_BG,
        borderTopWidth: 0,
      }]} />
      {/* Wheels (simplified) */}
      <View style={[nst.wheel, { top: FW_TOP, left: -WHEEL_W - WHEEL_GAP, borderColor: G['12'] }]} />
      <View style={[nst.wheel, { top: FW_TOP, right: -WHEEL_W - WHEEL_GAP, borderColor: G['12'] }]} />
      <View style={[nst.wheel, { top: RW_TOP, left: -WHEEL_W - WHEEL_GAP, borderColor: ib.rearHeavy ? AMBER_BORDER : G['12'] }]} />
      <View style={[nst.wheel, { top: RW_TOP, right: -WHEEL_W - WHEEL_GAP, borderColor: ib.rearHeavy ? AMBER_BORDER : G['12'] }]} />
    </View>
  );
}

const nst = StyleSheet.create({
  section: {
    position: 'absolute',
    borderWidth: 0.75,
    backgroundColor: SHELL_BG,
  },
  wheel: {
    position: 'absolute',
    width: WHEEL_W,
    height: WHEEL_H,
    borderWidth: 0.75,
    borderRadius: WHEEL_R,
    backgroundColor: SHELL_BG,
  },
});

/* ═══════════════════════════════════════════════════════════════
   Exported Component
   ═══════════════════════════════════════════════════════════════ */
export default function TruckTopDownSvg({ imbalance }: Props) {
  const ib = imbalance ?? {
    leftHeavy: false, rightHeavy: false,
    roofOverloaded: false, rearHeavy: false,
  };
  if (Platform.OS === 'web') {
    return <WebTruckSvg imbalance={ib} />;
  }
  return <NativeTruckFallback imbalance={ib} />;
}

/* ═══════════════════════════════════════════════════════════════
   Exported dimension constants for BlueprintCanvas alignment
   ═══════════════════════════════════════════════════════════════ */
export const TRUCK = {
  BODY_H,
  BED_W,
  CAB_W,
  CAB_INSET,
  BUMPER_H,
  HOOD_H,
  WINDSHIELD_H,
  ROOF_H,
  PANEL_SEP_H,
  CAB_H,
  BED_H,
  FENDER_H,
  TAILGATE_H,
  CG_AREA_H,
  TOTAL_H,
  WHEEL_W,
  WHEEL_GAP,
  Y_HOOD_TOP,
  Y_WS_TOP,
  Y_CAB_TOP,
  Y_SEP_TOP,
  Y_CAB_BODY_TOP,
  Y_FENDER_TOP,
  Y_BED_TOP,
  Y_TAILGATE_TOP,
  Y_TAILGATE_BOT,
  Y_BUMPER_BOT,
  CL,
  CR,
  HOOD_R,
  BED_R,
} as const;



