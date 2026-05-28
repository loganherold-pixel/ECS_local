import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Line,
  Rect,
  Stop,
} from 'react-native-svg';

import { TACTICAL } from '../../lib/theme';

type Props = {
  rollDeg: number;
  pitchDeg?: number | null;
  live?: boolean;
  maxRollDeg?: number;
};

const DEFAULT_MAX_ROLL_DEG = 45;
const CAMPSITE_LEVEL_TOLERANCE_DEG = 1;
const VIEWBOX_WIDTH = 260;
const VIEWBOX_HEIGHT = 42;
const TRACK_LEFT = 18;
const TRACK_RIGHT = VIEWBOX_WIDTH - 18;
const TRACK_Y = 24;
const TICK_STEP_DEG = 5;
const MAJOR_TICK_STEP_DEG = 15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeRoll(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function safePitch(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatRoll(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';
  const fixed = Math.abs(rounded) >= 10 || Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1);
  return `${prefix}${fixed}°`;
}

function getRollToneColor(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 30) return '#EF5350';
  if (magnitude >= 18) return '#FFB74D';
  if (magnitude >= 8) return TACTICAL.amber;
  return '#76E0A0';
}

function rollToX(value: number, maxRollDeg: number): number {
  const halfWidth = (TRACK_RIGHT - TRACK_LEFT) / 2;
  const center = TRACK_LEFT + halfWidth;
  const normalized = clamp(value / maxRollDeg, -1, 1);
  return center + normalized * halfWidth;
}

export default function VehicleProfileRollAttitudeStrip({
  rollDeg,
  pitchDeg,
  live = false,
  maxRollDeg = DEFAULT_MAX_ROLL_DEG,
}: Props) {
  const safeMaxRoll = Math.max(1, Math.abs(maxRollDeg));
  const clampedRoll = clamp(safeRoll(rollDeg), -safeMaxRoll, safeMaxRoll);
  const displayRoll = safeRoll(rollDeg);
  const markerX = rollToX(clampedRoll, safeMaxRoll);
  const centerX = rollToX(0, safeMaxRoll);
  const activeColor = getRollToneColor(clampedRoll);
  const activeStartX = Math.min(centerX, markerX);
  const activeWidth = Math.max(1, Math.abs(markerX - centerX));
  const displayPitch = safePitch(pitchDeg);
  const isRollLevel = Math.abs(displayRoll) <= CAMPSITE_LEVEL_TOLERANCE_DEG;
  const isPitchLevel = Math.abs(displayPitch) <= CAMPSITE_LEVEL_TOLERANCE_DEG;
  const campsiteLevel = isRollLevel && isPitchLevel;
  const directionLabel = isRollLevel ? 'LEVEL' : displayRoll > 0 ? 'RIGHT' : 'LEFT';

  const ticks = useMemo(() => {
    const values: { value: number; x: number; major: boolean }[] = [];
    for (let value = -safeMaxRoll; value <= safeMaxRoll; value += TICK_STEP_DEG) {
      values.push({
        value,
        x: rollToX(value, safeMaxRoll),
        major: value === 0 || Math.abs(value) % MAJOR_TICK_STEP_DEG === 0,
      });
    }
    return values;
  }, [safeMaxRoll]);

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Vehicle roll monitor. Roll ${formatRoll(displayRoll)}. Pitch ${formatRoll(displayPitch)}. ${campsiteLevel ? 'Campsite level' : `${directionLabel.toLowerCase()} attitude`}. Range negative ${safeMaxRoll} to positive ${safeMaxRoll} degrees.`}
      style={styles.container}
      testID="vehicle-profile-roll-attitude-strip"
    >
      <View style={styles.headerRow}>
        <Text style={styles.label} numberOfLines={1}>
          ROLL
        </Text>
        <Text style={[styles.value, { color: activeColor }]} numberOfLines={1}>
          {formatRoll(displayRoll)}
        </Text>
        {live && campsiteLevel ? (
          <View style={styles.campsiteStatus}>
            <Text style={styles.campsiteStatusLine} numberOfLines={1}>
              CampSite
            </Text>
            <Text style={styles.campsiteStatusLine} numberOfLines={1}>
              LEVEL
            </Text>
          </View>
        ) : (
          <Text style={[styles.status, live ? styles.statusLive : null]} numberOfLines={1}>
            {live ? directionLabel : 'STANDBY'}
          </Text>
        )}
      </View>

      <View style={styles.trackFrame}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
          <Defs>
            <LinearGradient id="vehicle-roll-active-gradient" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={TACTICAL.amber} stopOpacity="0.72" />
              <Stop offset="1" stopColor={activeColor} stopOpacity="1" />
            </LinearGradient>
          </Defs>

          <Rect
            x={TRACK_LEFT}
            y={TRACK_Y - 1}
            width={TRACK_RIGHT - TRACK_LEFT}
            height={2}
            rx={1}
            fill="rgba(230,237,243,0.25)"
          />

          {ticks.map((tick) => (
            <Line
              key={`roll-tick-${tick.value}`}
              x1={tick.x}
              y1={TRACK_Y - (tick.major ? 7 : 4)}
              x2={tick.x}
              y2={TRACK_Y + (tick.major ? 7 : 4)}
              stroke={tick.value === 0 ? 'rgba(230,237,243,0.7)' : 'rgba(230,237,243,0.34)'}
              strokeWidth={tick.major ? 1.35 : 0.85}
              strokeLinecap="round"
            />
          ))}

          <Rect
            x={activeStartX}
            y={TRACK_Y - 2.3}
            width={activeWidth}
            height={4.6}
            rx={2.3}
            fill="url(#vehicle-roll-active-gradient)"
            opacity={0.95}
          />
          <Rect
            x={activeStartX - 2}
            y={TRACK_Y - 5.6}
            width={activeWidth + 4}
            height={11.2}
            rx={5.6}
            fill={activeColor}
            opacity={0.14}
          />

          <Line
            x1={markerX}
            y1={4}
            x2={markerX}
            y2={15}
            stroke={activeColor}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <Line
            x1={markerX}
            y1={33}
            x2={markerX}
            y2={40}
            stroke={activeColor}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <Line
            x1={markerX}
            y1={7}
            x2={markerX}
            y2={38}
            stroke={activeColor}
            strokeWidth={7.5}
            strokeLinecap="round"
            opacity={0.12}
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 13,
    right: 13,
    top: '50%',
    height: 58,
    marginTop: -29,
    zIndex: 2,
  },
  headerRow: {
    minHeight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  value: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.35,
    includeFontPadding: false,
  },
  status: {
    marginLeft: 'auto',
    color: 'rgba(230, 237, 243, 0.52)',
    fontSize: 6.4,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.48,
    includeFontPadding: false,
  },
  statusLive: {
    color: 'rgba(230, 237, 243, 0.76)',
  },
  campsiteStatus: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  campsiteStatusLine: {
    color: '#76E0A0',
    fontSize: 6.4,
    lineHeight: 7,
    fontWeight: '900',
    letterSpacing: 0.48,
    includeFontPadding: false,
  },
  trackFrame: {
    flex: 1,
    minHeight: 0,
  },
});
