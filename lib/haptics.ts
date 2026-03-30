/**
 * ECS Haptic Feedback Hierarchy
 * 
 * Tiered haptic system. No repeated buzzing. No long vibrations.
 * No game-like feedback.
 * 
 * TIER 0 — None: Passive state changes, screen fades, scroll.
 * TIER 1 — Micro Confirmation: Nav taps, widget taps, toggles.
 * TIER 2 — Command Confirmation: Layout mode, save, apply profile, calibrate.
 * TIER 3 — Warning Alert: Stability >90%, critical rollover, emergency.
 * 
 * Cooldown: 300ms minimum between haptic events.
 * Priority: Higher tier cancels lower tier.
 */
import { Platform } from 'react-native';

// ── Cooldown State ───────────────────────────────────────────
let lastHapticTime = 0;
let lastHapticTier = 0;
const COOLDOWN_MS = 300;

// ── Stability Monitor Tracking ───────────────────────────────
let lastStabilityThresholdCrossed = false;

/**
 * Check if haptic should fire based on cooldown and tier priority.
 * Returns true if haptic should proceed.
 */
function shouldFire(tier: number): boolean {
  const now = Date.now();
  const elapsed = now - lastHapticTime;

  // Within cooldown: only fire if higher tier
  if (elapsed < COOLDOWN_MS) {
    if (tier <= lastHapticTier) return false;
  }

  lastHapticTime = now;
  lastHapticTier = tier;
  return true;
}

/**
 * Get expo-haptics module (lazy import for web compatibility)
 */
async function getHaptics() {
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('expo-haptics');
    return mod;
  } catch {
    return null;
  }
}

// ── TIER 1 — Micro Confirmation ──────────────────────────────
// 10-15ms light impact, single pulse
// Use for: bottom nav taps, widget taps, toggle switches
export async function hapticMicro(): Promise<void> {
  if (!shouldFire(1)) return;
  const haptics = await getHaptics();
  if (!haptics) return;
  try {
    await haptics.impactAsync(haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

// ── TIER 2 — Command Confirmation ────────────────────────────
// 20-25ms medium impact, single pulse
// Use for: entering layout mode, saving expedition, applying vehicle profile,
//          activating navigation, calibration confirmation
export async function hapticCommand(): Promise<void> {
  if (!shouldFire(2)) return;
  const haptics = await getHaptics();
  if (!haptics) return;
  try {
    await haptics.impactAsync(haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

// ── TIER 3 — Warning Alert ───────────────────────────────────
// One 30ms firm pulse + optional 10ms secondary tick after 120ms (only once)
// Use for: stability >90%, critical rollover, high-risk emergency
export async function hapticWarning(): Promise<void> {
  if (!shouldFire(3)) return;
  const haptics = await getHaptics();
  if (!haptics) return;
  try {
    await haptics.impactAsync(haptics.ImpactFeedbackStyle.Heavy);
    // Secondary tick after 120ms
    setTimeout(async () => {
      try {
        await haptics.impactAsync(haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }, 120);
  } catch {}
}

// ── Stability Monitor Helper ─────────────────────────────────
// Triggers TIER 3 when roll crosses 90% threshold (once per crossing)
export function checkStabilityThreshold(stabilityIndex: number): void {
  const isAbove90 = stabilityIndex >= 90;
  if (isAbove90 && !lastStabilityThresholdCrossed) {
    lastStabilityThresholdCrossed = true;
    hapticWarning();
  } else if (!isAbove90) {
    lastStabilityThresholdCrossed = false;
  }
}

// ── Reset (for testing) ──────────────────────────────────────
export function resetHapticState(): void {
  lastHapticTime = 0;
  lastHapticTier = 0;
  lastStabilityThresholdCrossed = false;
}

