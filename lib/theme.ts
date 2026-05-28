// ============================================================
// ECS GLOBAL THEME TOKENS — Single source of truth
// ============================================================
// All UI elements MUST reference these tokens.
// No ad-hoc colors, radii, or shadows anywhere in the codebase.
//
// COLOR DISCIPLINE:
//   Primary accent = ECS amber/gold ONLY
//   Secondary accents = muted neutrals (slate/graphite)
//   Blue/green/purple = warning/error states ONLY
//   "Success/Ready" = subtle amber emphasis (NOT green)
// ============================================================

export const ECS_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const ECS = {
  // ── Backgrounds ──────────────────────────────────────────
  bgPrimary:   '#0B0E12',
  bgPanel:     '#111418',
  bgElev:      '#151A21',
  bgPanelInactive: 'rgba(17,20,24,0.66)',

  // ── Strokes ──────────────────────────────────────────────
  stroke:      '#1E232B',
  strokeSoft:  '#232A33',
  strokeMuted: 'rgba(139,148,158,0.18)',

  // ── Accent ───────────────────────────────────────────────
  accent:      '#D4A017',
  accentSoft:  'rgba(212,160,23,.10)',
  goldStrong:  '#D4A017',
  goldMedium:  'rgba(212,160,23,0.55)',
  goldSoft:    'rgba(212,160,23,0.22)',
  goldWash:    'rgba(212,160,23,0.10)',
  goldPassive: 'rgba(139,148,158,0.18)',

  // ── Mode Color Cues ──────────────────────────────────────
  // Expedition mode = primary gold accent (same as accent)
  // Highway mode = muted navigation blue
  highwayBlue: '#5B8DEF',
  highwayBlueSoft: 'rgba(91,141,239,0.15)',

  // ── Text ─────────────────────────────────────────────────
  text:        '#E6EDF3',
  muted:       '#8B949E',

  // ── Radii ────────────────────────────────────────────────
  radius:      14,
  radiusLg:    18,

  // ── Spacing ───────────────────────────────────────────────
  spacing: ECS_SPACING,

  // ── Shadow ───────────────────────────────────────────────
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 6,
  },

  // ── Glow (active/primary focus only) ─────────────────────
  glow: {
    shadowColor: 'rgba(212,160,23,1)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },

  // ── Status (warning/error only — NOT for success) ────────
  critical:    '#C0392B',
  danger:      '#C0392B',
  warning:     '#E67E22',
  success:     '#D4A017',
  info:        '#5AC8FA',
  status: {
    critical:  '#C0392B',
    danger:    '#C0392B',
    warning:   '#E67E22',
    success:   '#D4A017',
    info:      '#5AC8FA',
  },
} as const;



// ============================================================
// TACTICAL THEME (Expedition Command System)
// ============================================================
// Dark mode (default) — unified ECS palette
// All values derived from ECS global tokens.
// ============================================================
export const TACTICAL = {
  bg: ECS.bgPrimary,         // #0B0E12
  panel: ECS.bgPanel,        // #111418
  panelInactive: ECS.bgPanelInactive,
  accent: ECS.strokeSoft,    // muted neutral (secondary)
  accentDark: ECS.stroke,    // darker neutral (pressed state)
  amber: ECS.accent,         // #D4A017 — primary accent
  amberDark: '#B8890F',      // darker amber (pressed state)
  goldStrong: ECS.goldStrong,
  goldMedium: ECS.goldMedium,
  goldSoft: ECS.goldSoft,
  goldWash: ECS.goldWash,
  goldPassive: ECS.goldPassive,
  text: ECS.text,            // #E6EDF3
  textMuted: ECS.muted,      // #8B949E
  critical: ECS.critical,    // #C0392B
  danger: ECS.danger,        // #C0392B
  warning: ECS.warning,      // #E67E22
  success: ECS.accent,       // amber emphasis (NOT green)
  successText: ECS.accent,   // amber text for success states
  info: ECS.info,            // #5AC8FA
  border: ECS.stroke,        // #1E232B — neutral slate
  borderMuted: ECS.strokeMuted,
  borderFocus: ECS.strokeSoft, // #232A33
  borderError: ECS.danger,   // red border
  radius: ECS.radius,        // 14
  inputBg: 'transparent',
  spacing: ECS_SPACING,
};

// ============================================================
// GOLD STRUCTURAL INTEGRATION — Section Divider Hierarchy
// ============================================================
// Updated to use ECS accent token family.
// ============================================================
export const GOLD_RAIL = {
  /** Major structural rail — header bottom, dock top (1.5px solid) */
  major: '#A0813A',
  /** Section divider — tab bars, customize bars, modal headers */
  section: ECS.goldSoft,
  /** Subsection divider — stat rows, list items, lighter boundaries */
  subsection: 'rgba(212,160,23,0.12)',
  /** Internal divider — tile headers, card internal separators */
  internal: 'rgba(212,160,23,0.06)',
  /** Instrument cluster border — Attitude Monitor gold-tinted machined edge */
  instrument: ECS.goldSoft,
  /** Instrument widget header divider — subtle gold tint */
  instrumentHeader: 'rgba(212,160,23,0.10)',
  /** Section divider width */
  sectionWidth: 1,
  /** Subsection divider width */
  subsectionWidth: 0.75,
};

export const ECS_POPUP_SURFACE_DARK = {
  shellBg: 'rgba(8,12,15,0.985)',
  shellBorder: 'rgba(196,138,44,0.28)',
  headerBg: 'rgba(12,16,20,0.98)',
  handleBg: 'rgba(10,13,16,0.98)',
  handleBar: 'rgba(255,255,255,0.16)',
  controlBg: 'rgba(0,0,0,0.26)',
  controlBorder: 'rgba(62,79,60,0.24)',
  divider: 'rgba(196,138,44,0.16)',
  footerBg: 'rgba(10,13,16,0.94)',
} as const;

export const ECS_POPUP_SURFACE_LIGHT = {
  shellBg: 'rgba(255,251,245,0.97)',
  shellBorder: 'rgba(169,119,27,0.22)',
  headerBg: 'rgba(248,244,236,0.96)',
  handleBg: 'rgba(248,244,236,0.98)',
  handleBar: 'rgba(110,78,24,0.18)',
  controlBg: 'rgba(255,255,255,0.72)',
  controlBorder: 'rgba(169,119,27,0.18)',
  divider: 'rgba(169,119,27,0.14)',
  footerBg: 'rgba(248,244,236,0.94)',
} as const;

export const ECS_POPUP_SURFACE_DRIVING = {
  shellBg: 'rgba(30,35,40,0.99)',
  shellBorder: 'rgba(224,160,48,0.24)',
  headerBg: 'rgba(38,44,50,0.98)',
  handleBg: 'rgba(38,44,50,0.98)',
  handleBar: 'rgba(241,211,160,0.18)',
  controlBg: 'rgba(42,48,56,0.9)',
  controlBorder: 'rgba(224,160,48,0.18)',
  divider: 'rgba(224,160,48,0.14)',
  footerBg: 'rgba(34,39,45,0.96)',
} as const;

export type ECSPopupSurfaceTheme = {
  shellBg: string;
  shellBorder: string;
  headerBg: string;
  handleBg: string;
  handleBar: string;
  controlBg: string;
  controlBorder: string;
  divider: string;
  footerBg: string;
};
export type ECSPopupSurfaceMode = 'dark' | 'light' | 'driving';

export function resolveEcsPopupSurfaceTheme(
  effectiveTheme: ECSPopupSurfaceMode | string | null | undefined,
): ECSPopupSurfaceTheme {
  if (effectiveTheme === 'light') return ECS_POPUP_SURFACE_LIGHT;
  if (effectiveTheme === 'driving') return ECS_POPUP_SURFACE_DRIVING;
  return ECS_POPUP_SURFACE_DARK;
}


// ============================================================
// INSTRUMENT HIERARCHY — Visual Weight Tiers
// ============================================================
// Updated to use ECS token-derived colors (no green tints).
// ============================================================

export type InstrumentTier = 'primary' | 'secondary' | 'support';

export const INSTRUMENT_HIERARCHY = {
  /** PRIMARY — Attitude Monitor: command instrument, draws the eye first */
  primary: {
    panelBg:       '#0C1016',
    borderColor:   'rgba(212,160,23,0.32)',     // gold-tinted machined edge
    borderWidth:   1,
    titleColor:    '#D4A017',                   // ECS accent
    insetTopColor: 'rgba(212,160,23,0.06)',
    insetBotColor: 'rgba(212,160,23,0.08)',
    shadowOpacity: 0.40,
    elevation:     4,
  },
  /** SECONDARY — Vehicle Systems + Remoteness: equal weight, standard tone */
  secondary: {
    panelBg:       ECS.bgPanel,                 // #111418
    borderColor:   ECS.stroke,                  // #1E232B — neutral slate
    borderWidth:   1,
    titleColor:    ECS.goldMedium,              // dimmer section gold
    insetTopColor: 'rgba(255,255,255,0.03)',
    insetBotColor: 'rgba(0,0,0,0.12)',
    shadowOpacity: 0.35,
    elevation:     3,
  },
  /** SUPPORT — Sustainability + Progress: slightly receded, still fully readable */
  support: {
    panelBg:       ECS.bgElev,                  // #151A21
    borderColor:   ECS.strokeSoft,              // #232A33
    borderWidth:   1,
    titleColor:    ECS.goldMedium,              // section gold, not active gold
    insetTopColor: 'rgba(255,255,255,0.02)',
    insetBotColor: 'rgba(0,0,0,0.08)',
    shadowOpacity: 0.28,
    elevation:     2,
  },
} as const;

/** Widget ID → Instrument Tier mapping */
const TIER_MAP: Record<string, InstrumentTier> = {
  'attitude-monitor': 'primary',
  'vehicle-systems':  'secondary',
  'remoteness':       'secondary',
  'sustainability':   'support',
  'progress':         'support',
};

/**
 * Resolve the instrument hierarchy tier for a widget.
 * Returns null for non-core widgets (they use default styling).
 */
export function getInstrumentTier(widgetId: string | null | undefined): InstrumentTier | null {
  if (!widgetId) return null;
  return TIER_MAP[widgetId] ?? null;
}

/**
 * Get the hierarchy style overrides for a widget.
 * Returns null for non-core widgets.
 */
export function getHierarchyStyle(widgetId: string | null | undefined) {
  const tier = getInstrumentTier(widgetId);
  if (!tier) return null;
  return INSTRUMENT_HIERARCHY[tier];
}



// ============================================================
// LIGHT THEME — Outdoor daylight readability
// ============================================================
export const TACTICAL_LIGHT = {
  bg: '#F2F0EB',           // warm off-white
  panel: '#FFFFFF',        // clean white cards
  panelInactive: 'rgba(248,247,244,0.74)',
  accent: '#5A7A56',       // OD green (slightly brighter)
  accentDark: '#4A6A46',   // pressed state
  amber: '#B07A1C',        // deeper amber for contrast on light bg
  amberDark: '#9A6A10',    // darker amber
  goldStrong: '#B07A1C',
  goldMedium: 'rgba(176,122,28,0.52)',
  goldSoft: 'rgba(176,122,28,0.22)',
  goldWash: 'rgba(176,122,28,0.10)',
  goldPassive: 'rgba(107,107,102,0.20)',
  text: '#1A1A18',         // near-black text
  textMuted: '#6B6B66',    // muted but legible on light
  critical: '#C0392B',     // same red
  danger: '#C0392B',       // same red
  warning: '#B86712',      // grounded orange for light surfaces
  success: '#3E6B3E',      // same green
  successText: '#2E5A2E',  // darker green text for light bg
  info: '#2478A8',
  border: '#D0CEC8',       // warm gray border
  borderMuted: 'rgba(107,107,102,0.20)',
  borderFocus: '#5A7A56',  // green focus
  borderError: '#C0392B',  // red border
  radius: 14,
  inputBg: '#F8F7F4',      // slightly off-white input bg
  spacing: ECS_SPACING,
};

// ============================================================
// DRIVING (HI-VIS) THEME — Maximum contrast, solid surfaces
// ============================================================
// NOT just light mode. Matte charcoal backgrounds with high-contrast
// text, thicker borders, no transparency/glass effects.
export const TACTICAL_DRIVING = {
  bg: '#1E2328',           // matte charcoal (lighter than dark, not white)
  panel: '#262C32',        // solid card surface (no transparency)
  panelInactive: '#242A30',
  accent: '#4E6F4C',       // brighter OD green
  accentDark: '#3E5F3C',   // pressed
  amber: '#E0A030',        // brighter amber for max contrast
  amberDark: '#C89020',    // pressed
  goldStrong: '#E0A030',
  goldMedium: 'rgba(224,160,48,0.58)',
  goldSoft: 'rgba(224,160,48,0.26)',
  goldWash: 'rgba(224,160,48,0.12)',
  goldPassive: 'rgba(160,160,154,0.28)',
  text: '#F5F5F0',         // bright white text
  textMuted: '#A0A09A',    // lighter muted (still legible in sun)
  critical: '#E04030',     // brighter red
  danger: '#E04030',       // brighter red
  warning: '#FFB020',
  success: '#50A050',      // brighter green
  successText: '#90D090',  // bright green text
  info: '#6FCFFF',
  border: '#4A5A48',       // stronger border
  borderMuted: 'rgba(160,160,154,0.28)',
  borderFocus: '#60806C',  // bright focus
  borderError: '#E04030',  // bright red
  radius: 14,
  inputBg: '#2A3038',      // solid input bg
  spacing: ECS_SPACING,
};




// ============================================================
// TYPOGRAPHY HIERARCHY — GLOBAL SOURCE OF TRUTH
// ============================================================
// All UI text must use these tokens. No ad-hoc font sizes.
//
// VEHICLE CRADLE READABILITY:
//   All sizes optimized for at-a-glance reading while driving.
//   Titles and important info are large and crisp.
//   Text wraps to next line rather than truncating.
//
// Text color rules:
//   Primary:   COLORS.textPrimary (#F5F5F5)
//   Secondary: COLORS.textSecondary (#999999)
//   Muted:     COLORS.textMuted (#666666)
//   Gold:      COLORS.textGold — KPI highlights / active state ONLY
//
// Case rules:
//   Labels (T4, U2, U3): ALL CAPS preferred
//   Body text (B1, B2): Sentence case
// ============================================================

import { TextStyle, Platform } from 'react-native';

const FONT_REGULAR = Platform.select({ ios: 'System', android: 'System', default: 'System' }) as string;
const FONT_MEDIUM = Platform.select({ ios: 'System', android: 'System', default: 'System' }) as string;
const FONT_SEMIBOLD = Platform.select({ ios: 'System', android: 'System', default: 'System' }) as string;

/** Typography tokens — vehicle-cradle optimized readability */
export const TYPO = {
  // ── Title hierarchy ──────────────────────────────────
  /** T0 Display: 28, Bold, tracking +2 — page/screen titles */
  T0: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 2,
    color: '#E6E6E1',
  } as TextStyle,

  /** T1 Section Title: 21, Bold, tracking +3 — major section headers */
  T1: {
    fontSize: 21,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 3,
    color: '#E6E6E1',
  } as TextStyle,

  /** T2 Widget Title: 17, Bold, tracking +3 — widget/card headers */
  T2: {
    fontSize: 17,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 3,
    color: '#E6E6E1',
  } as TextStyle,

  /** T3 Card Title: 16, Bold, tracking +2 — card titles, list item names */
  T3: {
    fontSize: 16,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 2,
    color: '#E6E6E1',
  } as TextStyle,

  /** T4 Label: 14, Semibold, tracking +4 (ALL CAPS preferred) — field labels */
  T4: {
    fontSize: 14,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: 4,
    color: '#8A8A85',
    textTransform: 'uppercase' as TextStyle['textTransform'],
  } as TextStyle,

  // ── Body hierarchy ───────────────────────────────────
  /** B1 Body: 16, Regular, tracking +0.5 — primary body text */
  B1: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0.5,
    color: '#E6E6E1',
  } as TextStyle,

  /** B2 Secondary: 15, Regular, tracking +0.5 — secondary/supporting text */
  B2: {
    fontSize: 15,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0.5,
    color: '#999999',
  } as TextStyle,

  // ── KPI hierarchy ────────────────────────────────────
  /** K1 KPI Large: 24, Bold, tracking +1 — primary instrument readouts */
  K1: {
    fontSize: 24,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 1,
    fontFamily: 'Courier',
    color: '#E6E6E1',
  } as TextStyle,

  /** K2 KPI Standard: 19, Bold, tracking +1 — secondary readouts */
  K2: {
    fontSize: 19,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 1,
    fontFamily: 'Courier',
    color: '#E6E6E1',
  } as TextStyle,

  /** K3 KPI Micro: 15, Semibold, tracking +1 — tertiary readouts */
  K3: {
    fontSize: 15,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: 1,
    fontFamily: 'Courier',
    color: '#E6E6E1',
  } as TextStyle,

  // ── UI element hierarchy ─────────────────────────────
  /** U1 Button: 16, Bold, tracking +3 — primary action buttons */
  U1: {
    fontSize: 16,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 3,
    color: '#0B0F12',
  } as TextStyle,

  /** U2 Chip/Badge: 13, Bold, tracking +4 — chips, badges, widget titles */
  U2: {
    fontSize: 13,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 4,
    textTransform: 'uppercase' as TextStyle['textTransform'],
  } as TextStyle,

  /** U3 Tab Label: 13, Semibold, tracking +4 — tab bar labels */
  U3: {
    fontSize: 13,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: 4,
    textTransform: 'uppercase' as TextStyle['textTransform'],
  } as TextStyle,
};

// ============================================================
// UI DENSITY SCALE — COMFORTABLE (DEFAULT)
// ============================================================
// Vehicle-cradle optimized: generous spacing for touch targets
// and visual breathing room at a glance.
// ============================================================

export type DensityMode = 'comfortable' | 'compact';

export const DENSITY = {
  mode: 'comfortable' as DensityMode,

  // ── Screen / Container ───────────────────────────────
  screenPad: 18,
  cardPad: 16,
  widgetPad: 16,
  modalPad: 18,

  // ── List / Row ───────────────────────────────────────
  listRowHeight: 72,
  buttonHeight: 54,
  chipHeight: 34,
  iconBtnTap: 46,

  // ── Gaps ─────────────────────────────────────────────
  cardGap: 14,
  iconTextGap: 12,
  internalRowGap: 10,
  sectionGap: 16,

  // ── Title → body spacing ─────────────────────────────
  titleBodyGap: 8,
  kpiLabelGap: 6,

  // ── Borders ──────────────────────────────────────────
  borderDefault: 1,
  borderActive: 1.5,
};




// ============================================================
// ICON GRID SYSTEM CONSTANTS
// ============================================================
// All icons must conform to these specifications:
//   • 24x24 master grid
//   • 4px grid snap increments
//   • 2px primary stroke
//   • No rounded corners
//   • No filled icon blocks
//   • No soft UI glyphs
export const ICON_GRID = {
  MASTER_SIZE: 24,
  SNAP: 4,
  PRIMARY_STROKE: 2,
  DETAIL_STROKE: 1.2,
};

// ============================================================
// ZONE ACCENT COLOR HIERARCHY
// ============================================================
// Muted accent colors for zone categories.
// Applied via: left bar, icon highlight, subtle underline.
// NEVER full fills.
export const ZONE_ACCENT = {
  CAB:       'rgba(100, 180, 200, 0.55)',   // muted cyan
  RACK:      'rgba(200, 170, 80, 0.55)',    // muted amber
  ROOF:      'rgba(200, 170, 80, 0.55)',    // muted amber (alias)
  BED:       'rgba(80, 170, 150, 0.55)',    // muted blue-green
  CARGO:     'rgba(80, 170, 150, 0.55)',    // muted blue-green (alias)
  DRAWER:    'rgba(140, 100, 180, 0.55)',   // muted purple
  HITCH:     'rgba(200, 120, 80, 0.55)',    // muted red-orange
  POWER:     'rgba(80, 140, 220, 0.55)',    // muted electric blue
  WATER:     'rgba(80, 180, 170, 0.55)',    // muted teal
  SAFETY:    'rgba(180, 60, 60, 0.55)',     // muted deep red
  DEFAULT:   'rgba(138, 138, 133, 0.40)',   // neutral fallback
};

// Solid versions for icon stroke color (no alpha)
export const ZONE_ACCENT_SOLID = {
  CAB:       '#5AABB8',   // muted cyan
  RACK:      '#B8A050',   // muted amber
  ROOF:      '#B8A050',   // muted amber
  BED:       '#50AA96',   // muted blue-green
  CARGO:     '#50AA96',   // muted blue-green
  DRAWER:    '#8C64B4',   // muted purple
  HITCH:     '#C87850',   // muted red-orange
  POWER:     '#508CDC',   // muted electric blue
  WATER:     '#50B4AA',   // muted teal
  SAFETY:    '#B43C3C',   // muted deep red
  DEFAULT:   '#8A8A85',   // neutral
};

/**
 * Resolve zone accent color from zone ID or zone type string.
 * Returns the muted accent color for the zone category.
 */
export function getZoneAccentColor(zoneId: string, zoneType?: string): string {
  const id = (zoneId || '').toLowerCase();
  const type = (zoneType || '').toLowerCase();

  // Match by zone ID patterns
  if (id.includes('cab_interior') || id === 'cabin' || type === 'cab') return ZONE_ACCENT.CAB;
  if (id.includes('cab_rack') || id.includes('roof_rack') || id.includes('hard_top') ||
      id.includes('jeep_rack') || type === 'rack') return ZONE_ACCENT.RACK;
  if (id.includes('bed_') || id.includes('open_bed') || id.includes('cargo') ||
      id.includes('trunk') || id.includes('hatch') || id.includes('smart_cap') ||
      id.includes('smartcap') || id.includes('rsi') || id.includes('alu_cab') ||
      id.includes('topper') || id.includes('shell') || type === 'bed' || type === 'area') return ZONE_ACCENT.BED;
  if (id.includes('drawer') || type === 'drawer') return ZONE_ACCENT.DRAWER;
  if (id.includes('hitch') || type === 'hitch') return ZONE_ACCENT.HITCH;
  if (id.includes('power') || id.includes('battery') || id.includes('solar')) return ZONE_ACCENT.POWER;
  if (id.includes('water')) return ZONE_ACCENT.WATER;
  if (id.includes('safety') || id.includes('emergency') || id.includes('first_aid')) return ZONE_ACCENT.SAFETY;

  // Fallback by zone type
  switch (type) {
    case 'cab': return ZONE_ACCENT.CAB;
    case 'rack': return ZONE_ACCENT.RACK;
    case 'bed': return ZONE_ACCENT.BED;
    case 'drawer': return ZONE_ACCENT.DRAWER;
    case 'hitch': return ZONE_ACCENT.HITCH;
    default: return ZONE_ACCENT.DEFAULT;
  }
}

/**
 * Resolve solid zone accent color for icon strokes.
 */
export function getZoneAccentSolid(zoneId: string, zoneType?: string): string {
  const id = (zoneId || '').toLowerCase();
  const type = (zoneType || '').toLowerCase();

  if (id.includes('cab_interior') || id === 'cabin' || type === 'cab') return ZONE_ACCENT_SOLID.CAB;
  if (id.includes('cab_rack') || id.includes('roof_rack') || id.includes('hard_top') ||
      id.includes('jeep_rack') || type === 'rack') return ZONE_ACCENT_SOLID.RACK;
  if (id.includes('bed_') || id.includes('open_bed') || id.includes('cargo') ||
      id.includes('trunk') || id.includes('hatch') || id.includes('smart_cap') ||
      id.includes('smartcap') || id.includes('rsi') || id.includes('alu_cab') ||
      id.includes('topper') || id.includes('shell') || type === 'bed' || type === 'area') return ZONE_ACCENT_SOLID.BED;
  if (id.includes('drawer') || type === 'drawer') return ZONE_ACCENT_SOLID.DRAWER;
  if (id.includes('hitch') || type === 'hitch') return ZONE_ACCENT_SOLID.HITCH;
  if (id.includes('power') || id.includes('battery') || id.includes('solar')) return ZONE_ACCENT_SOLID.POWER;
  if (id.includes('water')) return ZONE_ACCENT_SOLID.WATER;
  if (id.includes('safety') || id.includes('emergency') || id.includes('first_aid')) return ZONE_ACCENT_SOLID.SAFETY;

  switch (type) {
    case 'cab': return ZONE_ACCENT_SOLID.CAB;
    case 'rack': return ZONE_ACCENT_SOLID.RACK;
    case 'bed': return ZONE_ACCENT_SOLID.BED;
    case 'drawer': return ZONE_ACCENT_SOLID.DRAWER;
    case 'hitch': return ZONE_ACCENT_SOLID.HITCH;
    default: return ZONE_ACCENT_SOLID.DEFAULT;
  }
}


export const COLORS = {

  // Primary
  gold: '#D4AF37',
  goldLight: '#FFD700',
  goldDark: '#B8960C',
  goldMuted: 'rgba(212, 175, 55, 0.15)',
  goldBorder: 'rgba(212, 175, 55, 0.3)',
  goldStrong: ECS.goldStrong,
  goldMedium: ECS.goldMedium,
  goldSoft: ECS.goldSoft,
  goldWash: ECS.goldWash,
  goldPassive: ECS.goldPassive,

  // Backgrounds
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
  bgCardHover: '#222222',
  bgElevated: '#252525',
  bgInput: '#151515',
  bgPanelInactive: ECS.bgPanelInactive,
  bgModal: 'rgba(0,0,0,0.85)',

  // Text
  textPrimary: '#F5F5F5',
  textSecondary: '#999999',
  textMuted: '#666666',
  textGold: '#D4AF37',

  // Status
  success: '#34C759',
  warning: '#FF9500',
  critical: '#FF3B30',
  danger: '#FF3B30',
  info: '#5AC8FA',
  status: {
    success: '#34C759',
    warning: '#FF9500',
    critical: '#FF3B30',
    danger: '#FF3B30',
    info: '#5AC8FA',
  },

  // Borders
  border: '#2A2A2A',
  borderLight: '#333333',
  borderMuted: ECS.strokeMuted,

  // Zones
  zoneRoof: '#FF6B6B',
  zoneCab: '#4ECDC4',
  zoneRear: '#45B7D1',
  zoneLeftDrawer: '#96CEB4',
  zoneRightDrawer: '#FFEAA7',
  zoneTailgate: '#DDA0DD',
};

export const FONTS = {
  regular: 'System',
  bold: 'System',
  mono: 'Courier',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  // Phase 8: Removed gold glow — now uses dark shadow for matte depth
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
};


// ============================================================
// ZONES (Rig-aware)
// Total slots must remain 173
// ============================================================

// Add extra colors for new roof surfaces (keeps styling consistent)
export const ZONES = [
  'Cab Roof',
  'Bed Rack',
  'SmartCap Roof',
  'Alu-Cab Roof',
  'Shell Roof',
  'Cab',
  'Rear/Bed',
  'Left Drawer',
  'Right Drawer',
  'Tailgate',
] as const;

export const TERRAIN_TYPES = ['Mountain', 'Desert', 'Forest', 'Snow', 'Mixed'] as const;
export const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
export const MODES = ['Daily', 'Trip', 'Both'] as const;

// Zone colors (re-using your palette + slight variants)
export const ZONE_COLORS: Record<string, string> = {
  // Roof surfaces
  'Cab Roof': COLORS.zoneRoof,
  'Bed Rack': '#FF8A5B',        // warm orange (distinct but fits theme)
  'SmartCap Roof': '#FF4D6D',    // magenta-red
  'Alu-Cab Roof': '#C77DFF',     // purple
  'Shell Roof': '#64DFDF',       // teal-ish

  // Existing zones
  'Cab': COLORS.zoneCab,
  'Rear/Bed': COLORS.zoneRear,
  'Left Drawer': COLORS.zoneLeftDrawer,
  'Right Drawer': COLORS.zoneRightDrawer,
  'Tailgate': COLORS.zoneTailgate,
};

// Slot counts:
// Previously Roof = 12
// Now split across 5 surfaces but STILL totals 12
export const ZONE_SLOTS: Record<string, number> = {
  // Roof surfaces (12 total)
  'Cab Roof': 4,
  'Bed Rack': 3,
  'SmartCap Roof': 3,
  'Alu-Cab Roof': 1,
  'Shell Roof': 1,

  // Existing zones (unchanged)
  'Cab': 21,
  'Rear/Bed': 55,
  'Left Drawer': 33,
  'Right Drawer': 22,
  'Tailgate': 30,
};

// Prefixes must be unique + stable (these become slot_key prefixes)
export const ZONE_PREFIXES: Record<string, string> = {
  // Roof surfaces
  'Cab Roof': 'cabroof',
  'Bed Rack': 'bedrack',
  'SmartCap Roof': 'smartcaproof',
  'Alu-Cab Roof': 'alucabroof',
  'Shell Roof': 'shellroof',

  // Existing zones
  'Cab': 'cab',
  'Rear/Bed': 'rear',
  'Left Drawer': 'left',
  'Right Drawer': 'right',
  'Tailgate': 'tail',
};

/** Generate all slot keys for a given zone */
export function getZoneSlotKeys(zone: string): string[] {
  const prefix = ZONE_PREFIXES[zone];
  const count = ZONE_SLOTS[zone];
  if (!prefix || !count) return [];
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);
}

/** Generate ALL slot keys across ALL zones (173 total) */
export function getAllSlotKeys(): { zone: string; slotKey: string }[] {
  const result: { zone: string; slotKey: string }[] = [];
  for (const zone of ZONES) {
    const keys = getZoneSlotKeys(zone);
    for (const slotKey of keys) {
      result.push({ zone, slotKey });
    }
  }
  return result;
}

/** Total slot count across all zones */
export const TOTAL_SLOT_COUNT = Object.values(ZONE_SLOTS).reduce((a, b) => a + b, 0); // 173


