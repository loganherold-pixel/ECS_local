/**
 * PowerFlowDiagram — Phase 3G-1 / 3G-3
 *
 * Visual power flow visualization:
 *   Solar Input → Battery → Load
 *
 * Displays live telemetry values in a vertical energy flow layout
 * with a circular battery gauge ring, animated flow direction indicators,
 * and stale-data badge.
 *
 * Phase 3G-3: Animated energy flow arrows
 *   - Opacity pulses 0.3 → 1.0 → 0.3 on active arrows
 *   - Speed proportional to power magnitude (clamp(power/100, 0.5, 3))
 *   - Solar→Battery active when solarWatts > 10 OR wattsIn > 10
 *   - Battery→Load active when wattsOut > 10
 *   - Animation disabled when data is stale
 *
 * No external SVG dependency — uses styled Views for the gauge ring.
 * Matches ECS tactical dark theme with amber accent.
 */

import React, { useRef, useEffect } from 'react';

import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { SafeIcon } from '../../../components/SafeIcon';
import { ECS, SPACING, RADIUS } from '../../../lib/theme';


// ── Props ────────────────────────────────────────────────────
export interface PowerFlowDiagramProps {
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
  isStale?: boolean;
  /** Palette from ThemeContext — optional, falls back to ECS defaults */
  palette?: {
    panel: string;
    text: string;
    textMuted: string;
    amber: string;
    border: string;
  };
}

// ── Constants ────────────────────────────────────────────────
const FLOW_THRESHOLD = 10;
const SOLAR_GOLD = '#FFD700';
const LOAD_ORANGE = '#FF9500';
const STALE_ORANGE = '#FF9500';
const AMBER_GLOW = '#FFB800';

// ── Helpers ──────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function socColor(soc: number | undefined): string {
  if (soc === undefined) return '#555';
  if (soc >= 60) return '#34C759';
  if (soc >= 30) return '#FFB800';
  if (soc >= 15) return '#FF9500';
  return '#FF3B30';
}

function socTrackColor(soc: number | undefined): string {
  if (soc === undefined) return 'rgba(255,255,255,0.06)';
  const c = socColor(soc);
  return c + '18';
}

function fmtW(w: number | undefined): string {
  if (w === undefined || w === null) return '0';
  if (w >= 1000) return `${(w / 1000).toFixed(1)}k`;
  return `${Math.round(w)}`;
}

function fmtWUnit(w: number | undefined): string {
  if (w === undefined || w === null) return 'W';
  if (w >= 1000) return 'kW';
  return 'W';
}

// ── Animated Flow Arrow ──────────────────────────────────────
/**
 * Pulsing flow arrow between nodes.
 *
 * When active:
 *   - Three chevrons pulse opacity 0.3 → 1.0 → 0.3
 *   - Duration = 1500 / speed  ms  (speed = clamp(power/100, 0.5, 3))
 *   - Amber glow color
 *
 * When inactive or stale: static dim arrow, no animation.
 */
function AnimatedFlowArrow({
  active,
  color,
  power,
  stale,
}: {
  active: boolean;
  color: string;
  power: number;
  stale?: boolean;
}) {
  const shouldAnimate = active && !stale;
  const speed = clamp(power / 100, 0.5, 3);
  const duration = Math.round(1500 / speed);

  // Three staggered animated values for the three chevrons
  const pulse0 = useRef(new Animated.Value(0.3)).current;
  const pulse1 = useRef(new Animated.Value(0.3)).current;
  const pulse2 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!shouldAnimate) {
      // Reset to static
      pulse0.setValue(0.3);
      pulse1.setValue(0.3);
      pulse2.setValue(0.3);
      return;
    }

    // Create staggered pulse animations for each chevron
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1.0,
            duration: duration * 0.4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: duration * 0.6,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

    const stagger = Math.round(duration * 0.2);
    const a0 = createPulse(pulse0, 0);
    const a1 = createPulse(pulse1, stagger);
    const a2 = createPulse(pulse2, stagger * 2);

    a0.start();
    a1.start();
    a2.start();

    return () => {
      a0.stop();
      a1.stop();
      a2.stop();
    };
  }, [shouldAnimate, duration, pulse0, pulse1, pulse2]);

  const lineColor = active ? color + '50' : 'rgba(255,255,255,0.06)';
  const inactiveArrowColor = 'rgba(255,255,255,0.15)';
  const glowColor = shouldAnimate ? AMBER_GLOW : active ? color : inactiveArrowColor;

  // If not animating, render static version
  if (!shouldAnimate) {
    return (
      <View style={flowArrowStyles.container}>
        <View style={[flowArrowStyles.line, { backgroundColor: lineColor }]} />
        <View style={flowArrowStyles.chevronColumn}>
          <SafeIcon name="chevron-down" size={13} color={active ? color : inactiveArrowColor} />
        </View>
        <View style={[flowArrowStyles.line, { backgroundColor: lineColor }]} />
      </View>
    );
  }

  // Animated version with three staggered chevrons
  return (
    <View style={flowArrowStyles.container}>
      {/* Top line segment */}
      <View style={[flowArrowStyles.lineShort, { backgroundColor: lineColor }]} />

      {/* Three pulsing chevrons */}
      <View style={flowArrowStyles.chevronColumn}>
        <Animated.View style={{ opacity: pulse0 }}>
          <SafeIcon name="chevron-down" size={12} color={glowColor} />
        </Animated.View>
        <Animated.View style={[flowArrowStyles.chevronMid, { opacity: pulse1 }]}>
          <SafeIcon name="chevron-down" size={13} color={glowColor} />
        </Animated.View>
        <Animated.View style={{ opacity: pulse2 }}>
          <SafeIcon name="chevron-down" size={12} color={glowColor} />
        </Animated.View>
      </View>

      {/* Bottom line segment */}
      <View style={[flowArrowStyles.lineShort, { backgroundColor: lineColor }]} />
    </View>
  );
}

const flowArrowStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  line: {
    width: 1.5,
    flex: 1,
  },
  lineShort: {
    width: 1.5,
    height: 6,
  },
  chevronColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 1,
  },
  chevronMid: {
    marginVertical: -4,
  },
});

// ── Battery Ring Gauge ───────────────────────────────────────
function BatteryRing({
  socPct,
  textColor,
  mutedColor,
}: {
  socPct: number | undefined;
  textColor: string;
  mutedColor: string;
}) {
  const soc = socPct !== undefined ? Math.max(0, Math.min(100, socPct)) : undefined;
  const color = socColor(soc);
  const trackBg = socTrackColor(soc);
  const fillDeg = soc !== undefined ? (soc / 100) * 360 : 0;

  return (
    <View style={ringStyles.outer}>
      {/* Track ring (background) */}
      <View
        style={[
          ringStyles.track,
          { borderColor: trackBg },
        ]}
      />

      {/* Fill ring segments */}
      {soc !== undefined && soc > 0 && (
        <View style={[ringStyles.quadrantMask, ringStyles.qBR]}>
          <View
            style={[
              ringStyles.quadrantFill,
              {
                borderColor: color,
                borderTopColor: fillDeg >= 90 ? color : 'transparent',
                borderRightColor: color,
                borderBottomColor: fillDeg > 0 ? color : 'transparent',
                borderLeftColor: fillDeg >= 90 ? color : 'transparent',
                transform: [
                  {
                    rotate: fillDeg < 90 ? `${fillDeg - 90}deg` : '0deg',
                  },
                ],
                opacity: fillDeg > 0 ? 1 : 0,
              },
            ]}
          />
        </View>
      )}

      {/* Colored border ring */}
      <View
        style={[
          ringStyles.fillRing,
          {
            borderColor: color,
            opacity: soc !== undefined ? 0.85 : 0,
          },
        ]}
      />

      {/* Inner content */}
      <View style={ringStyles.inner}>
        <View
          style={[
            ringStyles.innerGlow,
            { backgroundColor: soc !== undefined ? color + '08' : 'transparent' },
          ]}
        />
        <Text
          style={[
            ringStyles.socValue,
            { color: soc !== undefined ? color : mutedColor },
          ]}
        >
          {soc !== undefined ? Math.round(soc) : '--'}
        </Text>
        <Text style={[ringStyles.socUnit, { color: mutedColor }]}>
          {soc !== undefined ? '%' : ''}
        </Text>
        <Text style={[ringStyles.socLabel, { color: mutedColor }]}>
          SOC
        </Text>
      </View>
    </View>
  );
}

const RING_SIZE = 130;
const RING_WIDTH = 5;

const ringStyles = StyleSheet.create({
  outer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
  },
  fillRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
  },
  quadrantMask: {
    position: 'absolute',
    width: RING_SIZE / 2,
    height: RING_SIZE / 2,
    overflow: 'hidden',
  },
  qBR: {
    right: 0,
    bottom: 0,
  },
  quadrantFill: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: RING_SIZE - RING_WIDTH * 2 - 12,
    height: RING_SIZE - RING_WIDTH * 2 - 12,
    borderRadius: (RING_SIZE - RING_WIDTH * 2 - 12) / 2,
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: (RING_SIZE - RING_WIDTH * 2 - 12) / 2,
  },
  socValue: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -1,
    lineHeight: 40,
  },
  socUnit: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -2,
  },
  socLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 4,
    marginTop: 2,
  },
});

// ── Node Card (Solar / Load) ─────────────────────────────────
function FlowNode({
  icon,
  label,
  value,
  unit,
  accentColor,
  active,
  panelBg,
  textColor,
  mutedColor,
  borderColor,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  accentColor: string;
  active: boolean;
  panelBg: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  return (
    <View
      style={[
        nodeStyles.card,
        {
          backgroundColor: panelBg,
          borderColor: active ? accentColor + '40' : borderColor,
        },
      ]}
    >
      <View
        style={[
          nodeStyles.iconWrap,
          {
            backgroundColor: active ? accentColor + '12' : 'rgba(255,255,255,0.03)',
          },
        ]}
      >
        <SafeIcon
          name={icon}
          size={20}
          color={active ? accentColor : mutedColor}
        />
      </View>

      <Text style={[nodeStyles.label, { color: mutedColor }]}>
        {label}
      </Text>

      <View style={nodeStyles.valueRow}>
        <Text
          style={[
            nodeStyles.value,
            { color: active ? accentColor : mutedColor },
          ]}
        >
          {value}
        </Text>
        <Text style={[nodeStyles.unit, { color: mutedColor }]}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

const nodeStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    minWidth: 120,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ── Main Component ───────────────────────────────────────────
export default function PowerFlowDiagram({
  socPct,
  wattsIn,
  wattsOut,
  solarWatts,
  isStale,
  palette,
}: PowerFlowDiagramProps) {
  // Resolve colors
  const panelBg = palette?.panel ?? ECS.bgPanel;
  const textColor = palette?.text ?? ECS.text;
  const mutedColor = palette?.textMuted ?? ECS.muted;
  const amberColor = palette?.amber ?? ECS.accent;
  const borderColor = palette?.border ?? ECS.stroke;

  // Derive display values
  const solarValue = solarWatts ?? wattsIn ?? 0;
  const loadValue = wattsOut ?? 0;

  // Phase 3G-3: Flow thresholds — arrows activate above 10 W
  const solarFlowActive = solarValue > FLOW_THRESHOLD || (wattsIn ?? 0) > FLOW_THRESHOLD;
  const loadFlowActive = loadValue > FLOW_THRESHOLD;

  // Power values for animation speed calculation
  const solarPower = Math.max(solarValue, wattsIn ?? 0);
  const loadPower = loadValue;

  return (
    <View style={styles.container}>
      {/* Stale badge */}
      {isStale && (
        <View style={styles.staleBadge}>
          <SafeIcon name="warning-outline" size={11} color={STALE_ORANGE} />
          <Text style={styles.staleText}>STALE DATA</Text>
        </View>
      )}

      {/* ── Solar Node ──────────────────────────────── */}
      <FlowNode
        icon="sunny-outline"
        label="Solar"
        value={fmtW(solarValue)}
        unit={fmtWUnit(solarValue)}
        accentColor={SOLAR_GOLD}
        active={solarValue > 0}
        panelBg={panelBg}
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      />

      {/* ── Animated Flow Arrow: Solar → Battery ────── */}
      <AnimatedFlowArrow
        active={solarFlowActive}
        color={SOLAR_GOLD}
        power={solarPower}
        stale={isStale}
      />

      {/* ── Battery Ring Gauge ──────────────────────── */}
      <View style={styles.batterySection}>
        <BatteryRing
          socPct={socPct}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <Text style={[styles.batteryLabel, { color: mutedColor }]}>
          BATTERY
        </Text>
      </View>

      {/* ── Animated Flow Arrow: Battery → Load ─────── */}
      <AnimatedFlowArrow
        active={loadFlowActive}
        color={LOAD_ORANGE}
        power={loadPower}
        stale={isStale}
      />

      {/* ── Load Node ───────────────────────────────── */}
      <FlowNode
        icon="flash-outline"
        label="Load"
        value={fmtW(loadValue)}
        unit={fmtWUnit(loadValue)}
        accentColor={LOAD_ORANGE}
        active={loadValue > 0}
        panelBg={panelBg}
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  batterySection: {
    alignItems: 'center',
    gap: 4,
  },
  batteryLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  staleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: STALE_ORANGE + '15',
    borderColor: STALE_ORANGE + '35',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  staleText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 3,
    color: STALE_ORANGE,
  },
});


