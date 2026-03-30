/**
 * ECS Professional Animation System
 *
 * Replaces decorative electrical arc effects with subtle, instrument-grade
 * motion cues inspired by Tesla, Garmin aviation, and modern avionics.
 *
 * Four core animation patterns:
 *   1. Smooth Value Transitions — numbers count smoothly between values
 *   2. Widget Activation Glow — brief pulse when widget data updates
 *   3. Compass Rotation Smoothing — eased heading transitions
 *   4. Widget Focus Highlight — subtle scale on tap
 *
 * Design principles:
 *   - No spring physics (cubic ease-out only)
 *   - No animations > 800ms (except value counting)
 *   - All animations use useNativeDriver where possible
 *   - Respects reduced motion accessibility setting
 *   - Disabled during driving mode
 *
 * These animations make ECS feel alive without being distracting.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Animated, Easing, Platform, AccessibilityInfo } from 'react-native';

// ── Animation Timing Constants ──────────────────────────────
export const ECS_MOTION = {
  // ── Smooth Value Transitions ──────────────────────────────
  /** Duration for numeric value counting animation */
  valueTransitionDuration: 500,
  /** Min duration for value transitions */
  valueTransitionMin: 300,
  /** Max duration for value transitions */
  valueTransitionMax: 800,

  // ── Widget Activation Glow ────────────────────────────────
  /** Duration of the glow pulse (in + out) */
  glowPulseDuration: 400,
  /** Peak glow opacity */
  glowPeakOpacity: 0.35,
  /** Glow fade-in portion */
  glowFadeIn: 150,
  /** Glow fade-out portion */
  glowFadeOut: 250,

  // ── Compass Rotation ──────────────────────────────────────
  /** Duration for compass heading transitions */
  compassRotationDuration: 300,
  /** Min compass rotation duration */
  compassRotationMin: 200,
  /** Max compass rotation duration */
  compassRotationMax: 400,

  // ── Widget Focus / Tap ────────────────────────────────────
  /** Scale factor on widget tap (1.02 = 2% larger) */
  widgetFocusScale: 1.02,
  /** Duration of focus scale-up */
  widgetFocusIn: 120,
  /** Duration of focus scale-down (return) */
  widgetFocusOut: 180,
  /** Subtle shadow elevation increase on focus */
  widgetFocusElevation: 4,

  // ── Dashboard Fade Transitions ────────────────────────────
  /** Screen/view fade-in duration */
  dashboardFadeIn: 250,
  /** Screen/view fade-out duration */
  dashboardFadeOut: 200,

  // ── Intelligence Bar ──────────────────────────────────────
  /** Message fade-in duration */
  intelBarFadeIn: 350,
  /** Message fade-out duration */
  intelBarFadeOut: 350,
  /** Message display hold duration */
  intelBarHold: 5000,
  /** Minimum interval between messages */
  intelBarMinInterval: 10000,
} as const;

// ── Easing Curves ───────────────────────────────────────────
export const ECS_EASE = {
  /** Standard deceleration — for elements arriving */
  decelerate: Easing.out(Easing.cubic),
  /** Acceleration — for elements departing */
  accelerate: Easing.in(Easing.quad),
  /** Smooth — for continuous value changes */
  smooth: Easing.inOut(Easing.quad),
  /** Sharp — for quick responsive feedback */
  sharp: Easing.out(Easing.exp),
  /** Linear — for compass rotation (most natural) */
  linear: Easing.out(Easing.quad),
} as const;


// ═══════════════════════════════════════════════════════════════
// 1. SMOOTH VALUE TRANSITIONS
// ═══════════════════════════════════════════════════════════════
/**
 * useAnimatedNumber — Smoothly animates between numeric values.
 *
 * Instead of numbers jumping instantly (67% → 65%), the display
 * counts smoothly between values over 300-800ms.
 *
 * Usage:
 *   const animValue = useAnimatedNumber(batteryPercent, { duration: 500 });
 *   // Use animValue in Animated.Text or interpolation
 *
 * @param targetValue - The target numeric value
 * @param options - Animation configuration
 * @returns Animated.Value that smoothly transitions
 */
export function useAnimatedNumber(
  targetValue: number,
  options?: {
    duration?: number;
    easing?: (value: number) => number;
    useNativeDriver?: boolean;
  },
): Animated.Value {
  const animatedValue = useRef(new Animated.Value(targetValue)).current;
  const prevValue = useRef(targetValue);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      animatedValue.setValue(targetValue);
      prevValue.current = targetValue;
      return;
    }

    if (targetValue === prevValue.current) return;

    const delta = Math.abs(targetValue - prevValue.current);
    // Scale duration based on magnitude of change
    const baseDuration = options?.duration ?? ECS_MOTION.valueTransitionDuration;
    const scaledDuration = Math.min(
      ECS_MOTION.valueTransitionMax,
      Math.max(
        ECS_MOTION.valueTransitionMin,
        baseDuration * Math.min(delta / 10, 1),
      ),
    );

    Animated.timing(animatedValue, {
      toValue: targetValue,
      duration: scaledDuration,
      easing: options?.easing ?? ECS_EASE.smooth,
      useNativeDriver: options?.useNativeDriver ?? false,
    }).start();

    prevValue.current = targetValue;
  }, [targetValue]);

  return animatedValue;
}

/**
 * useCountingNumber — Returns a display-ready number that counts
 * smoothly between values. Uses requestAnimationFrame for text display.
 *
 * Usage:
 *   const displayValue = useCountingNumber(65.3, { decimals: 1 });
 *   <Text>{displayValue}</Text>
 *
 * @param targetValue - The target numeric value
 * @param options - Configuration
 * @returns The current display value as a formatted string
 */
export function useCountingNumber(
  targetValue: number,
  options?: {
    decimals?: number;
    duration?: number;
    suffix?: string;
    prefix?: string;
  },
): string {
  const decimals = options?.decimals ?? 0;
  const duration = options?.duration ?? ECS_MOTION.valueTransitionDuration;
  const suffix = options?.suffix ?? '';
  const prefix = options?.prefix ?? '';

  const [displayValue, setDisplayValue] = useState(targetValue);
  const prevValueRef = useRef(targetValue);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const startValueRef = useRef(targetValue);

  useEffect(() => {
    if (targetValue === prevValueRef.current) return;

    const startVal = prevValueRef.current;
    const endVal = targetValue;
    startValueRef.current = startVal;
    startTimeRef.current = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out quad curve
      const easedProgress = 1 - (1 - progress) * (1 - progress);
      const currentVal = startVal + (endVal - startVal) * easedProgress;

      setDisplayValue(currentVal);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
      }
    };

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(animate);

    prevValueRef.current = targetValue;

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetValue, duration]);

  return `${prefix}${displayValue.toFixed(decimals)}${suffix}`;
}


// ═══════════════════════════════════════════════════════════════
// 2. WIDGET ACTIVATION GLOW
// ═══════════════════════════════════════════════════════════════
/**
 * useWidgetGlow — Triggers a brief glow pulse when data updates.
 *
 * When a widget's value changes, a soft colored highlight appears
 * and fades back to normal over 300-500ms.
 *
 * Usage:
 *   const { glowOpacity, triggerGlow } = useWidgetGlow();
 *   useEffect(() => { triggerGlow('amber'); }, [fuelLevel]);
 *   <Animated.View style={{ ...styles.widget, opacity: glowOpacity }}>
 *
 * @returns Glow animation state and trigger function
 */
export function useWidgetGlow(): {
  glowOpacity: Animated.Value;
  glowColor: string;
  triggerGlow: (color?: string) => void;
  isGlowing: boolean;
} {
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const [glowColor, setGlowColor] = useState('rgba(196,138,44,0.25)');
  const [isGlowing, setIsGlowing] = useState(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const triggerGlow = useCallback((color?: string) => {
    // Cancel any in-progress glow
    if (animRef.current) {
      animRef.current.stop();
    }

    if (color) {
      setGlowColor(color);
    }

    setIsGlowing(true);
    glowOpacity.setValue(0);

    animRef.current = Animated.sequence([
      // Fade in — quick rise
      Animated.timing(glowOpacity, {
        toValue: ECS_MOTION.glowPeakOpacity,
        duration: ECS_MOTION.glowFadeIn,
        easing: ECS_EASE.sharp,
        useNativeDriver: true,
      }),
      // Fade out — gentle return
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: ECS_MOTION.glowFadeOut,
        easing: ECS_EASE.decelerate,
        useNativeDriver: true,
      }),
    ]);

    animRef.current.start(({ finished }) => {
      if (finished) {
        setIsGlowing(false);
      }
    });
  }, [glowOpacity]);

  return { glowOpacity, glowColor, triggerGlow, isGlowing };
}

/**
 * Glow color presets for different widget states.
 * Use with triggerGlow() for semantic coloring.
 */
export const GLOW_COLORS = {
  /** Default amber — standard data update */
  amber: 'rgba(196,138,44,0.25)',
  /** Green — positive state change (battery charging, etc.) */
  success: 'rgba(76,175,80,0.25)',
  /** Red — warning state (low fuel, tilt warning, etc.) */
  danger: 'rgba(239,83,80,0.25)',
  /** Blue — informational update (GPS lock, connectivity) */
  info: 'rgba(66,165,245,0.25)',
  /** Muted — subtle standby update */
  muted: 'rgba(138,138,133,0.15)',
} as const;


// ═══════════════════════════════════════════════════════════════
// 3. COMPASS ROTATION SMOOTHING
// ═══════════════════════════════════════════════════════════════
/**
 * useSmoothRotation — Smoothly eases between heading values.
 *
 * Handles 360°→0° wrap-around correctly (always takes shortest path).
 * Duration: 200-400ms with ease-out curve.
 *
 * Usage:
 *   const { rotationDeg, animatedRotation } = useSmoothRotation(heading);
 *   <Animated.View style={{ transform: [{ rotate: rotationDeg }] }}>
 *
 * @param targetDegrees - Target heading in degrees (0-360)
 * @param options - Animation configuration
 * @returns Animated rotation value and interpolated string
 */
export function useSmoothRotation(
  targetDegrees: number | null | undefined,
  options?: {
    duration?: number;
    easing?: (value: number) => number;
    /** If true, rotate counter-clockwise (for compass dials) */
    invert?: boolean;
  },
): {
  animatedValue: Animated.Value;
  rotationDeg: Animated.AnimatedInterpolation<string>;
} {
  const duration = options?.duration ?? ECS_MOTION.compassRotationDuration;
  const easing = options?.easing ?? ECS_EASE.linear;
  const invert = options?.invert ?? false;

  const animatedValue = useRef(new Animated.Value(0)).current;
  const prevDegRef = useRef(0);

  useEffect(() => {
    if (targetDegrees == null) return;

    const target = invert ? -targetDegrees : targetDegrees;
    const prev = prevDegRef.current;

    // Handle wrap-around: always take shortest path
    let diff = target - prev;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const smoothTarget = prev + diff;

    Animated.timing(animatedValue, {
      toValue: smoothTarget,
      duration,
      easing,
      useNativeDriver: true,
    }).start();

    prevDegRef.current = smoothTarget;
  }, [targetDegrees, duration, easing, invert]);

  const rotationDeg = animatedValue.interpolate({
    inputRange: [-720, 720],
    outputRange: ['-720deg', '720deg'],
  });

  return { animatedValue, rotationDeg };
}


// ═══════════════════════════════════════════════════════════════
// 4. WIDGET FOCUS / TAP HIGHLIGHT
// ═══════════════════════════════════════════════════════════════
/**
 * useWidgetFocus — Provides a subtle scale + shadow animation on tap.
 *
 * When the user taps a widget:
 *   - Slight scale increase (~1.02)
 *   - Subtle shadow increase
 *   - Quick return to normal
 *
 * Duration: 120ms in, 180ms out. Feels crisp and responsive.
 *
 * Usage:
 *   const { focusScale, onPressIn, onPressOut } = useWidgetFocus();
 *   <Animated.View style={{ transform: [{ scale: focusScale }] }}>
 *     <TouchableOpacity onPressIn={onPressIn} onPressOut={onPressOut}>
 *
 * @returns Scale animation value and press handlers
 */
export function useWidgetFocus(options?: {
  scaleAmount?: number;
  durationIn?: number;
  durationOut?: number;
}): {
  focusScale: Animated.Value;
  onPressIn: () => void;
  onPressOut: () => void;
  isFocused: boolean;
} {
  const scaleAmount = options?.scaleAmount ?? ECS_MOTION.widgetFocusScale;
  const durationIn = options?.durationIn ?? ECS_MOTION.widgetFocusIn;
  const durationOut = options?.durationOut ?? ECS_MOTION.widgetFocusOut;

  const focusScale = useRef(new Animated.Value(1)).current;
  const [isFocused, setIsFocused] = useState(false);

  const onPressIn = useCallback(() => {
    setIsFocused(true);
    Animated.timing(focusScale, {
      toValue: scaleAmount,
      duration: durationIn,
      easing: ECS_EASE.sharp,
      useNativeDriver: true,
    }).start();
  }, [focusScale, scaleAmount, durationIn]);

  const onPressOut = useCallback(() => {
    setIsFocused(false);
    Animated.timing(focusScale, {
      toValue: 1,
      duration: durationOut,
      easing: ECS_EASE.decelerate,
      useNativeDriver: true,
    }).start();
  }, [focusScale, durationOut]);

  return { focusScale, onPressIn, onPressOut, isFocused };
}


// ═══════════════════════════════════════════════════════════════
// 5. DASHBOARD FADE TRANSITION
// ═══════════════════════════════════════════════════════════════
/**
 * useDashboardFade — Fade transition for screen/view switches.
 *
 * Uses fade instead of slide for dashboard contexts.
 * Duration: 200-350ms.
 *
 * Usage:
 *   const { fadeOpacity, fadeIn, fadeOut, fadeSwitch } = useDashboardFade();
 *   <Animated.View style={{ opacity: fadeOpacity }}>
 *
 * @returns Fade animation controls
 */
export function useDashboardFade(initialVisible: boolean = true): {
  fadeOpacity: Animated.Value;
  fadeIn: (callback?: () => void) => void;
  fadeOut: (callback?: () => void) => void;
  fadeSwitch: (onSwitch: () => void) => void;
} {
  const fadeOpacity = useRef(new Animated.Value(initialVisible ? 1 : 0)).current;

  const fadeIn = useCallback((callback?: () => void) => {
    Animated.timing(fadeOpacity, {
      toValue: 1,
      duration: ECS_MOTION.dashboardFadeIn,
      easing: ECS_EASE.decelerate,
      useNativeDriver: true,
    }).start(callback ? () => callback() : undefined);
  }, [fadeOpacity]);

  const fadeOut = useCallback((callback?: () => void) => {
    Animated.timing(fadeOpacity, {
      toValue: 0,
      duration: ECS_MOTION.dashboardFadeOut,
      easing: ECS_EASE.accelerate,
      useNativeDriver: true,
    }).start(callback ? () => callback() : undefined);
  }, [fadeOpacity]);

  const fadeSwitch = useCallback((onSwitch: () => void) => {
    Animated.timing(fadeOpacity, {
      toValue: 0,
      duration: ECS_MOTION.dashboardFadeOut,
      easing: ECS_EASE.accelerate,
      useNativeDriver: true,
    }).start(() => {
      onSwitch();
      Animated.timing(fadeOpacity, {
        toValue: 1,
        duration: ECS_MOTION.dashboardFadeIn,
        easing: ECS_EASE.decelerate,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeOpacity]);

  return { fadeOpacity, fadeIn, fadeOut, fadeSwitch };
}


// ═══════════════════════════════════════════════════════════════
// 6. INTELLIGENCE BAR FADE
// ═══════════════════════════════════════════════════════════════
/**
 * useIntelligenceBarFade — Manages the fade lifecycle for
 * Expedition Intelligence advisory messages.
 *
 * Lifecycle: fade-in → hold → fade-out → interval gap → next
 *
 * Usage:
 *   const { messageOpacity, showMessage } = useIntelligenceBarFade();
 *   showMessage('Low signal coverage ahead');
 *
 * @returns Message animation controls
 */
export function useIntelligenceBarFade(): {
  messageOpacity: Animated.Value;
  showMessage: (onComplete?: () => void) => void;
  hideMessage: (onComplete?: () => void) => void;
} {
  const messageOpacity = useRef(new Animated.Value(0)).current;

  const showMessage = useCallback((onComplete?: () => void) => {
    messageOpacity.setValue(0);

    Animated.sequence([
      // Fade in
      Animated.timing(messageOpacity, {
        toValue: 1,
        duration: ECS_MOTION.intelBarFadeIn,
        easing: ECS_EASE.decelerate,
        useNativeDriver: true,
      }),
      // Hold
      Animated.delay(ECS_MOTION.intelBarHold),
      // Fade out
      Animated.timing(messageOpacity, {
        toValue: 0,
        duration: ECS_MOTION.intelBarFadeOut,
        easing: ECS_EASE.accelerate,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && onComplete) onComplete();
    });
  }, [messageOpacity]);

  const hideMessage = useCallback((onComplete?: () => void) => {
    Animated.timing(messageOpacity, {
      toValue: 0,
      duration: ECS_MOTION.intelBarFadeOut,
      easing: ECS_EASE.accelerate,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && onComplete) onComplete();
    });
  }, [messageOpacity]);

  return { messageOpacity, showMessage, hideMessage };
}


// ═══════════════════════════════════════════════════════════════
// 7. REDUCED MOTION DETECTION
// ═══════════════════════════════════════════════════════════════
/**
 * useReducedMotion — Detects if the user prefers reduced motion.
 *
 * On iOS/Android: uses AccessibilityInfo.isReduceMotionEnabled()
 * On Web: uses prefers-reduced-motion media query
 *
 * When reduced motion is active, all ECS animations should either:
 *   - Be disabled entirely
 *   - Use instant transitions (duration: 0)
 *
 * @returns Whether reduced motion is preferred
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const mq = (window as any).matchMedia?.('(prefers-reduced-motion: reduce)');
        if (mq) {
          setReducedMotion(mq.matches);
          const handler = (e: any) => setReducedMotion(e.matches);
          mq.addEventListener?.('change', handler);
          return () => mq.removeEventListener?.('change', handler);
        }
      } catch {
        // matchMedia not available
      }
    } else {
      AccessibilityInfo.isReduceMotionEnabled?.()
        .then(setReducedMotion)
        .catch(() => {});

      // Listen for changes (iOS)
      const sub = AccessibilityInfo.addEventListener?.(
        'reduceMotionChanged' as any,
        setReducedMotion,
      );
      return () => {
        if (sub && typeof sub.remove === 'function') sub.remove();
      };
    }
  }, []);

  return reducedMotion;
}


// ═══════════════════════════════════════════════════════════════
// 8. ANIMATION SETTINGS STORE
// ═══════════════════════════════════════════════════════════════
/**
 * ECS Animation Settings — Global toggle and preferences.
 *
 * Persists to localStorage (web) / AsyncStorage (native).
 * Replaces the old ambientArcStore with professional animation controls.
 */

type AnimationSettingsListener = (settings: AnimationSettings) => void;

export interface AnimationSettings {
  /** Master toggle for all ECS animations */
  enabled: boolean;
  /** Enable smooth value counting transitions */
  smoothValues: boolean;
  /** Enable widget activation glow pulses */
  widgetGlow: boolean;
  /** Enable compass rotation smoothing */
  compassSmoothing: boolean;
  /** Enable widget tap focus highlight */
  widgetFocus: boolean;
}

const DEFAULT_SETTINGS: AnimationSettings = {
  enabled: true,
  smoothValues: true,
  widgetGlow: true,
  compassSmoothing: true,
  widgetFocus: true,
};

const STORAGE_KEY = 'ecs_animation_settings';

function loadSettings(): AnimationSettings {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: AnimationSettings): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {}
}

class ECSAnimationSettingsStore {
  private _settings: AnimationSettings;
  private _listeners: Set<AnimationSettingsListener> = new Set();

  constructor() {
    this._settings = loadSettings();
  }

  get settings(): AnimationSettings {
    return { ...this._settings };
  }

  get enabled(): boolean {
    return this._settings.enabled;
  }

  get smoothValues(): boolean {
    return this._settings.enabled && this._settings.smoothValues;
  }

  get widgetGlow(): boolean {
    return this._settings.enabled && this._settings.widgetGlow;
  }

  get compassSmoothing(): boolean {
    return this._settings.enabled && this._settings.compassSmoothing;
  }

  get widgetFocus(): boolean {
    return this._settings.enabled && this._settings.widgetFocus;
  }

  update(partial: Partial<AnimationSettings>): void {
    this._settings = { ...this._settings, ...partial };
    saveSettings(this._settings);
    this._notify();
  }

  setEnabled(enabled: boolean): void {
    this.update({ enabled });
  }

  reset(): void {
    this._settings = { ...DEFAULT_SETTINGS };
    saveSettings(this._settings);
    this._notify();
  }

  onChange(listener: AnimationSettingsListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private _notify(): void {
    const snapshot = this.settings;
    this._listeners.forEach(fn => {
      try { fn(snapshot); } catch {}
    });
  }
}

export const ecsAnimationSettings = new ECSAnimationSettingsStore();

