/**
 * src/power/forecast/deviceCapacity.ts
 *
 * Phase 3H-3 — Device Capacity Estimation.
 * Phase 2A  — Bluetti model capacity entries added.
 *
 * Provides a model-name → Wh lookup table for known power station models
 * and a helper that sums capacity across all connected devices to produce
 * a system-wide total.
 *
 * Pure utility — no side-effects, no UI.
 */

// Keys are UPPER-CASED for case-insensitive matching.
const CAPACITY_TABLE: Record<string, number> = {
  // ── EcoFlow ───────────────────────────────────────────────
  "DELTA PRO": 3600,
  "DELTA PRO ULTRA": 6144,
  "DELTA 2 MAX": 2048,
  "DELTA 2": 1024,
  "DELTA 3": 1024,
  "DELTA 3 PLUS": 1024,
  "RIVER 2 PRO": 768,
  "RIVER 2": 512,
  "GLACIER": 298,
  "WAVE 2": 1159,

  // ── Bluetti — AC Series ───────────────────────────────────
  "AC200MAX": 2048,
  "AC200P": 2000,
  "AC200L": 2048,
  "AC300": 3072,
  "AC500": 3072,
  "AC60": 403,
  "AC70": 768,
  "AC180": 1152,

  // ── Bluetti — EB Series ───────────────────────────────────
  "EB3A": 268,
  "EB55": 537,
  "EB70": 716,
  "EB70S": 716,

  // ── Bluetti — EP Series ───────────────────────────────────
  "EP500": 5100,
  "EP500PRO": 5100,
  "EP500 PRO": 5100,
  "EP600": 6144,

  // ── Bluetti — Expansion Batteries ─────────────────────────
  "B230": 2048,
  "B300": 3072,
  "B300S": 3072,

  // ── Anker SOLIX — C Series (Compact) ──────────────────────
  "C300": 288,
  "C800": 768,
  "C800+": 768,
  "SOLIX C800": 768,
  "SOLIX C800 PLUS": 768,
  "C1000": 1056,
  "SOLIX C1000": 1056,

  // ── Anker SOLIX — F Series (Flagship) ─────────────────────
  "F1200": 1229,
  "SOLIX F1200": 1229,
  "F1500": 1536,
  "SOLIX F1500": 1536,
  "F2000": 2048,
  "SOLIX F2000": 2048,
  "F2600": 2560,
  "SOLIX F2600": 2560,
  "F3800": 3840,
  "SOLIX F3800": 3840,

  // ── Anker SOLIX — BP Series (Expansion) ───────────────────
  "BP1000": 1024,
  "SOLIX BP1000": 1024,
  "BP2000": 2048,
  "SOLIX BP2000": 2048,
  "BP3800": 3840,
  "SOLIX BP3800": 3840,

  // ── Jackery — Explorer Series ─────────────────────────────
  "EXPLORER 100": 98,
  "EXPLORER 240": 240,
  "EXPLORER 300": 293,
  "EXPLORER 500": 518,
  "EXPLORER 1000": 1002,
  "EXPLORER 1500": 1534,

  // ── Jackery — Explorer Plus Series (LiFePO4) ─────────────
  "EXPLORER 100 PLUS": 99,
  "EXPLORER 300 PLUS": 288,
  "EXPLORER 600 PLUS": 632,
  "EXPLORER 1000 PLUS": 1264,
  "EXPLORER 2000 PLUS": 2042,
  "EXPLORER 3000 PRO": 3024,

  // ── Jackery — Solar Generator Kits ────────────────────────
  "SOLAR GENERATOR 1000": 1002,
  "SOLAR GENERATOR 2000 PLUS": 2042,

  // ── Jackery — Expansion Battery Packs ─────────────────────
  "BATTERY PACK 1000 PLUS": 1264,
  "BATTERY PACK 2000 PLUS": 2042,

  // ── Jackery — Short-form aliases ──────────────────────────
  "JACKERY E1000": 1002,
  "JACKERY E2000": 2042,
  "JACKERY E300": 293,
  "JACKERY E500": 518,
  "JACKERY E1500": 1534,

  // ── Goal Zero — Yeti X Series ─────────────────────────────
  "YETI 200X": 187,
  "YETI 500X": 505,
  "YETI 700": 677,
  "YETI 1000X": 983,
  "YETI 1500X": 1516,

  // ── Goal Zero — Yeti Core Series ──────────────────────────
  "YETI 1000 CORE": 983,

  // ── Goal Zero — Yeti Pro Series ───────────────────────────
  "YETI 2000X": 2045,
  "YETI 3000X": 3032,
  "YETI 4000": 3968,
  "YETI 6000X": 6071,

  // ── Goal Zero — Expansion ─────────────────────────────────
  "YETI TANK EXPANSION": 2045,

  // ── Goal Zero — Alta Series ───────────────────────────────
  "ALTA 50": 50,
  "ALTA 80": 80,

  // ── Goal Zero — Short-form aliases ────────────────────────
  "GOAL ZERO YETI 1000X": 983,
  "GOAL ZERO YETI 1500X": 1516,
  "GOAL ZERO YETI 2000X": 2045,
  "GOAL ZERO YETI 3000X": 3032,
  "GOAL ZERO YETI 4000": 3968,
  "GOAL ZERO YETI 6000X": 6071,
  "GZ YETI 1000X": 983,
  "GZ YETI 3000X": 3032,
  "GZ YETI 6000X": 6071,

  // ── Renogy — Smart Lithium Batteries ──────────────────────
  "SMART LITHIUM 12V 50AH": 640,
  "SMART LITHIUM 12V 100AH": 1280,
  "SMART LITHIUM 12V 200AH": 2560,
  "SMART LITHIUM 12V 300AH": 3840,
  "SMART LITHIUM 24V 100AH": 2560,
  "SMART LITHIUM 48V 50AH": 2560,

  // ── Renogy — Core Series Batteries ────────────────────────
  "CORE SERIES 12V 100AH": 1280,
  "CORE SERIES 12V 200AH": 2560,

  // ── Renogy — Power Stations ───────────────────────────────
  "LYCAN 5000": 4800,

  // ── Renogy — Short-form aliases ───────────────────────────
  "RENOGY SMART 100AH": 1280,
  "RENOGY SMART 200AH": 2560,
  "RENOGY SMART 300AH": 3840,
  "RENOGY CORE 100AH": 1280,
  "RENOGY CORE 200AH": 2560,
  "RENOGY 100AH LIFEPO4": 1280,
  "RENOGY 200AH LIFEPO4": 2560,
  "RENOGY LYCAN": 4800,
};





// ── Single-device capacity estimate ─────────────────────────────────────

/**
 * Return the estimated capacity (Wh) for a known model string.
 *
 * Matching is case-insensitive and uses a "contains" strategy so that
 * model strings like "EcoFlow DELTA Pro" or "Bluetti AC200MAX" still hit
 * the lookup table.
 *
 * Returns `undefined` for unrecognised models.
 */
export function estimateDeviceCapacityWh(
  model?: string,
): number | undefined {
  if (!model) return undefined;

  const upper = model.toUpperCase().trim();

  // 1. Exact match first (fastest path)
  if (CAPACITY_TABLE[upper] !== undefined) {
    return CAPACITY_TABLE[upper];
  }

  // 2. Contains match — iterate table keys longest-first so "DELTA 2 MAX"
  //    is tested before "DELTA 2" and avoids a false partial hit.
  const sortedKeys = Object.keys(CAPACITY_TABLE).sort(
    (a, b) => b.length - a.length,
  );

  for (const key of sortedKeys) {
    if (upper.includes(key)) {
      return CAPACITY_TABLE[key];
    }
  }

  return undefined;
}

// ── Device shape accepted by the aggregator ─────────────────────────────

export interface CapacityDevice {
  /** Explicit capacity override (takes priority over model lookup). */
  capacityWh?: number;
  /** Model string used for lookup when capacityWh is not provided. */
  model?: string;
}

// ── System capacity aggregator ──────────────────────────────────────────

/**
 * Sum the capacity of all provided devices.
 *
 * For each device:
 *   1. Use `device.capacityWh` if explicitly set.
 *   2. Otherwise fall back to `estimateDeviceCapacityWh(device.model)`.
 *   3. If neither yields a number the device is skipped (contributes 0 Wh).
 *
 * Returns the total in Wh, or `undefined` if no device contributed a
 * known capacity (avoids returning a misleading 0).
 */
export function computeSystemCapacity(
  devices: CapacityDevice[],
): number | undefined {
  if (!devices || devices.length === 0) return undefined;

  let total = 0;
  let knownCount = 0;

  for (const device of devices) {
    const explicit = device.capacityWh;
    const estimated = estimateDeviceCapacityWh(device.model);
    const wh = explicit ?? estimated;

    if (wh !== undefined && wh > 0) {
      total += wh;
      knownCount += 1;
    }
  }

  return knownCount > 0 ? total : undefined;
}

