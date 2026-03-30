/**
 * ECS Animation Utilities — Phase 9
 *
 * Centralized animation helpers for consistent, performant UI transitions.
 * All durations are tuned for instrument-grade responsiveness:
 *   - Tab transitions: 150–200ms (feels instant but smooth)
 *   - Widget expand/collapse: 180ms (visible but not sluggish)
 *   - Quick Actions slide: 200ms up, 150ms down (snappy dismiss)
 *   - Edit mode highlight: 200ms fade in, 120ms fade out
 *
 * RULES:
 *   - No spring physics (cubic ease-out only)
 *   - No animations > 300ms (except loading spinners)
 *   - All animations use useNativeDriver where possible
 *   - Haptic feedback paired with major state changes
 */

import { Animated, Easing, Platform } from 'react-native';

// ── Phase 9 Motion Constants ─────────────────────────────────
export const ANIM = {
  /** Tab content fade out duration */
  tabFadeOut: 100,
  /** Tab content fade in duration */
  tabFadeIn: 150,
  /** Total tab transition (fade out + switch + fade in) */
  tabTransition: 180,

  /** Widget expand animation */
  widgetExpand: 180,
  /** Widget collapse animation */
  widgetCollapse: 150,

  /** Quick Actions sheet slide up */
  quickActionsIn: 200,
  /** Quick Actions sheet slide down (dismiss) */
  quickActionsOut: 150,
  /** Quick Actions backdrop fade */
  quickActionsBackdrop: 180,

  /** Edit mode highlight fade in */
  editHighlightIn: 200,
  /** Edit mode highlight fade out */
  editHighlightOut: 120,

  /** Button press scale down */
  buttonPressIn: 60,
  /** Button press scale up (release) */
  buttonPressOut: 100,

  /** List item appear stagger delay */
  listStagger: 30,
  /** List item appear duration */
  listItemAppear: 150,

  /** Modal content fade in */
  modalContentIn: 180,
  /** Modal content fade out */
  modalContentOut: 120,

  /** Banner slide in */
  bannerIn: 250,
  /** Banner slide out */
  bannerOut: 200,
} as const;

// ── Easing Curves ────────────────────────────────────────────
export const EASE = {
  /** Standard cubic ease-out — all transitions */
  standard: Easing.out(Easing.cubic),
  /** Decelerate — for elements entering the screen */
  decelerate: Easing.out(Easing.quad),
  /** Accelerate — for elements leaving the screen */
  accelerate: Easing.in(Easing.quad),
  /** Sharp — for quick snaps and highlights */
  sharp: Easing.out(Easing.exp),
} as const;

// ── Double-Tap Guard ─────────────────────────────────────────
// Prevents rapid double-taps from triggering actions twice.
// Returns a wrapped callback that ignores calls within the cooldown period.

const DEFAULT_COOLDOWN_MS = 300;

/**
 * Create a double-tap guarded callback.
 * The returned function ignores calls within `cooldownMs` of the last invocation.
 */
export function createTapGuard<T extends (...args: any[]) => any>(
  callback: T,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): T {
  let lastCallTime = 0;

  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCallTime < cooldownMs) {
      return; // Suppress double-tap
    }
    lastCallTime = now;
    return callback(...args);
  }) as T;
}

/**
 * Stateful tap guard — tracks last tap time externally.
 * Useful in components where the callback reference changes.
 */
export class TapGuard {
  private lastCallTime = 0;
  private cooldownMs: number;

  constructor(cooldownMs: number = DEFAULT_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs;
  }

  /** Returns true if the tap should be processed (not a double-tap) */
  shouldProcess(): boolean {
    const now = Date.now();
    if (now - this.lastCallTime < this.cooldownMs) {
      return false;
    }
    this.lastCallTime = now;
    return true;
  }

  /** Reset the guard (e.g., on unmount) */
  reset(): void {
    this.lastCallTime = 0;
  }
}

// ── Fade Transition Helpers ──────────────────────────────────

/**
 * Fade out an Animated.Value, then execute a callback, then fade in.
 * Used for tab switches and content transitions.
 */
export function fadeTransition(
  opacity: Animated.Value,
  onSwitch: () => void,
  options?: {
    fadeOutDuration?: number;
    fadeInDuration?: number;
    useNativeDriver?: boolean;
  },
): void {
  const fadeOut = options?.fadeOutDuration ?? ANIM.tabFadeOut;
  const fadeIn = options?.fadeInDuration ?? ANIM.tabFadeIn;
  const useNativeDriver = options?.useNativeDriver ?? true;

  Animated.timing(opacity, {
    toValue: 0,
    duration: fadeOut,
    easing: EASE.accelerate,
    useNativeDriver,
  }).start(() => {
    onSwitch();
    Animated.timing(opacity, {
      toValue: 1,
      duration: fadeIn,
      easing: EASE.decelerate,
      useNativeDriver,
    }).start();
  });
}

/**
 * Smooth scale press animation for buttons and interactive elements.
 * Returns { onPressIn, onPressOut } handlers.
 */
export function createPressAnimation(
  scaleValue: Animated.Value,
  scaleDown: number = 0.97,
): { onPressIn: () => void; onPressOut: () => void } {
  return {
    onPressIn: () => {
      Animated.timing(scaleValue, {
        toValue: scaleDown,
        duration: ANIM.buttonPressIn,
        easing: EASE.sharp,
        useNativeDriver: true,
      }).start();
    },
    onPressOut: () => {
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: ANIM.buttonPressOut,
        easing: EASE.standard,
        useNativeDriver: true,
      }).start();
    },
  };
}

/**
 * Widget expand/collapse animation.
 * Animates height-proxy value between 0 and 1.
 */
export function animateWidgetExpand(
  value: Animated.Value,
  expand: boolean,
  callback?: () => void,
): void {
  Animated.timing(value, {
    toValue: expand ? 1 : 0,
    duration: expand ? ANIM.widgetExpand : ANIM.widgetCollapse,
    easing: EASE.standard,
    useNativeDriver: false, // height interpolation
  }).start(callback);
}

/**
 * Edit mode highlight pulse — subtle opacity animation.
 */
export function animateEditHighlight(
  value: Animated.Value,
  show: boolean,
  callback?: () => void,
): void {
  Animated.timing(value, {
    toValue: show ? 1 : 0,
    duration: show ? ANIM.editHighlightIn : ANIM.editHighlightOut,
    easing: EASE.standard,
    useNativeDriver: true,
  }).start(callback);
}

// ── Smooth Scroll Configuration ──────────────────────────────
// Optimized scroll physics for FlatList and ScrollView.
export const SMOOTH_SCROLL_CONFIG = {
  /** Deceleration rate — 'fast' for snappy lists */
  decelerationRate: Platform.OS === 'ios' ? 0.992 : 0.985,
  /** Scroll event throttle — 16ms = 60fps */
  scrollEventThrottle: 16,
  /** Overscroll mode for Android */
  overScrollMode: 'never' as const,
  /** Bounce enabled on iOS */
  bounces: true,
  /** Show scroll indicators */
  showsVerticalScrollIndicator: false,
  /** Remove clipping for smooth edge rendering */
  removeClippedSubviews: Platform.OS === 'android',
};

// ── Staggered List Animation ─────────────────────────────────
/**
 * Create staggered fade-in animations for list items.
 * Returns an array of Animated.Value objects (one per item).
 */
export function createStaggeredEntrance(
  count: number,
  staggerDelay: number = ANIM.listStagger,
  duration: number = ANIM.listItemAppear,
): { values: Animated.Value[]; start: () => void } {
  const values = Array.from({ length: count }, () => new Animated.Value(0));

  const start = () => {
    const animations = values.map((val, index) =>
      Animated.timing(val, {
        toValue: 1,
        duration,
        delay: index * staggerDelay,
        easing: EASE.decelerate,
        useNativeDriver: true,
      })
    );
    Animated.stagger(staggerDelay, animations).start();
  };

  return { values, start };
}

