/**
 * AttitudeMonitorWidget
 *
 * Tactical aircraft-style digital horizon instrument showing vehicle orientation:
 * - Front-facing metallic gold truck image (rotation-ready HUD reference model)
 * - Roll rotation (left/right tilt) anchored at axle center
 * - Pitch visualization via translateY vertical shift (no perspective distortion)
 * - Counter-rotating horizon reference line (matches real attitude indicator behavior)
 * - Horizon pitch-shift: subtle opposite translateY reinforces instrument metaphor
 * - CG marker dot (moves based on computed center of mass)
 * - Gravity vector line
 * - Roll gauge (horizontal) + Pitch gauge (vertical)
 * - Stability index display + dynamic threshold indicators
 * - Real-time accelerometer integration with calibration
 * - Haptic feedback for stability threshold crossing
 * - Default calibrated for vertical phone mount
 * - Demo Mode: cycles through predefined tilt scenarios with smooth transitions
 * - Configurable tilt alert thresholds with settings panel
 * - Audio alerts with selectable tones and visual screen flash warnings
 * - Alert history log with timestamps and GPS coordinates
 *
 * V3: Replaced View-based schematic with front-facing truck PNG.
 * V4: Added Demo Mode with scenario cycling and pulsing badge.
 * V5: Added configurable tilt alert thresholds, flash/audio alerts, alert history.
 * V6: Added sound picker with 6 distinct alert tones (Web Audio API synthesis),
 *     per-severity sound selection, test/preview buttons, and waveform visualization.
 * V7: Instrument-grade mechanical motion refinement:
 *     - Rolling average input smoothing (4-sample window)
 *     - Dead-zone filter (< 0.2° changes suppressed)
 *     - Low-pass filter layer on top of accelerometer filter
 *     - Dynamic animation duration (200–350ms scaled by delta magnitude)
 *     - Bezier ease-out curve with controlled damping, no bounce/elastic
 *     - Clean settling without oscillation or spring physics
 * V8: Replaced perspective-based rotateX pitch with clean translateY shift:
 *     - Truck image shifts vertically within a clipped container
 *     - Fixed horizon reference line remains stationary (instrument metaphor)
 *     - TranslateY proportional to pitch angle, clamped to visible bounds
 *     - Eliminates perspective skewing at extreme angles
 *     - Rotation pivot remains exact center for roll
 *     - Crisp rendering at all pitch angles
 * V9: Counter-rotating horizon reference line (real attitude indicator behavior):
 *     - Horizon line counter-rotates opposite to the truck's roll angle
 *     - When truck rolls +15° right, horizon tilts -15° left
 *     - Uses inverted rollAnim interpolation for synchronized animation
 *     - Horizon remains vertically fixed (no translateY) — only rotates for roll
 *     - Matches real aircraft attitude indicator bank angle behavior
 * V10: Horizon pitch-shift (dual-axis attitude indicator fidelity):
 *     - Horizon line now shifts vertically OPPOSITE to the truck's pitch translateY
 *     - When truck shifts down (nose-down pitch), horizon shifts subtly UP
 *     - Uses HORIZON_PITCH_SCALE (0.35) — 35% of truck's pitch magnitude
 *     - Subtle enough not to compete with the truck's primary pitch movement
 *     - Combined with V9 counter-rotation for full dual-axis horizon behavior
 *     - Uses same pitchAnim value with inverted, scaled interpolation
 *     - Processed through the same motion engine pipeline for consistency
 * V11: Subtle Safety Emphasis Model:
 *     - Three-tier visual emphasis: Normal (<15°), Caution (15–25°), High Risk (>25°)
 *     - Normal: standard matte styling, default accent color
 *     - Caution: +6% accent brightness, 1.5px horizon line, slightly bolder numerics
 *     - High Risk: muted industrial warning accent (#B5704A), 2px horizon, border pulse
 *     - Smooth 200ms fade transitions between states (no abrupt snaps)
 *     - High Risk border pulse: 1.75s sine wave, subtle opacity range
 *     - Maintains readability in daylight and premium industrial aesthetic
 *     - No red, no flashing, no screen shaking, no background color takeover
 */





import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  Image,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';

import { TACTICAL } from '../../lib/theme';
import { hapticCommand, hapticWarning, checkStabilityThreshold } from '../../lib/haptics';
import type { AttitudeWeightSignals, AttitudeAlertSeverity } from '../../lib/vehicleWeightEngine';
import { getAttitudeAlertColor } from '../../lib/vehicleWeightEngine';
import type { RiskLevel } from '../../lib/terrainRiskEngine';

import {
  computeStability,
  computeSimplifiedStability,
  DEFAULT_VEHICLE_BASELINE,
  type LoadModule,
  type StabilityResult,
  type VehicleBaseline,
} from '../../lib/stabilityEngine';
import {
  loadPreferences,
  savePreferences,
  loadAlertHistory,
  appendAlertEvent,
  clearAlertHistory as clearAlertHistoryStore,
  checkThresholds,
  generateAlertId,
  type TiltAlertPreferences,
  type TiltAlertEvent,
  type TiltThresholds,
} from '../../lib/tiltAlertStore';
import { playAlertSound, getSoundDef } from '../../lib/alertSounds';
import {
  createMotionState,
  processAngle,
  setMotionTarget,
  resetMotionState,
  INSTRUMENT_EASING,
  type MotionEngineState,
} from '../../lib/attitudeMotionEngine';
import TiltAlertSettingsPanel from './TiltAlertSettingsPanel';
import AlertHistoryLog from './AlertHistoryLog';


// ── Constants ──────────────────────────────────────────────────
/**
 * V16: Local bundled vehicle silhouette asset.
 * Uses a safe dynamic require so the widget still renders if the asset
 * is missing from the bundle (falls back to a tinted View placeholder).
 */
const TRUCK_IMAGE_SOURCE = {
  uri: "https://ppqcqigdxdofsvpiyial.databasepad.com/storage/v1/object/public/ecs/public/Attitude_Truck_Silhouette.png"
};




/**
 * V13: Reference dimensions for the vehicle image coordinate space.
 * These define the virtual canvas used for CG marker positioning,
 * gravity vector placement, and axle-center rotation calculations.
 * The actual rendered size is computed dynamically via truckScale.
 */
const IMAGE_HEIGHT = 1024;
const IMAGE_WIDTH = 1024;
const AXLE_RATIO = 0.78;
const AXLE_OFFSET = (AXLE_RATIO - 0.5) * IMAGE_HEIGHT;


/**
 * V16: Maximum vertical translation (pixels) for pitch visualization.
 * Reduced from 90px to 32px for more realistic instrument movement.
 * At ±30° pitch, the truck shifts ±MAX_PITCH_TRANSLATE_Y pixels.
 * Clamped to keep the truck image within the visible clipped container.
 *
 * Positive pitch (nose up / climbing) → truck shifts UP (negative translateY)
 * Negative pitch (nose down / descending) → truck shifts DOWN (positive translateY)
 *
 * The fixed horizon reference line stays centered while the truck moves,
 * reinforcing the attitude instrument metaphor.
 *
 * V16: Reduced from 90 → 32 to prevent exaggerated vertical shifts
 * and keep the silhouette within the display area during pitch animation.
 */
const MAX_PITCH_TRANSLATE_Y = 32;

/**
 * V10: Horizon pitch-shift scale factor.
 * The horizon line shifts vertically OPPOSITE to the truck's pitch translateY,
 * at this fraction of the truck's magnitude. 0.35 = 35%.
 *
 * V16: With MAX_PITCH_TRANSLATE_Y now 32px, the horizon shifts ±11.2px (35% of 32).
 * This subtle counter-movement reinforces the attitude indicator metaphor
 * without competing with the truck's primary pitch motion.
 */
const HORIZON_PITCH_SCALE = 0.35;
const HORIZON_MAX_PITCH_TRANSLATE_Y = MAX_PITCH_TRANSLATE_Y * HORIZON_PITCH_SCALE;


/**
 * Roll gauge half-width in pixels.
 * The roll indicator translateX ranges from -ROLL_GAUGE_HALF_W to +ROLL_GAUGE_HALF_W
 * corresponding to -30° to +30° roll. Used for the horizontal roll gauge below
 * the vehicle display area.
 */
const ROLL_GAUGE_HALF_W = 60;

/** Number of tick marks on the roll gauge (including center). */
const ROLL_TICK_COUNT = 7; // -30, -20, -10, 0, 10, 20, 30


/**
 * V11: Safety Emphasis Model — Threshold Constants
 *
 * Three-tier visual emphasis based on max(abs(roll), abs(pitch)):
 *   Normal:    < 15°  — standard matte styling
 *   Caution:   15–25° — slight accent brightness increase, thicker horizon
 *   High Risk: > 25°  — muted industrial warning tone, border pulse
 *
 * These thresholds are independent of the tilt alert system (V5).
 * The alert system handles notifications/sounds; this system handles
 * restrained visual emphasis only. No red, no flashing, no shaking.
 */
const SAFETY_NORMAL_MAX_DEG = 15;
const SAFETY_CAUTION_MAX_DEG = 25;

// V11: Safety Emphasis transition duration (ms) — smooth fade, no snap
const SAFETY_TRANSITION_MS = 200;

// V11: High Risk border pulse period (ms) — 1.75s full sine cycle
const SAFETY_PULSE_PERIOD_MS = 1750;

// V11: Safety accent colors
// Normal:    default TACTICAL.amber (#B58B3A)
// Caution:   ~6% brighter amber, slightly warmer
// High Risk: muted industrial warning — burnt sienna/ochre, NOT red
const SAFETY_ACCENT_NORMAL = TACTICAL.amber;
const SAFETY_ACCENT_CAUTION = '#C49842';
const SAFETY_ACCENT_HIGH_RISK = '#B5704A';

// V11: Horizon line colors per safety state
const SAFETY_HORIZON_COLOR_NORMAL = 'rgba(181, 139, 58, 0.18)';
const SAFETY_HORIZON_COLOR_CAUTION = 'rgba(196, 152, 66, 0.25)';
const SAFETY_HORIZON_COLOR_HIGH_RISK = 'rgba(181, 112, 74, 0.34)';

// V11: Horizon pip border colors per safety state
const SAFETY_PIP_COLOR_NORMAL = 'rgba(181, 139, 58, 0.30)';
const SAFETY_PIP_COLOR_CAUTION = 'rgba(196, 152, 66, 0.38)';
const SAFETY_PIP_COLOR_HIGH_RISK = 'rgba(181, 112, 74, 0.48)';

// V11: Border pulse color (high risk only)
const SAFETY_BORDER_PULSE_COLOR = '#B5704A';

type SafetyState = 'normal' | 'caution' | 'highRisk';



/**
 * Instrument easing function — custom bezier curve that provides:
 * - Quick initial response (instrument snaps toward target)
 * - Gradual deceleration (controlled settling)
 * - No overshoot, no bounce, no oscillation
 */
const instrumentEasing = Easing.bezier(
  INSTRUMENT_EASING.p1x,
  INSTRUMENT_EASING.p1y,
  INSTRUMENT_EASING.p2x,
  INSTRUMENT_EASING.p2y,
);


// Alert cooldown — don't record duplicate alerts within this window
const ALERT_COOLDOWN_MS = 3000;

// ── Demo Scenarios ─────────────────────────────────────────────
interface DemoScenario {
  name: string;
  shortName: string;
  roll: number;
  pitch: number;
  description: string;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    name: 'Level Ground',
    shortName: 'LEVEL',
    roll: 0,
    pitch: 0,
    description: 'Vehicle on flat terrain — baseline reference',
  },
  {
    name: 'Side Hill',
    shortName: 'SIDE HILL',
    roll: 18,
    pitch: 2,
    description: 'Traversing a steep hillside laterally',
  },
  {
    name: 'Steep Climb',
    shortName: 'CLIMB',
    roll: 2,
    pitch: 22,
    description: 'Ascending a steep grade head-on',
  },
  {
    name: 'Off-Camber Turn',
    shortName: 'OFF-CAMBER',
    roll: -14,
    pitch: 8,
    description: 'Cornering on an off-camber slope',
  },
  {
    name: 'Steep Descent',
    shortName: 'DESCENT',
    roll: -3,
    pitch: -18,
    description: 'Descending a steep grade nose-down',
  },
  {
    name: 'Rock Crawl',
    shortName: 'ROCK CRAWL',
    roll: 10,
    pitch: 15,
    description: 'Slow obstacle negotiation — high articulation',
  },
];

const DEMO_CYCLE_MS = 3500; // time per scenario

interface Props {
  advancedEnabled: boolean;
  loadModules: LoadModule[];
  vehicleBaseline?: VehicleBaseline;
  rollAngleDeg?: number;
  pitchAngleDeg?: number;
  sensorStatus?: 'LIVE' | 'CALIBRATED' | 'OFFLINE' | 'UNAVAILABLE';
  isCalibrated?: boolean;
  onCalibrate?: () => void;
  onResetCalibration?: () => void;
  /** Phase 5C: Weight-derived alert signals for subtle amber/red indicators */
  weightSignals?: AttitudeWeightSignals;
  /** Phase 6D: Terrain risk level from terrainRiskEngine */
  terrainRiskLevel?: RiskLevel;
  /** Phase 6D: Terrain risk score 0–100 */
  terrainRiskScore?: number;
  /** Phase 6D: Short driver explanations from terrainRiskEngine */
  terrainRiskDrivers?: string[];
}

// ── Terrain Risk Helpers (Phase 6D) ────────────────────────────
function getTerrainRiskLabel(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'LOW';
    case 'moderate': return 'MOD';
    case 'high': return 'HIGH';
    case 'critical': return 'CRIT';
  }
}
function getTerrainRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return '#4CAF50';
    case 'moderate': return TACTICAL.amber;
    case 'high': return '#E67E22';
    case 'critical': return '#C0392B';
  }
}


// ── Helpers ────────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getAngleColor(
  angle: number,
  warning: number,
  highRisk: number,
  critical: number,
): string {
  const abs = Math.abs(angle);
  if (abs >= critical) return '#C0392B';
  if (abs >= highRisk) return '#E67E22';
  if (abs >= warning) return '#C48A2C';
  return '#4CAF50';
}

function getSensorStatusColor(status: string): string {
  switch (status) {
    case 'LIVE':
      return '#4CAF50';
    case 'CALIBRATED':
      return TACTICAL.amber;
    case 'OFFLINE':
      return '#E67E22';
    case 'UNAVAILABLE':
      return TACTICAL.textMuted;
    default:
      return TACTICAL.textMuted;
  }
}

// (Audio alert playback is now handled by app/lib/alertSounds.ts via playAlertSound)



// ── GPS helper ─────────────────────────────────────────────────
function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 2000, maximumAge: 10000 },
        );
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

// ── Component ──────────────────────────────────────────────────
export default function AttitudeMonitorWidget({
  advancedEnabled,
  loadModules,
  vehicleBaseline,
  rollAngleDeg = 0,
  pitchAngleDeg = 0,
  sensorStatus = 'UNAVAILABLE',
  isCalibrated = false,
  onCalibrate,
  onResetCalibration,
  weightSignals,
}: Props) {
  const baseline = vehicleBaseline || DEFAULT_VEHICLE_BASELINE;

  // ── V12: Responsive Stage Measurement ──────────────────────
  // Measure the vehicle display area on layout to compute a responsive
  // scale factor. Only recomputes when container size changes (not on
  // every sensor tick). Prevents the truck from being cropped or invisible.
  const STAGE_PADDING = 16; // safe zone so truck never touches edges
  const MIN_SCALE = 0.05;   // prevent invisible render
  const MAX_SCALE = 1.25;   // prevent over-enlargement

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const handleStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStageSize(prev => {
      // Debounce: only update if change is meaningful (> 2px)
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) return prev;
      return { width, height };
    });
  }, []);

  // V16: Compute responsive scale using "contain" logic with ECS safety margin.
  // scale = min(availW / imageW, availH / imageH) * 0.86, clamped.
  // The 0.86 factor ensures the vehicle never touches widget edges
  // and remains visually centered during pitch/roll animation.
  // Scaling behaves consistently across phones and tablets.
  const truckScale = useMemo(() => {
    const { width: sw, height: sh } = stageSize;
    if (sw <= 0 || sh <= 0) return 0;
    const availW = sw - STAGE_PADDING * 2;
    const availH = sh - STAGE_PADDING * 2;
    const rawScale = Math.min(availW / IMAGE_WIDTH, availH / IMAGE_HEIGHT);

    /*
     * V16: Apply ECS safety margin so the vehicle never touches widget edges
     * and remains visually centered during pitch/roll animation.
     */
    const tunedScale = rawScale * 0.86;

    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, tunedScale));
  }, [stageSize]);


  const stageReady = truckScale > 0;

  // V16: Local bundled asset — no prefetch, retry, or fallback logic needed.
  // The image loads instantly from the app bundle.




  // V13: Computed scaled dimensions for layout sizing wrapper.
  // The vehicleTransformWrap renders at original IMAGE dimensions,
  // then a scale transform visually shrinks it. The sizing wrapper
  // provides correct layout space so surrounding elements don't overlap.
  const scaledW = IMAGE_WIDTH * truckScale;
  const scaledH = IMAGE_HEIGHT * truckScale;


  // ── Demo Mode State ────────────────────────────────────────
  const [demoActive, setDemoActive] = useState(false);
  const [demoScenarioIdx, setDemoScenarioIdx] = useState(0);
  const demoPulseAnim = useRef(new Animated.Value(1)).current;
  const demoProgressAnim = useRef(new Animated.Value(0)).current;

  const currentScenario = DEMO_SCENARIOS[demoScenarioIdx];

  // Effective roll/pitch — demo overrides props
  const effectiveRoll = demoActive ? currentScenario.roll : rollAngleDeg;
  const effectivePitch = demoActive ? currentScenario.pitch : pitchAngleDeg;

  // ── Tilt Alert State ───────────────────────────────────────
  const [alertPrefs, setAlertPrefs] = useState<TiltAlertPreferences>(() => loadPreferences());
  const [alertHistory, setAlertHistory] = useState<TiltAlertEvent[]>(() => loadAlertHistory());
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const lastAlertTimeRef = useRef<{ roll: number; pitch: number }>({ roll: 0, pitch: 0 });
  const prevAlertStateRef = useRef<{ roll: boolean; pitch: boolean }>({ roll: false, pitch: false });

  // ── Flash Animation ────────────────────────────────────────
  const flashAnim = useRef(new Animated.Value(0)).current;
  const flashColorRef = useRef<'warning' | 'critical'>('warning');
  const isFlashingRef = useRef(false);

  const triggerFlash = useCallback((critical: boolean) => {
    if (!alertPrefs.flashAlertsEnabled) return;
    flashColorRef.current = critical ? 'critical' : 'warning';
    if (isFlashingRef.current) return;
    isFlashingRef.current = true;
    const flashSequence = Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0.7, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]);
    flashSequence.start(() => {
      isFlashingRef.current = false;
    });
  }, [alertPrefs.flashAlertsEnabled, flashAnim]);

  // ── Alert Preferences Update ───────────────────────────────
  const handleUpdatePrefs = useCallback((prefs: TiltAlertPreferences) => {
    setAlertPrefs(prefs);
    savePreferences(prefs);
  }, []);

  const handleClearHistory = useCallback(() => {
    const cleared = clearAlertHistoryStore();
    setAlertHistory(cleared);
  }, []);

  // ── Demo cycling ───────────────────────────────────────────
  useEffect(() => {
    if (!demoActive) {
      setDemoScenarioIdx(0);
      return;
    }

    const interval = setInterval(() => {
      setDemoScenarioIdx((prev) => (prev + 1) % DEMO_SCENARIOS.length);
    }, DEMO_CYCLE_MS);

    return () => clearInterval(interval);
  }, [demoActive]);

  // ── Demo progress bar animation ────────────────────────────
  useEffect(() => {
    if (!demoActive) {
      demoProgressAnim.setValue(0);
      return;
    }
    demoProgressAnim.setValue(0);
    Animated.timing(demoProgressAnim, {
      toValue: 1,
      duration: DEMO_CYCLE_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [demoActive, demoScenarioIdx]);

  // ── Demo badge pulse ───────────────────────────────────────
  useEffect(() => {
    if (!demoActive) {
      demoPulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(demoPulseAnim, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(demoPulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [demoActive]);

  const handleToggleDemo = useCallback(() => {
    hapticCommand();
    setDemoActive((prev) => !prev);
  }, []);

  const handleSelectScenario = useCallback(
    (idx: number) => {
      if (!demoActive) return;
      hapticCommand();
      setDemoScenarioIdx(idx);
    },
    [demoActive],
  );

  // ── Stability computation ──────────────────────────────────
  const stability: StabilityResult = useMemo(() => {
    if (advancedEnabled && loadModules.length > 0) {
      return computeStability(baseline, loadModules, effectiveRoll);
    }
    return computeSimplifiedStability(effectiveRoll);
  }, [advancedEnabled, loadModules, baseline, effectiveRoll]);

  // ── Determine active thresholds ────────────────────────────
  const activeThresholds: TiltThresholds = useMemo(() => {
    if (alertPrefs.useCustomThresholds) {
      return alertPrefs.thresholds;
    }
    // Use computed thresholds from stability engine
    return {
      rollWarningDeg: stability.rollWarningDeg,
      rollCriticalDeg: stability.criticalRollAngleDeg,
      pitchWarningDeg: stability.pitchWarningDeg,
      pitchCriticalDeg: stability.criticalPitchAngleDeg,
    };
  }, [alertPrefs, stability]);

  // ── Threshold checking & alert recording ───────────────────
  const alertCheckResult = useMemo(
    () => checkThresholds(effectiveRoll, effectivePitch, activeThresholds),
    [effectiveRoll, effectivePitch, activeThresholds],
  );

  useEffect(() => {
    const now = Date.now();
    const prevRoll = prevAlertStateRef.current.roll;
    const prevPitch = prevAlertStateRef.current.pitch;
    const rollAlertNow = alertCheckResult.rollSeverity !== null;
    const pitchAlertNow = alertCheckResult.pitchSeverity !== null;

    // Record roll alert on threshold crossing (rising edge)
    if (rollAlertNow && !prevRoll && (now - lastAlertTimeRef.current.roll) > ALERT_COOLDOWN_MS) {
      lastAlertTimeRef.current.roll = now;
      const event: TiltAlertEvent = {
        id: generateAlertId(),
        timestamp: now,
        severity: alertCheckResult.rollSeverity!,
        axis: 'ROLL',
        angleDeg: effectiveRoll,
        thresholdDeg: alertCheckResult.rollSeverity === 'CRITICAL'
          ? activeThresholds.rollCriticalDeg
          : activeThresholds.rollWarningDeg,
        scenarioName: demoActive ? currentScenario.name : undefined,
      };
      // Attempt GPS
      getCurrentPosition().then((pos) => {
        if (pos) {
          event.latitude = pos.lat;
          event.longitude = pos.lng;
        }
        const updated = appendAlertEvent(event);
        setAlertHistory(updated);
      });
      // Trigger flash and audio
      triggerFlash(alertCheckResult.rollSeverity === 'CRITICAL');
      if (alertPrefs.audioAlertsEnabled) {
        const isCrit = alertCheckResult.rollSeverity === 'CRITICAL';
        playAlertSound(isCrit ? alertPrefs.criticalSoundId : alertPrefs.warningSoundId, isCrit);
      }

      if (alertCheckResult.rollSeverity === 'CRITICAL') {
        hapticWarning();
      }
    }

    // Record pitch alert on threshold crossing (rising edge)
    if (pitchAlertNow && !prevPitch && (now - lastAlertTimeRef.current.pitch) > ALERT_COOLDOWN_MS) {
      lastAlertTimeRef.current.pitch = now;
      const event: TiltAlertEvent = {
        id: generateAlertId(),
        timestamp: now,
        severity: alertCheckResult.pitchSeverity!,
        axis: 'PITCH',
        angleDeg: effectivePitch,
        thresholdDeg: alertCheckResult.pitchSeverity === 'CRITICAL'
          ? activeThresholds.pitchCriticalDeg
          : activeThresholds.pitchWarningDeg,
        scenarioName: demoActive ? currentScenario.name : undefined,
      };
      getCurrentPosition().then((pos) => {
        if (pos) {
          event.latitude = pos.lat;
          event.longitude = pos.lng;
        }
        const updated = appendAlertEvent(event);
        setAlertHistory(updated);
      });
      triggerFlash(alertCheckResult.pitchSeverity === 'CRITICAL');
      if (alertPrefs.audioAlertsEnabled) {
        const isCrit = alertCheckResult.pitchSeverity === 'CRITICAL';
        playAlertSound(isCrit ? alertPrefs.criticalSoundId : alertPrefs.warningSoundId, isCrit);
      }

      if (alertCheckResult.pitchSeverity === 'CRITICAL') {
        hapticWarning();
      }
    }

    prevAlertStateRef.current = { roll: rollAlertNow, pitch: pitchAlertNow };
  }, [alertCheckResult, effectiveRoll, effectivePitch, activeThresholds, alertPrefs, demoActive, currentScenario, triggerFlash]);

  // ── Haptic feedback (original stability-based) ─────────────
  useEffect(() => {
    if (!demoActive) {
      checkStabilityThreshold(stability.stabilityIndex);
    }
  }, [stability.stabilityIndex, demoActive]);

  const handleCalibrate = useCallback(() => {
    hapticCommand();
    onCalibrate?.();
  }, [onCalibrate]);

  // ── Motion Engine State (V7) ────────────────────────────────
  // Separate motion state per axis — maintains rolling average buffer,
  // low-pass filter state, and dead-zone tracking independently.
  const rollMotionRef = useRef<MotionEngineState>(createMotionState());
  const pitchMotionRef = useRef<MotionEngineState>(createMotionState());

  // Track previous demo state to detect transitions
  const prevDemoActiveRef = useRef(demoActive);

  // Reset motion state when transitioning between demo and live modes
  useEffect(() => {
    if (demoActive !== prevDemoActiveRef.current) {
      prevDemoActiveRef.current = demoActive;
      resetMotionState(rollMotionRef.current);
      resetMotionState(pitchMotionRef.current);
    }
  }, [demoActive]);

  // ── Animated values ────────────────────────────────────────
  const rollAnim = useRef(new Animated.Value(0)).current;
  const pitchAnim = useRef(new Animated.Value(0)).current;
  const cgYAnim = useRef(new Animated.Value(0)).current;
  const cgZAnim = useRef(new Animated.Value(0)).current;

  // V11: Safety Emphasis animated values
  // safetyLevelAnim: 0 = normal, 1 = caution, 2 = highRisk
  // Drives horizon color/thickness and numeric emphasis via interpolation.
  // Uses useNativeDriver: false (required for color/dimension animation).
  const safetyLevelAnim = useRef(new Animated.Value(0)).current;
  // borderPulseAnim: 0→1 sine wave, active only in highRisk state.
  // Drives subtle border opacity pulse at 1.75s period.
  const borderPulseAnim = useRef(new Animated.Value(0)).current;
  // Track active border pulse animation for clean stop
  const borderPulseRef = useRef<Animated.CompositeAnimation | null>(null);


  // Ref to track active animations for clean interruption
  const rollAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const pitchAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Roll Animation (V7: Motion Engine) ─────────────────────
  // Processes effectiveRoll through the motion pipeline:
  //   1) Rolling average (4-sample window) smooths micro-jitter
  //   2) Low-pass filter adds additional damping
  //   3) Dead-zone filter (< 0.2°) suppresses micro-movements
  //   4) Dynamic duration scales with delta magnitude (200–350ms)
  //   5) Bezier ease-out curve for controlled, mechanical settling
  useEffect(() => {
    const isDemo = demoActive;
    const clamped = clamp(effectiveRoll, -30, 30);

    // Process through motion engine
    const motion = isDemo
      ? setMotionTarget(rollMotionRef.current, clamped, true)
      : processAngle(rollMotionRef.current, clamped, false);

    // Only animate if the engine says we should (dead-zone passed)
    if (!motion.shouldAnimate) return;

    // Stop any in-flight animation for clean handoff (no overlap)
    if (rollAnimRef.current) {
      rollAnimRef.current.stop();
    }

    const anim = Animated.timing(rollAnim, {
      toValue: motion.smoothedAngle,
      duration: motion.durationMs,
      easing: isDemo
        ? Easing.inOut(Easing.cubic) // Demo: symmetric in/out for scenario transitions
        : instrumentEasing,           // Live: instrument-grade bezier ease-out
      useNativeDriver: true,
    });

    rollAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) rollAnimRef.current = null;
    });
  }, [effectiveRoll, demoActive]);

  // ── Pitch Animation (V7: Motion Engine) ────────────────────
  // Same pipeline as roll, applied to the pitch axis independently.
  useEffect(() => {
    const isDemo = demoActive;
    const clamped = clamp(effectivePitch, -30, 30);

    const motion = isDemo
      ? setMotionTarget(pitchMotionRef.current, clamped, true)
      : processAngle(pitchMotionRef.current, clamped, false);

    if (!motion.shouldAnimate) return;

    if (pitchAnimRef.current) {
      pitchAnimRef.current.stop();
    }

    const anim = Animated.timing(pitchAnim, {
      toValue: motion.smoothedAngle,
      duration: motion.durationMs,
      easing: isDemo
        ? Easing.inOut(Easing.cubic)
        : instrumentEasing,
      useNativeDriver: true,
    });

    pitchAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) pitchAnimRef.current = null;
    });
  }, [effectivePitch, demoActive]);

  // ── CG Marker Animation ────────────────────────────────────
  // Uses instrument easing for consistency with roll/pitch motion.
  useEffect(() => {
    const normalizedY = clamp(stability.cg.yCg / 15, -1, 1);
    const normalizedZ = clamp(
      (stability.cg.zCg - baseline.baseCgHeightIn) / 30,
      -1,
      1,
    );
    Animated.parallel([
      Animated.timing(cgYAnim, {
        toValue: normalizedY,
        duration: 600,
        easing: instrumentEasing,
        useNativeDriver: true,
      }),
      Animated.timing(cgZAnim, {
        toValue: normalizedZ,
        duration: 600,
        easing: instrumentEasing,
        useNativeDriver: true,
      }),
    ]).start();
  }, [stability.cg.yCg, stability.cg.zCg]);

  // ── V11: Safety State Computation ─────────────────────────
  // Determine safety tier from max(abs(roll), abs(pitch)).
  // This is a derived value — not animated directly.
  const safetyState: SafetyState = useMemo(() => {
    const maxAngle = Math.max(Math.abs(effectiveRoll), Math.abs(effectivePitch));
    if (maxAngle > SAFETY_CAUTION_MAX_DEG) return 'highRisk';
    if (maxAngle >= SAFETY_NORMAL_MAX_DEG) return 'caution';
    return 'normal';
  }, [effectiveRoll, effectivePitch]);

  const safetyTarget = safetyState === 'highRisk' ? 2 : safetyState === 'caution' ? 1 : 0;

  // ── V11: Safety Level Transition Animation ────────────────
  // Smooth 200ms fade between safety tiers. No abrupt color snap.
  // Uses instrument easing for consistency with motion engine pipeline.
  useEffect(() => {
    Animated.timing(safetyLevelAnim, {
      toValue: safetyTarget,
      duration: SAFETY_TRANSITION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, // required for color/dimension interpolation
    }).start();
  }, [safetyTarget]);

  // ── V11: High Risk Border Pulse ───────────────────────────
  // Slow sine wave pulse (1.75s period) on border opacity.
  // Only active when safetyState === 'highRisk'.
  // Stops cleanly and fades out when leaving high risk.
  useEffect(() => {
    if (safetyState === 'highRisk') {
      const halfPeriod = SAFETY_PULSE_PERIOD_MS / 2;
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(borderPulseAnim, {
            toValue: 1,
            duration: halfPeriod,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(borderPulseAnim, {
            toValue: 0,
            duration: halfPeriod,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      );
      borderPulseRef.current = pulse;
      pulse.start();
      return () => {
        pulse.stop();
        borderPulseRef.current = null;
      };
    } else {
      // Leaving high risk: fade pulse out smoothly
      if (borderPulseRef.current) {
        borderPulseRef.current.stop();
        borderPulseRef.current = null;
      }
      Animated.timing(borderPulseAnim, {
        toValue: 0,
        duration: SAFETY_TRANSITION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    }
  }, [safetyState]);


  // ── Interpolations ─────────────────────────────────────────
  const rollRotate = rollAnim.interpolate({
    inputRange: [-30, 30],
    outputRange: ['-30deg', '30deg'],
    extrapolate: 'clamp',
  });

  // V9: Counter-rotating horizon reference line.
  // In a real attitude indicator, the horizon tilts opposite to the aircraft's
  // bank angle. When the truck rolls +15° right, the horizon line tilts -15° left.
  // Uses the same rollAnim animated value with inverted output range.
  // Only applies rotation — no translateY (horizon stays vertically fixed for pitch).
  const horizonRollRotate = rollAnim.interpolate({
    inputRange: [-30, 30],
    outputRange: ['30deg', '-30deg'], // Inverted: counter-rotates opposite to truck roll
    extrapolate: 'clamp',
  });


  // V8: Pitch → translateY (replaces perspective-based rotateX)
  // Positive pitch (nose up) → truck shifts UP → negative translateY
  // Negative pitch (nose down) → truck shifts DOWN → positive translateY
  const pitchTranslateY = pitchAnim.interpolate({
    inputRange: [-30, 30],
    outputRange: [MAX_PITCH_TRANSLATE_Y, -MAX_PITCH_TRANSLATE_Y],
    extrapolate: 'clamp',
  });

  // V10: Horizon pitch-shift — subtle opposite translateY.

  // The horizon shifts OPPOSITE to the truck's pitch, at HORIZON_PITCH_SCALE (35%).
  // Truck: pitch=-30 → +90px (down), pitch=+30 → -90px (up)
  // Horizon: pitch=-30 → -31.5px (up), pitch=+30 → +31.5px (down)
  // This inverted, reduced-magnitude shift reinforces the attitude indicator metaphor
  // where the horizon appears to move opposite to the aircraft in both axes.
  // Uses the same pitchAnim animated value processed through the V7 motion engine.
  const horizonPitchTranslateY = pitchAnim.interpolate({
    inputRange: [-30, 30],
    outputRange: [-HORIZON_MAX_PITCH_TRANSLATE_Y, HORIZON_MAX_PITCH_TRANSLATE_Y],
    extrapolate: 'clamp',
  });

  // ── Roll Gauge Indicator Interpolation ─────────────────────
  // Maps rollAnim (-30° to +30°) to horizontal pixel offset for the roll gauge indicator.
  // At -30° roll, indicator is at -ROLL_GAUGE_HALF_W (left edge).
  // At +30° roll, indicator is at +ROLL_GAUGE_HALF_W (right edge).
  const rollIndicatorX = rollAnim.interpolate({
    inputRange: [-30, 30],
    outputRange: [-ROLL_GAUGE_HALF_W, ROLL_GAUGE_HALF_W],
    extrapolate: 'clamp',
  });

  // ── Roll Gauge Tick Marks ──────────────────────────────────
  // Generate ROLL_TICK_COUNT evenly-spaced tick marks across the roll gauge.
  // Center tick (index 3) is taller to mark 0°. Others are shorter reference marks.
  const rollTicks = useMemo(() => {
    const ticks: React.ReactElement[] = [];
    for (let i = 0; i < ROLL_TICK_COUNT; i++) {
      const fraction = i / (ROLL_TICK_COUNT - 1); // 0 to 1
      const isCenter = i === Math.floor(ROLL_TICK_COUNT / 2);
      ticks.push(
        <View
          key={`roll-tick-${i}`}
          style={{
            position: 'absolute',
            left: `${fraction * 100}%`,
            top: isCenter ? -2 : 0,
            width: 1,
            height: isCenter ? 9 : 5,
            backgroundColor: isCenter
              ? 'rgba(255,255,255,0.15)'
              : 'rgba(196, 138, 44, 0.3)',
            marginLeft: -0.5,
          }}
        />,
      );
    }
    return ticks;
  }, []);



  // ── V11: Safety Emphasis Interpolations ───────────────────
  // Derived from safetyLevelAnim (0=normal, 1=caution, 2=highRisk).
  // All transitions are smooth 200ms fades — no abrupt color snaps.

  // Horizon wing line color — subtle brightness increase per tier
  const safetyHorizonColor = safetyLevelAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      SAFETY_HORIZON_COLOR_NORMAL,
      SAFETY_HORIZON_COLOR_CAUTION,
      SAFETY_HORIZON_COLOR_HIGH_RISK,
    ],
  });

  // Horizon center pip border color
  const safetyPipColor = safetyLevelAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      SAFETY_PIP_COLOR_NORMAL,
      SAFETY_PIP_COLOR_CAUTION,
      SAFETY_PIP_COLOR_HIGH_RISK,
    ],
  });

  // Horizon wing line thickness: 1px → 1.5px → 2px
  const safetyHorizonThickness = safetyLevelAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [1, 1.5, 2],
  });

  // Numeric tilt readout font size: 11 → 11.5 → 12.5
  const safetyNumericFontSize = safetyLevelAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [11, 11.5, 12.5],
  });

  // Accent color for header glyph/title — subtle brightness shift
  const safetyAccentColor = safetyLevelAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      SAFETY_ACCENT_NORMAL,
      SAFETY_ACCENT_CAUTION,
      SAFETY_ACCENT_HIGH_RISK,
    ],
  });

  // Border pulse opacity — only meaningful when borderPulseAnim is active (highRisk)
  const safetyBorderPulseOpacity = borderPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.20, 0.50],
  });



  const cgTranslateY = cgYAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-72, 72],
  });
  const cgTranslateZ = cgZAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [56, -56],
  });


  const demoProgressWidth = demoProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ── Derived values ─────────────────────────────────────────
  const rollColor = alertPrefs.useCustomThresholds
    ? getAngleColor(
        effectiveRoll,
        activeThresholds.rollWarningDeg,
        activeThresholds.rollWarningDeg + (activeThresholds.rollCriticalDeg - activeThresholds.rollWarningDeg) * 0.5,
        activeThresholds.rollCriticalDeg,
      )
    : getAngleColor(
        effectiveRoll,
        stability.rollWarningDeg,
        stability.rollHighRiskDeg,
        stability.criticalRollAngleDeg,
      );
  const pitchColor = alertPrefs.useCustomThresholds
    ? getAngleColor(
        effectivePitch,
        activeThresholds.pitchWarningDeg,
        activeThresholds.pitchWarningDeg + (activeThresholds.pitchCriticalDeg - activeThresholds.pitchWarningDeg) * 0.5,
        activeThresholds.pitchCriticalDeg,
      )
    : getAngleColor(
        effectivePitch,
        stability.pitchWarningDeg,
        stability.pitchHighRiskDeg,
        stability.criticalPitchAngleDeg,
      );

  const rollNorm =
    activeThresholds.rollCriticalDeg > 0
      ? clamp(effectiveRoll / activeThresholds.rollCriticalDeg, -1, 1)
      : 0;
  const pitchNorm =
    activeThresholds.pitchCriticalDeg > 0
      ? clamp(effectivePitch / activeThresholds.pitchCriticalDeg, -1, 1)
      : 0;

  const effectiveSensorStatus = demoActive ? 'DEMO' : sensorStatus;
  const sensorColor = demoActive ? '#5B8DEF' : getSensorStatusColor(sensorStatus);
  const sensorIsLive =
    sensorStatus === 'LIVE' || sensorStatus === 'CALIBRATED';

  const containerBorderColor = alertCheckResult.anyCritical
    ? 'rgba(192, 57, 43, 0.55)'
    : alertCheckResult.anyAlert
    ? 'rgba(230, 126, 34, 0.45)'
    : demoActive
    ? 'rgba(91, 141, 239, 0.40)'
    : sensorIsLive
    ? 'rgba(196, 138, 44, 0.40)'
    : 'rgba(62, 79, 60, 0.35)';

  const vehicleOpacity = demoActive ? 1.0 : sensorIsLive ? 1.0 : 0.85;

  // Flash overlay color
  const flashBgColor = flashColorRef.current === 'critical'
    ? 'rgba(192, 57, 43, 0.35)'
    : 'rgba(230, 126, 34, 0.25)';

  // Alert count for badge
  const alertCount = alertHistory.length;

  return (
    <View style={[styles.container, { borderColor: containerBorderColor }]}>
      {/* ── V11: Safety Emphasis Border Pulse Overlay ─────────── */}
      {/* Absolutely positioned border overlay that subtly pulses in highRisk state.
          Uses borderPulseAnim sine wave (1.75s period) for slow opacity modulation.
          Invisible in normal/caution states (borderPulseAnim stays at 0). */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.safetyBorderPulse,
          { opacity: safetyBorderPulseOpacity },
        ]}
      />

      {/* ── Flash Overlay ─────────────────────────────────────── */}
      {alertPrefs.flashAlertsEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flashOverlay,
            {
              opacity: flashAnim,
              backgroundColor: flashBgColor,
            },
          ]}
        />
      )}


      {/* ── Header ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* V11: Header glyph and title use animated accent color */}
          <View style={styles.glyphWrap}>
            <View style={styles.glyphCross}>
              <Animated.View style={[styles.glyphH, { backgroundColor: safetyAccentColor }]} />
              <Animated.View style={[styles.glyphV, { backgroundColor: safetyAccentColor }]} />
            </View>
            <Animated.View style={[styles.glyphCenter, { backgroundColor: safetyAccentColor }]} />
          </View>
          <Animated.Text style={[styles.headerTitle, { color: safetyAccentColor }]}>ATTITUDE MONITOR</Animated.Text>

        </View>
        <View style={styles.headerRight}>
          {/* Alert active indicator */}
          {alertCheckResult.anyAlert && (
            <Animated.View style={[styles.alertActiveBadge, alertCheckResult.anyCritical && styles.alertActiveBadgeCrit]}>
              <View style={[styles.alertActiveDot, alertCheckResult.anyCritical && styles.alertActiveDotCrit]} />
              <Text style={[styles.alertActiveText, alertCheckResult.anyCritical && styles.alertActiveTextCrit]}>
                {alertCheckResult.anyCritical ? 'CRIT' : 'WARN'}
              </Text>
            </Animated.View>
          )}
          {/* Pulsing DEMO badge */}
          {demoActive && (
            <Animated.View
              style={[styles.demoBadge, { opacity: demoPulseAnim }]}>
              <View style={styles.demoBadgeDot} />
              <Text style={styles.demoBadgeText}>DEMO</Text>
            </Animated.View>
          )}
          <View style={styles.sensorBadge}>
            <View
              style={[styles.sensorDot, { backgroundColor: sensorColor }]}
            />
            <Text style={[styles.sensorLabel, { color: sensorColor }]}>
              {effectiveSensorStatus}
            </Text>
          </View>
          <View
            style={[
              styles.modeBadge,
              advancedEnabled && styles.modeBadgeAdvanced,
            ]}>
            <Text
              style={[
                styles.modeBadgeText,
                advancedEnabled && styles.modeBadgeTextAdvanced,
              ]}>
              {advancedEnabled ? 'ADV' : 'STD'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Alert Toolbar ───────────────────────────────────── */}
      <View style={styles.alertToolbar}>
        {/* Custom thresholds indicator */}
        {alertPrefs.useCustomThresholds && (
          <View style={styles.customBadge}>
            <View style={styles.customBadgeDot} />
            <Text style={styles.customBadgeText}>CUSTOM LIMITS</Text>
          </View>
        )}

        {/* Audio indicator with selected tone names */}
        {alertPrefs.audioAlertsEnabled && (
          <View style={styles.audioBadge}>
            <View style={styles.audioIcon}>
              <View style={styles.audioBar1} />
              <View style={styles.audioBar2} />
              <View style={styles.audioBar3} />
            </View>
            <Text style={styles.audioBadgeText}>
              {getSoundDef(alertPrefs.warningSoundId).shortName}/{getSoundDef(alertPrefs.criticalSoundId).shortName}
            </Text>
          </View>
        )}


        <View style={{ flex: 1 }} />

        {/* Settings button */}
        <TouchableOpacity
          style={[styles.toolbarBtn, showSettings && styles.toolbarBtnActive]}
          onPress={() => {
            hapticCommand();
            setShowSettings((p) => !p);
            if (!showSettings) setShowHistory(false);
          }}
          activeOpacity={0.7}>
          <View style={styles.gearIcon}>
            <View style={styles.gearOuter}>
              <View style={styles.gearInner} />
            </View>
          </View>
          <Text style={[styles.toolbarBtnText, showSettings && styles.toolbarBtnTextActive]}>
            ALERTS
          </Text>
        </TouchableOpacity>

        {/* History button */}
        <TouchableOpacity
          style={[styles.toolbarBtn, showHistory && styles.toolbarBtnActiveHistory]}
          onPress={() => {
            hapticCommand();
            setShowHistory((p) => !p);
            if (!showHistory) setShowSettings(false);
          }}
          activeOpacity={0.7}>
          <View style={styles.historyIcon}>
            <View style={styles.historyLine1} />
            <View style={styles.historyLine2} />
            <View style={styles.historyLine3} />
          </View>
          <Text style={[styles.toolbarBtnText, showHistory && styles.toolbarBtnTextActiveHistory]}>
            LOG
          </Text>
          {alertCount > 0 && (
            <View style={styles.historyCountBadge}>
              <Text style={styles.historyCountText}>
                {alertCount > 99 ? '99+' : alertCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Settings Panel (expandable) ─────────────────────── */}
      {showSettings && (
        <TiltAlertSettingsPanel
          preferences={alertPrefs}
          onUpdate={handleUpdatePrefs}
          onClose={() => setShowSettings(false)}
          computedRollWarning={stability.rollWarningDeg}
          computedRollCritical={stability.criticalRollAngleDeg}
          computedPitchWarning={stability.pitchWarningDeg}
          computedPitchCritical={stability.criticalPitchAngleDeg}
        />
      )}

      {/* ── Alert History Log (expandable) ──────────────────── */}
      {showHistory && (
        <AlertHistoryLog
          history={alertHistory}
          onClear={handleClearHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* ── Demo Scenario Bar ───────────────────────────────── */}
      {demoActive && (
        <View style={styles.demoBar}>
          <View style={styles.demoBarTop}>
            <View style={styles.demoScenarioInfo}>
              <Text style={styles.demoScenarioName}>
                {currentScenario.name}
              </Text>
              <Text style={styles.demoScenarioDesc}>
                {currentScenario.description}
              </Text>
            </View>
            <View style={styles.demoAngles}>
              <Text style={styles.demoAngleLabel}>
                R{' '}
                <Text style={[styles.demoAngleValue, { color: rollColor }]}>
                  {effectiveRoll >= 0 ? '+' : ''}
                  {effectiveRoll}°
                </Text>
              </Text>
              <Text style={styles.demoAngleLabel}>
                P{' '}
                <Text style={[styles.demoAngleValue, { color: pitchColor }]}>
                  {effectivePitch >= 0 ? '+' : ''}
                  {effectivePitch}°
                </Text>
              </Text>
            </View>
          </View>

          <View style={styles.demoProgressTrack}>
            <Animated.View
              style={[styles.demoProgressFill, { width: demoProgressWidth }]}
            />
          </View>

          <View style={styles.demoDotsRow}>
            {DEMO_SCENARIOS.map((s, i) => (
              <TouchableOpacity
                key={s.shortName}
                onPress={() => handleSelectScenario(i)}
                activeOpacity={0.7}
                style={[
                  styles.demoDot,
                  i === demoScenarioIdx && styles.demoDotActive,
                ]}>
                <Text
                  style={[
                    styles.demoDotText,
                    i === demoScenarioIdx && styles.demoDotTextActive,
                  ]}
                  numberOfLines={1}>
                  {s.shortName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Main Display Area ───────────────────────────────── */}
      <View style={styles.displayArea}>
        {/* Pitch Gauge (vertical, left side) */}
        <View style={styles.pitchGaugeWrap}>
          <View style={styles.pitchGaugeTrack}>
            <View style={styles.pitchGaugeCenter} />
            <View
              style={[
                styles.pitchGaugeIndicator,
                {
                  backgroundColor: pitchColor,
                  bottom: `${50 + pitchNorm * 40}%`,
                },
              ]}
            />
            <View style={[styles.pitchMark, { bottom: '85%' }]} />
            <View style={[styles.pitchMark, { bottom: '15%' }]} />
          </View>
          <Text style={styles.gaugeLabel}>P</Text>
        </View>

        {/* ── Vehicle Image Area (V13: responsive scaling + onLayout) ── */}
        <View style={styles.vehicleArea} onLayout={handleStageLayout}>
          {/* V9+V10: Dual-axis horizon reference line. */}
          <Animated.View
            style={[
              styles.horizonRefLine,
              {
                transform: [
                  { translateY: horizonPitchTranslateY },
                  { rotate: horizonRollRotate },
                ],
              },
            ]}>
            <Animated.View style={[styles.horizonRefLeft, { backgroundColor: safetyHorizonColor, height: safetyHorizonThickness }]} />
            <Animated.View style={[styles.horizonRefCenter, { borderColor: safetyPipColor }]} />
            <Animated.View style={[styles.horizonRefRight, { backgroundColor: safetyHorizonColor, height: safetyHorizonThickness }]} />
          </Animated.View>

          {/* V13: Layout sizing wrapper — provides correct layout space for the
              scaled vehicle. The inner vehicleTransformWrap renders at original
              IMAGE dimensions, then a scale transform visually shrinks it.
              This wrapper ensures surrounding elements (ground line, footprint
              markers, roll gauge) don't overlap the vehicle image. */}
          {stageReady && (
            <View style={{
              width: scaledW,
              height: scaledH,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
            }}>
              {/* V8+V13: Animated truck — rolls via rotate, pitches via translateY,
                  scaled to fit container via scale transform.
                  Scale is applied LAST (first in array = last visually applied in RN),
                  so all translations/rotations happen in original coordinate space
                  and are then uniformly scaled to fit the display. */}
              <Animated.View
                style={[
                  styles.vehicleTransformWrap,
                  {
                    opacity: vehicleOpacity,
                    transform: [
                      { scale: truckScale },
                      { translateY: AXLE_OFFSET },
                      { rotate: rollRotate },
                      { translateY: -AXLE_OFFSET },
                      { translateY: pitchTranslateY },
                    ],
                  }]}>

                {/* V16: Local bundled vehicle silhouette — loads instantly from app bundle.
                    No network dependency, no prefetch, no retry, no fallback needed.
                    If asset is missing from bundle, renders a tinted View placeholder. */}
                {TRUCK_IMAGE_SOURCE ? (
                  <Image
                    source={TRUCK_IMAGE_SOURCE}
                    style={styles.truckImage}
                    resizeMode="contain"
                    pointerEvents="none"
                  />
                ) : (
                  <View
                    style={[styles.truckImage, {
                      backgroundColor: 'rgba(181, 139, 58, 0.08)',
                      borderWidth: 1,
                      borderColor: 'rgba(181, 139, 58, 0.15)',
                      borderRadius: 8,
                    }]}
                    pointerEvents="none"
                  />
                )}





                {advancedEnabled && (
                  <Animated.View
                    style={[
                      styles.cgMarker,
                      {
                        transform: [
                          { translateX: cgTranslateY },
                          { translateY: cgTranslateZ },
                        ],
                      },
                    ]}>
                    <View style={styles.cgDot} />
                    <View style={styles.cgRingOuter} />
                  </Animated.View>
                )}

                {advancedEnabled && (
                  <View style={styles.gravityVector}>
                    <View style={styles.gravityLine} />
                    <View style={styles.gravityArrow} />
                  </View>
                )}
              </Animated.View>
            </View>
          )}

          {/* Fixed ground reference — outside animated wrapper */}
          <View style={styles.groundLine} />

          <View style={styles.footprintMarkers}>
            <View
              style={[styles.footprintMark, { borderColor: rollColor }]}
            />
            <View
              style={[styles.footprintMark, { borderColor: rollColor }]}
            />
          </View>
        </View>



        {/* Pitch angle readout (right side) */}
        <View style={styles.pitchReadout}>
          {/* V11: Pitch numeric readout — animated font size for safety emphasis */}
          <Animated.Text style={[styles.pitchAngleText, { color: pitchColor, fontSize: safetyNumericFontSize }]}>
            {effectivePitch >= 0 ? '+' : ''}
            {effectivePitch.toFixed(1)}°
          </Animated.Text>
        </View>

        {/* ── Roll Gauge (horizontal) ─────────────────────────── */}
        <View style={styles.rollGaugeRow}>
          <View style={styles.rollGauge}>
            {rollTicks}
            <Animated.View
              style={[
                styles.rollIndicator,
                { transform: [{ translateX: rollIndicatorX }] },
              ]}
            />
          </View>
          <Text style={styles.rollLabelText}>L</Text>
          <Text style={styles.gaugeLabel}>ROLL</Text>
          {/* V11: Roll numeric readout — animated font size for safety emphasis */}
          <Animated.Text style={[styles.rollAngleText, { color: rollColor, fontSize: safetyNumericFontSize }]}>
            {effectiveRoll >= 0 ? '+' : ''}
            {effectiveRoll.toFixed(1)}°
          </Animated.Text>

          <Text style={styles.rollLabelText}>R</Text>
        </View>
      </View>

      {/* ── Threshold Indicator Row ─────────────────────────── */}
      {alertPrefs.useCustomThresholds && (
        <View style={styles.thresholdRow}>
          <View style={styles.thresholdItem}>
            <Text style={styles.thresholdLabel}>R WARN</Text>
            <Text style={[styles.thresholdValue, { color: '#E67E22' }]}>
              {activeThresholds.rollWarningDeg.toFixed(0)}°
            </Text>
          </View>
          <View style={styles.thresholdDivider} />
          <View style={styles.thresholdItem}>
            <Text style={styles.thresholdLabel}>R CRIT</Text>
            <Text style={[styles.thresholdValue, { color: '#C0392B' }]}>
              {activeThresholds.rollCriticalDeg.toFixed(0)}°
            </Text>
          </View>
          <View style={styles.thresholdDivider} />
          <View style={styles.thresholdItem}>
            <Text style={styles.thresholdLabel}>P WARN</Text>
            <Text style={[styles.thresholdValue, { color: '#E67E22' }]}>
              {activeThresholds.pitchWarningDeg.toFixed(0)}°
            </Text>
          </View>
          <View style={styles.thresholdDivider} />
          <View style={styles.thresholdItem}>
            <Text style={styles.thresholdLabel}>P CRIT</Text>
            <Text style={[styles.thresholdValue, { color: '#C0392B' }]}>
              {activeThresholds.pitchCriticalDeg.toFixed(0)}°
            </Text>
          </View>
        </View>
      )}

      {/* ── Metrics Row ─────────────────────────────────────── */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>STABILITY</Text>
          <Text
            style={[
              styles.metricValue,
              { color: stability.stabilityColor },
            ]}>
            {stability.stabilityIndex.toFixed(0)}%
          </Text>
          {stability.rollLimitExceeded && (
            <Text style={styles.rollExceeded}>LIMIT</Text>
          )}
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>CRIT ROLL</Text>
          <Text style={styles.metricValueSmall}>
            {stability.criticalRollAngleDeg.toFixed(1)}°
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>CG HT</Text>
          <Text style={styles.metricValueSmall}>
            {stability.cg.zCg.toFixed(1)}"
          </Text>
        </View>
      </View>

      {/* ── Phase 5C: Weight Intelligence Signals ───────────── */}
      {/* Subtle amber/red indicators for roof load %, rear bias %, GVWR %.
          Only rendered when weightSignals prop is provided with data.
          No animations — static conditional styling based on severity flags. */}
      {weightSignals && weightSignals.hasData && (
        <View style={styles.weightSignalsRow}>
          {/* ROOF LOAD chip */}
          <View style={[
            styles.weightSignalChip,
            weightSignals.roofLoadSeverity && {
              backgroundColor: weightSignals.roofLoadSeverity === 'red'
                ? 'rgba(192, 57, 43, 0.10)'
                : 'rgba(230, 126, 34, 0.08)',
              borderColor: weightSignals.roofLoadSeverity === 'red'
                ? 'rgba(192, 57, 43, 0.25)'
                : 'rgba(230, 126, 34, 0.20)',
            },
          ]}>
            {weightSignals.roofLoadSeverity && (
              <View style={[
                styles.weightSignalDot,
                { backgroundColor: getAttitudeAlertColor(weightSignals.roofLoadSeverity) },
              ]} />
            )}
            <Text style={styles.weightSignalLabel}>ROOF</Text>
            <Text style={[
              styles.weightSignalValue,
              weightSignals.roofLoadSeverity && {
                color: getAttitudeAlertColor(weightSignals.roofLoadSeverity),
              },
            ]}>
              {weightSignals.roofLoadPercent.toFixed(0)}%
            </Text>
          </View>

          <View style={styles.weightSignalDivider} />

          {/* REAR BIAS chip */}
          <View style={[
            styles.weightSignalChip,
            weightSignals.rearBiasSeverity && {
              backgroundColor: weightSignals.rearBiasSeverity === 'red'
                ? 'rgba(192, 57, 43, 0.10)'
                : 'rgba(230, 126, 34, 0.08)',
              borderColor: weightSignals.rearBiasSeverity === 'red'
                ? 'rgba(192, 57, 43, 0.25)'
                : 'rgba(230, 126, 34, 0.20)',
            },
          ]}>
            {weightSignals.rearBiasSeverity && (
              <View style={[
                styles.weightSignalDot,
                { backgroundColor: getAttitudeAlertColor(weightSignals.rearBiasSeverity) },
              ]} />
            )}
            <Text style={styles.weightSignalLabel}>REAR</Text>
            <Text style={[
              styles.weightSignalValue,
              weightSignals.rearBiasSeverity && {
                color: getAttitudeAlertColor(weightSignals.rearBiasSeverity),
              },
            ]}>
              {weightSignals.rearBiasPercent.toFixed(0)}%
            </Text>
          </View>

          <View style={styles.weightSignalDivider} />

          {/* GVWR chip */}
          <View style={[
            styles.weightSignalChip,
            weightSignals.gvwrSeverity && {
              backgroundColor: weightSignals.gvwrSeverity === 'red'
                ? 'rgba(192, 57, 43, 0.10)'
                : 'rgba(230, 126, 34, 0.08)',
              borderColor: weightSignals.gvwrSeverity === 'red'
                ? 'rgba(192, 57, 43, 0.25)'
                : 'rgba(230, 126, 34, 0.20)',
            },
          ]}>
            {weightSignals.gvwrSeverity && (
              <View style={[
                styles.weightSignalDot,
                { backgroundColor: getAttitudeAlertColor(weightSignals.gvwrSeverity) },
              ]} />
            )}
            <Text style={styles.weightSignalLabel}>GVWR</Text>
            <Text style={[
              styles.weightSignalValue,
              weightSignals.gvwrSeverity && {
                color: getAttitudeAlertColor(weightSignals.gvwrSeverity),
              },
            ]}>
              {weightSignals.gvwrPercent.toFixed(0)}%
            </Text>
            {weightSignals.flags.gvwrExceeded && (
              <Text style={styles.weightSignalExceeded}>OVER</Text>
            )}
          </View>
        </View>
      )}

      {/* ── Vertical mount label ────────────────────────────── */}
      <View style={styles.mountLabelRow}>
        <View style={styles.mountDot} />
        <Text style={styles.mountLabelText}>
          Calibrated for vertical mount
        </Text>
      </View>

      {/* ── Demo Mode Toggle ────────────────────────────────── */}
      <View style={styles.demoToggleRow}>
        <TouchableOpacity
          style={[
            styles.demoToggleBtn,
            demoActive && styles.demoToggleBtnActive,
          ]}
          onPress={handleToggleDemo}
          activeOpacity={0.7}>
          <View style={styles.demoGlyphWrap}>
            {demoActive ? (
              <View style={styles.demoStopGlyph}>
                <View
                  style={[
                    styles.demoStopBar,
                    demoActive && styles.demoStopBarActive,
                  ]}
                />
                <View
                  style={[
                    styles.demoStopBar,
                    demoActive && styles.demoStopBarActive,
                  ]}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.demoPlayGlyph,
                  demoActive && styles.demoPlayGlyphActive,
                ]}
              />
            )}
          </View>
          <Text
            style={[
              styles.demoToggleText,
              demoActive && styles.demoToggleTextActive,
            ]}>
            {demoActive ? 'STOP DEMO' : 'DEMO MODE'}
          </Text>
        </TouchableOpacity>

        {!demoActive && (
          <Text style={styles.demoHintText}>
            Simulate tilt scenarios
          </Text>
        )}

        {demoActive && (
          <View style={styles.demoCounterBadge}>
            <Text style={styles.demoCounterText}>
              {demoScenarioIdx + 1}/{DEMO_SCENARIOS.length}
            </Text>
          </View>
        )}
      </View>

      {/* ── Calibration Row ─────────────────────────────────── */}
      {!demoActive && (sensorIsLive || sensorStatus === 'OFFLINE') && (
        <View style={styles.calibrationRow}>
          <TouchableOpacity
            style={[
              styles.calibrateBtn,
              isCalibrated && styles.calibrateBtnActive,
            ]}
            onPress={handleCalibrate}
            activeOpacity={0.7}
            disabled={!sensorIsLive}>
            <View style={styles.calGlyph}>
              <View style={styles.calGlyphH} />
              <View style={styles.calGlyphV} />
              <View style={styles.calGlyphDot} />
            </View>
            <Text
              style={[
                styles.calibrateBtnText,
                isCalibrated && styles.calibrateBtnTextActive,
                !sensorIsLive && styles.calibrateBtnTextDisabled,
              ]}>
              {isCalibrated ? 'RECAL' : 'CALIBRATE'}
            </Text>
          </TouchableOpacity>

          {isCalibrated && (
            <TouchableOpacity
              style={styles.resetCalBtn}
              onPress={onResetCalibration}
              activeOpacity={0.7}>
              <View style={styles.resetGlyph}>
                <View style={styles.resetArrowL} />
                <View style={styles.resetBar} />
                <View style={styles.resetArrowR} />
              </View>
              <Text style={styles.resetCalBtnText}>RESET</Text>
            </TouchableOpacity>
          )}

          {isCalibrated && (
            <View style={styles.calConfirm}>
              <View style={styles.checkGlyph}>
                <View style={styles.checkShort} />
                <View style={styles.checkLong} />
              </View>
              <Text style={styles.calConfirmText}>ZEROED</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Sensor unavailable ──────────────────────────────── */}
      {sensorStatus === 'UNAVAILABLE' && !demoActive && (
        <View style={styles.sensorUnavailableRow}>
          <View style={styles.sensorUnavailableIcon}>
            <View style={styles.suBarH} />
            <View style={styles.suBarV} />
          </View>
          <Text style={styles.sensorUnavailableText}>
            Accelerometer unavailable — try Demo Mode
          </Text>
        </View>
      )}

      {/* ── Advanced data row ───────────────────────────────── */}
      {advancedEnabled && (
        <View style={styles.advancedRow}>
          <View style={styles.advancedItem}>
            <Text style={styles.advancedLabel}>MASS</Text>
            <Text style={styles.advancedValue}>
              {stability.cg.totalMass.toFixed(0)}
            </Text>
          </View>
          <View style={styles.advancedDivider} />
          <View style={styles.advancedItem}>
            <Text style={styles.advancedLabel}>CG LAT</Text>
            <Text style={styles.advancedValue}>
              {stability.cg.yCg >= 0 ? '+' : ''}
              {stability.cg.yCg.toFixed(1)}"
            </Text>
          </View>
          <View style={styles.advancedDivider} />
          <View style={styles.advancedItem}>
            <Text style={styles.advancedLabel}>CG LNG</Text>
            <Text style={styles.advancedValue}>
              {stability.cg.xCg >= 0 ? '+' : ''}
              {stability.cg.xCg.toFixed(1)}"
            </Text>
          </View>
          <View style={styles.advancedDivider} />
          <View style={styles.advancedItem}>
            <Text style={styles.advancedLabel}>MOD</Text>
            <Text style={styles.advancedValue}>
              {stability.cg.moduleCount}
            </Text>
          </View>
        </View>
      )}

      {/* ── Insufficient data fallback ──────────────────────── */}
      {advancedEnabled && !stability.cg.hasSufficientData && (
        <View style={styles.fallbackRow}>
          <View style={styles.fallbackIcon}>
            <View style={styles.fallbackBar} />
            <View style={styles.fallbackDotSmall} />
          </View>
          <Text style={styles.fallbackText}>
            Insufficient Load Data — Default Model
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const DEMO_BLUE = '#5B8DEF';
const DEMO_BLUE_DIM = 'rgba(91, 141, 239, 0.12)';
const DEMO_BLUE_BORDER = 'rgba(91, 141, 239, 0.30)';
const WARN_COLOR = '#E67E22';
const CRIT_COLOR = '#C0392B';

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    padding: 10,
    paddingBottom: 8,
    marginBottom: 14,
    overflow: 'hidden',
  },

  // ── Flash Overlay ────────────────────────────────────────
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    borderRadius: 14,
  },


  // ── Header ───────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  glyphWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphCross: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphH: {
    position: 'absolute',
    width: 12,
    height: 1.5,
    backgroundColor: TACTICAL.amber,
  },
  glyphV: {
    position: 'absolute',
    width: 1.5,
    height: 12,
    backgroundColor: TACTICAL.amber,
  },
  glyphCenter: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TACTICAL.amber,
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.2,
  },

  // ── Alert Active Badge ───────────────────────────────────
  alertActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(230, 126, 34, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(230, 126, 34, 0.30)',
  },
  alertActiveBadgeCrit: {
    backgroundColor: 'rgba(192, 57, 43, 0.15)',
    borderColor: 'rgba(192, 57, 43, 0.35)',
  },
  alertActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: WARN_COLOR,
  },
  alertActiveDotCrit: {
    backgroundColor: CRIT_COLOR,
  },
  alertActiveText: {
    fontSize: 7,
    fontWeight: '900',
    color: WARN_COLOR,
    letterSpacing: 1,
  },
  alertActiveTextCrit: {
    color: CRIT_COLOR,
  },

  // ── DEMO Badge (pulsing) ─────────────────────────────────
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: DEMO_BLUE_DIM,
    borderWidth: 1,
    borderColor: DEMO_BLUE_BORDER,
  },
  demoBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: DEMO_BLUE,
  },
  demoBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: DEMO_BLUE,
    letterSpacing: 1.5,
  },

  // ── Sensor badge ─────────────────────────────────────────
  sensorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sensorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  sensorLabel: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  modeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modeBadgeAdvanced: {
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderColor: 'rgba(196, 138, 44, 0.3)',
  },
  modeBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  modeBadgeTextAdvanced: {
    color: TACTICAL.amber,
  },

  // ── Alert Toolbar ────────────────────────────────────────
  alertToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
    marginBottom: 4,
  },
  customBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(91, 141, 239, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.18)',
  },
  customBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: DEMO_BLUE,
  },
  customBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: DEMO_BLUE,
    letterSpacing: 0.8,
  },
  audioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.18)',
  },
  audioIcon: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    height: 8,
  },
  audioBar1: {
    width: 2,
    height: 3,
    backgroundColor: '#4CAF50',
    borderRadius: 0.5,
  },
  audioBar2: {
    width: 2,
    height: 5,
    backgroundColor: '#4CAF50',
    borderRadius: 0.5,
  },
  audioBar3: {
    width: 2,
    height: 7,
    backgroundColor: '#4CAF50',
    borderRadius: 0.5,
  },
  audioBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 0.8,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toolbarBtnActive: {
    backgroundColor: 'rgba(91, 141, 239, 0.10)',
    borderColor: 'rgba(91, 141, 239, 0.25)',
  },
  toolbarBtnActiveHistory: {
    backgroundColor: 'rgba(230, 126, 34, 0.10)',
    borderColor: 'rgba(230, 126, 34, 0.25)',
  },
  toolbarBtnText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  toolbarBtnTextActive: {
    color: DEMO_BLUE,
  },
  toolbarBtnTextActiveHistory: {
    color: WARN_COLOR,
  },
  gearIcon: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearOuter: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: TACTICAL.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearInner: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TACTICAL.textMuted,
  },
  historyIcon: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    gap: 1.5,
  },
  historyLine1: {
    width: 8,
    height: 1,
    backgroundColor: TACTICAL.textMuted,
    borderRadius: 0.5,
  },
  historyLine2: {
    width: 6,
    height: 1,
    backgroundColor: TACTICAL.textMuted,
    borderRadius: 0.5,
    opacity: 0.7,
  },
  historyLine3: {
    width: 4,
    height: 1,
    backgroundColor: TACTICAL.textMuted,
    borderRadius: 0.5,
    opacity: 0.4,
  },
  historyCountBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(230, 126, 34, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(230, 126, 34, 0.30)',
    marginLeft: -1,
  },
  historyCountText: {
    fontSize: 6,
    fontWeight: '900',
    color: WARN_COLOR,
    fontFamily: 'Courier',
  },

  // ── Demo Scenario Bar ────────────────────────────────────
  demoBar: {
    backgroundColor: 'rgba(91, 141, 239, 0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.15)',
    padding: 8,
    marginBottom: 6,
  },
  demoBarTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  demoScenarioInfo: {
    flex: 1,
    marginRight: 8,
  },
  demoScenarioName: {
    fontSize: 11,
    fontWeight: '900',
    color: DEMO_BLUE,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  demoScenarioDesc: {
    fontSize: 8,
    fontWeight: '500',
    color: 'rgba(91, 141, 239, 0.65)',
    letterSpacing: 0.3,
    lineHeight: 11,
  },
  demoAngles: {
    alignItems: 'flex-end',
    gap: 1,
  },
  demoAngleLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },
  demoAngleValue: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // ── Demo Progress Bar ────────────────────────────────────
  demoProgressTrack: {
    height: 2,
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
    borderRadius: 1,
    marginBottom: 6,
    overflow: 'hidden',
  },
  demoProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(91, 141, 239, 0.50)',
    borderRadius: 1,
  },

  // ── Demo Scenario Dots ───────────────────────────────────
  demoDotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  demoDot: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  demoDotActive: {
    backgroundColor: DEMO_BLUE_DIM,
    borderColor: DEMO_BLUE_BORDER,
  },
  demoDotText: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  demoDotTextActive: {
    color: DEMO_BLUE,
  },

  // ── Display Area (V13: responsive height) ─────────────────
  // V13: Changed from fixed 1300px (raw image height) to 300px.
  // The vehicle image now scales responsively via truckScale computed
  // from onLayout measurements, so the display area no longer needs
  // to match the raw image pixel dimensions.
  displayArea: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 300,
    marginBottom: 4,
  },




  // ── Pitch Gauge (vertical, left) ─────────────────────────
  pitchGaugeWrap: {
    width: 20,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    gap: 2,
  },
  pitchGaugeTrack: {
    width: 3,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 1.5,
    position: 'relative',
    overflow: 'visible',
  },
  pitchGaugeCenter: {
    position: 'absolute',
    top: '50%',
    left: -2,
    width: 7,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginTop: -0.75,
  },
  pitchGaugeIndicator: {
    position: 'absolute',
    left: -3,
    width: 9,
    height: 3,
    borderRadius: 1.5,
  },
  pitchMark: {
    position: 'absolute',
    left: -1.5,
    width: 6,
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.3)',
  },
  gaugeLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Vehicle Area (V8: clipped container for translateY pitch) ──
  vehicleArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    overflow: 'hidden', // V8: clips truck image during translateY pitch shift
  },

  // ── V8: Fixed Horizon Reference Line ─────────────────────
  // Stays stationary at vertical center while truck shifts for pitch.
  // Three-segment design: left wing — center pip — right wing.
  horizonRefLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 0,
    zIndex: 10,
    gap: 4,
  },
  horizonRefLeft: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.18)',
    marginLeft: 8,
  },
  horizonRefCenter: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.30)',
    backgroundColor: 'transparent',
  },
  horizonRefRight: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.18)',
    marginRight: 8,
  },

  vehicleTransformWrap: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckImage: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },







  // ── CG Marker ────────────────────────────────────────────
  cgMarker: {
    position: 'absolute',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    top: IMAGE_HEIGHT * 0.45 - 10,
    left: IMAGE_WIDTH / 2 - 10,
  },
  cgDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TACTICAL.amber,
    zIndex: 2,
  },
  cgRingOuter: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(196, 138, 44, 0.5)',
  },

  // ── Gravity Vector ───────────────────────────────────────
  gravityVector: {
    position: 'absolute',
    bottom: IMAGE_HEIGHT * 0.22,
    alignItems: 'center',
    left: IMAGE_WIDTH / 2 - 2,
  },
  gravityLine: {
    width: 2,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gravityArrow: {

    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.25)',
  },

  // ── Ground & Footprint ───────────────────────────────────
  groundLine: {
    width: '75%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 3,
  },
  // V13: Changed from fixed IMAGE_WIDTH * 0.85 (870px) to percentage-based
  // width so footprint markers scale with the responsive vehicle display.
  footprintMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '70%',
    marginTop: 1,
  },

  footprintMark: {
    width: 16,
    height: 4,
    borderTopWidth: 2,
    borderColor: '#4CAF50',
  },

  // ── Pitch readout (right) ────────────────────────────────
  pitchReadout: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pitchAngleText: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // ── Roll Gauge (horizontal) ──────────────────────────────
  rollGaugeWrap: {
    marginBottom: 6,
  },
  rollGaugeTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2.5,
    position: 'relative',
    overflow: 'visible',
    marginVertical: 3,
  },
  rollGaugeCenter: {
    position: 'absolute',
    left: '50%',
    top: -2,
    width: 1.5,
    height: 9,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginLeft: -0.75,
  },
  rollGaugeIndicator: {
    position: 'absolute',
    top: -2.5,
    width: 5,
    height: 10,
    borderRadius: 2.5,
    marginLeft: -2.5,
  },
  rollMark: {
    position: 'absolute',
    top: -1.5,
    width: 1,
    height: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.3)',
  },
  rollLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rollLabelText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  rollAngleText: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // ── Threshold Indicator Row ──────────────────────────────
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 4,
    marginBottom: 2,
    backgroundColor: 'rgba(91, 141, 239, 0.04)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.10)',
  },
  thresholdItem: {
    alignItems: 'center',
    flex: 1,
  },
  thresholdLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  thresholdValue: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  thresholdDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
  },

  // ── Metrics Row ──────────────────────────────────────────
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.2)',
  },
  metricBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
  },
  metricLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 1,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  metricValueSmall: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  rollExceeded: {
    fontSize: 6,
    fontWeight: '900',
    color: '#C0392B',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // ── Mount label ──────────────────────────────────────────
  mountLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 3,
  },
  mountDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(196, 138, 44, 0.35)',
  },
  mountLabelText: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    opacity: 0.6,
  },

  // ── Demo Mode Toggle ─────────────────────────────────────
  demoToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 5,
    paddingBottom: 3,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  demoToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  demoToggleBtnActive: {
    backgroundColor: DEMO_BLUE_DIM,
    borderColor: DEMO_BLUE_BORDER,
  },
  demoGlyphWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPlayGlyph: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: TACTICAL.textMuted,
    marginLeft: 1,
  },
  demoPlayGlyphActive: {
    borderLeftColor: DEMO_BLUE,
  },
  demoStopGlyph: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoStopBar: {
    width: 3,
    height: 8,
    backgroundColor: TACTICAL.textMuted,
    borderRadius: 0.5,
  },
  demoStopBarActive: {
    backgroundColor: DEMO_BLUE,
  },
  demoToggleText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  demoToggleTextActive: {
    color: DEMO_BLUE,
  },
  demoHintText: {
    fontSize: 7,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    opacity: 0.5,
    letterSpacing: 0.3,
  },
  demoCounterBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(91, 141, 239, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.20)',
  },
  demoCounterText: {
    fontSize: 7,
    fontWeight: '900',
    color: DEMO_BLUE,
    letterSpacing: 0.8,
    fontFamily: 'Courier',
  },

  // ── Calibration Row ──────────────────────────────────────
  calibrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  calibrateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  calibrateBtnActive: {
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  calibrateBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  calibrateBtnTextActive: {
    color: TACTICAL.amber,
  },
  calibrateBtnTextDisabled: {
    opacity: 0.4,
  },
  calGlyph: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calGlyphH: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: TACTICAL.textMuted,
  },
  calGlyphV: {
    position: 'absolute',
    width: 1.5,
    height: 10,
    backgroundColor: TACTICAL.textMuted,
  },
  calGlyphDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: TACTICAL.textMuted,
  },

  // ── Reset calibration ────────────────────────────────────
  resetCalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.2)',
  },
  resetCalBtnText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#C0392B',
    letterSpacing: 0.8,
  },
  resetGlyph: {
    width: 10,
    height: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetArrowL: {
    width: 0,
    height: 0,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderRightWidth: 3.5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#C0392B',
  },
  resetBar: {
    width: 3,
    height: 1.5,
    backgroundColor: '#C0392B',
  },
  resetArrowR: {
    width: 0,
    height: 0,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderLeftWidth: 3.5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#C0392B',
  },

  // ── Calibration confirmed ────────────────────────────────
  calConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
  },
  calConfirmText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 0.8,
  },
  checkGlyph: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkShort: {
    position: 'absolute',
    width: 3.5,
    height: 1.5,
    backgroundColor: '#4CAF50',
    bottom: 2,
    left: 0,
    transform: [{ rotate: '45deg' }],
  },
  checkLong: {
    position: 'absolute',
    width: 7,
    height: 1.5,
    backgroundColor: '#4CAF50',
    bottom: 3,
    right: 0,
    transform: [{ rotate: '-45deg' }],
  },

  // ── Sensor unavailable ───────────────────────────────────
  sensorUnavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sensorUnavailableIcon: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suBarH: {
    position: 'absolute',
    width: 8,
    height: 1.5,
    backgroundColor: TACTICAL.textMuted,
    transform: [{ rotate: '45deg' }],
  },
  suBarV: {
    position: 'absolute',
    width: 8,
    height: 1.5,
    backgroundColor: TACTICAL.textMuted,
    transform: [{ rotate: '-45deg' }],
  },
  sensorUnavailableText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    flex: 1,
  },

  // ── Advanced data row ────────────────────────────────────
  advancedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  advancedItem: {
    flex: 1,
    alignItems: 'center',
  },
  advancedLabel: {
    fontSize: 5.5,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 1,
  },
  advancedValue: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  advancedDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },

  // ── Fallback message ─────────────────────────────────────
  fallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.15)',
  },
  fallbackIcon: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackBar: {
    width: 7,
    height: 1.5,
    backgroundColor: TACTICAL.amber,
  },
  fallbackDotSmall: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: TACTICAL.amber,
    marginTop: 1,
  },
  fallbackText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.amber,
    flex: 1,
  },


  // ── V11: Safety Border Pulse Overlay ─────────────────────
  // Absolutely positioned overlay that traces the container border.
  // Opacity is driven by borderPulseAnim (sine wave) in highRisk state.
  safetyBorderPulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: SAFETY_BORDER_PULSE_COLOR,
  },

  // ── Roll Gauge Row (horizontal bar below vehicle display) ──
  rollGaugeRow: {
    position: 'absolute',
    bottom: 4,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // ── Roll Gauge Track ─────────────────────────────────────
  rollGauge: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2.5,
    position: 'relative',
    overflow: 'visible',
  },

  // ── Roll Gauge Indicator (animated dot) ──────────────────
  rollIndicator: {
    position: 'absolute',
    top: -2.5,
    left: '50%',
    width: 5,
    height: 10,
    borderRadius: 2.5,
    backgroundColor: TACTICAL.amber,
    marginLeft: -2.5,
    marginLeft: -2.5,
  },

  // ── Phase 5C: Weight Intelligence Signals ────────────────
  // Subtle row below the metrics row showing ROOF LOAD %, REAR BIAS %, GVWR %.
  // Only visible when weightSignals prop has data.
  // Chips show amber/red indicators only when thresholds are exceeded.
  weightSignalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.12)',
  },
  weightSignalChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  weightSignalDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  weightSignalLabel: {
    fontSize: 5.5,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  weightSignalValue: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  weightSignalDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    marginHorizontal: 2,
  },
  weightSignalExceeded: {
    fontSize: 5,
    fontWeight: '900',
    color: '#C0392B',
    letterSpacing: 0.8,
    marginLeft: 1,
  },
});


