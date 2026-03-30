/**
 * ECS Dark Mode Brightness Calibration
 * 
 * Glow intensity adapts to ambient brightness.
 * Uses device brightness as proxy (ambient light sensor fallback).
 * 
 * Glow Opacity: 8% base + (brightness × 12%), clamped at 22%
 * Warning Glow: 10% base + (brightness × 10%), clamped at 25%
 * Gold Luminance: +0% to +10% based on brightness
 * Night Cabin (<0.15): Additional -3% glow reduction
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Appearance, Platform } from 'react-native';

// ── Brightness Range ─────────────────────────────────────────
// 0.0 (pitch dark) → 1.0 (bright daylight)
// Default to 0.3 (typical indoor/vehicle cabin)
const DEFAULT_BRIGHTNESS = 0.3;

// ── Glow Configuration ───────────────────────────────────────
const GLOW_BASE = 0.08;         // 8% base
const GLOW_RANGE = 0.12;        // +12% max from brightness
const GLOW_MAX = 0.22;          // 22% clamp
const GLOW_NIGHT_REDUCTION = 0.03; // -3% in night cabin

const WARNING_GLOW_BASE = 0.10; // 10% base
const WARNING_GLOW_RANGE = 0.10; // +10% max
const WARNING_GLOW_MAX = 0.25;  // 25% clamp

const GOLD_LUMINANCE_MAX_SHIFT = 0.10; // +10% max luminance
const NIGHT_THRESHOLD = 0.15;

const TRANSITION_MS = 300;

// ── Computed Glow Values ─────────────────────────────────────
export interface GlowValues {
  /** Ambient brightness 0-1 */
  brightness: number;
  /** Standard glow opacity (0.05 - 0.22) */
  glowOpacity: number;
  /** Warning glow opacity (0.07 - 0.25) */
  warningGlowOpacity: number;
  /** Gold luminance shift (0 - 0.10) */
  goldLuminanceShift: number;
  /** Whether in night cabin mode */
  isNightCabin: boolean;
  /** Gold color adjusted for brightness */
  goldColor: string;
  /** Gold glow color with computed opacity */
  goldGlow: string;
  /** Warning glow color with computed opacity */
  warningGlow: string;
}

function computeGlowValues(brightness: number): GlowValues {
  const b = Math.max(0, Math.min(1, brightness));
  const isNightCabin = b < NIGHT_THRESHOLD;

  // Standard glow
  let glowOpacity = GLOW_BASE + (b * GLOW_RANGE);
  if (isNightCabin) glowOpacity -= GLOW_NIGHT_REDUCTION;
  glowOpacity = Math.max(0.03, Math.min(GLOW_MAX, glowOpacity));

  // Warning glow
  let warningGlowOpacity = WARNING_GLOW_BASE + (b * WARNING_GLOW_RANGE);
  if (isNightCabin) warningGlowOpacity -= GLOW_NIGHT_REDUCTION;
  warningGlowOpacity = Math.max(0.05, Math.min(WARNING_GLOW_MAX, warningGlowOpacity));

  // Gold luminance shift
  const goldLuminanceShift = b * GOLD_LUMINANCE_MAX_SHIFT;

  // Compute adjusted gold color
  // Base gold: #D4AF37 → RGB(212, 175, 55)
  const baseR = 212, baseG = 175, baseB = 55;
  const shift = goldLuminanceShift;
  const r = Math.min(255, Math.round(baseR + (255 - baseR) * shift));
  const g = Math.min(255, Math.round(baseG + (255 - baseG) * shift));
  const bVal = Math.min(255, Math.round(baseB + (255 - baseB) * shift));
  const goldColor = `rgb(${r}, ${g}, ${bVal})`;

  const goldGlow = `rgba(${r}, ${g}, ${bVal}, ${glowOpacity.toFixed(3)})`;
  const warningGlow = `rgba(192, 57, 43, ${warningGlowOpacity.toFixed(3)})`;

  return {
    brightness: b,
    glowOpacity,
    warningGlowOpacity,
    goldLuminanceShift,
    isNightCabin,
    goldColor,
    goldGlow,
    warningGlow,
  };
}

// ── Default Values (for static use) ──────────────────────────
export const DEFAULT_GLOW = computeGlowValues(DEFAULT_BRIGHTNESS);

// ── React Hook ───────────────────────────────────────────────
export function useBrightness(): GlowValues {
  const [brightness, setBrightness] = useState(DEFAULT_BRIGHTNESS);
  const targetRef = useRef(DEFAULT_BRIGHTNESS);
  const currentRef = useRef(DEFAULT_BRIGHTNESS);
  const animFrameRef = useRef<number | null>(null);

  // Attempt to read system brightness
  useEffect(() => {
    let mounted = true;

    async function detectBrightness() {
      try {
        // Try expo-brightness if available
        if (Platform.OS !== 'web') {
          try {
            const brightnessMod = await import('expo-brightness' as any);
            if (brightnessMod?.getBrightnessAsync) {
              const val = await brightnessMod.getBrightnessAsync();
              if (mounted && typeof val === 'number') {
                targetRef.current = val;
                return;
              }
            }
          } catch {}
        }

        // Fallback: use color scheme as rough proxy
        const scheme = Appearance.getColorScheme();
        targetRef.current = scheme === 'dark' ? 0.2 : 0.6;
      } catch {
        targetRef.current = DEFAULT_BRIGHTNESS;
      }
    }

    detectBrightness();

    // Poll periodically (every 5s)
    const interval = setInterval(detectBrightness, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Smooth transition animation
  useEffect(() => {
    let lastTime = Date.now();

    function animate() {
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;

      const target = targetRef.current;
      const current = currentRef.current;
      const diff = target - current;

      if (Math.abs(diff) > 0.001) {
        // Smooth over TRANSITION_MS
        const step = diff * Math.min(1, dt / TRANSITION_MS);
        currentRef.current = current + step;
        setBrightness(currentRef.current);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return computeGlowValues(brightness);
}

// ── Static Compute (for non-hook contexts) ───────────────────
export { computeGlowValues };

