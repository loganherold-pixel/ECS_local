import React, { useMemo } from 'react';
import Svg, { Defs, FeDropShadow, Filter, G, Line } from 'react-native-svg';

import { useReducedMotion } from '../../../../lib/ecsAnimations';
import {
  DEFAULT_INDICATOR_TRAVEL_Y,
  DEFAULT_MAX_PITCH_DEG,
  DEFAULT_MAX_ROLL_DEG,
  HORIZON_Y,
  PITCH_FRONT_UI_SIGN,
  PITCH_REAR_UI_SIGN,
  ROLL_LEFT_UI_SIGN,
  ROLL_RIGHT_UI_SIGN,
  clamp,
  resolvePositiveDegreeLimit,
  safeDeg,
} from '../vehicleAttitudeTuning';

export type AttitudeLiveHashOverlayProps = {
  pitchDeg: number;
  rollDeg: number;
  maxPitchDeg?: number;
  maxRollDeg?: number;
  orientationCompensated?: boolean;
};

type LiveHashTrack = {
  panel: 'pitch' | 'roll';
  side: 'left' | 'right';
  horizonX: number;
  extremeX: number;
  horizonY: number;
  minY: number;
  maxY: number;
};

type LiveHashTrackId = 'pitchFrontLeft' | 'pitchRearRight' | 'rollLeft' | 'rollRight';

const HASH_CORE = '#00eaff';
const HASH_HALO = 'rgba(0, 234, 255, 0.42)';
const HASH_SPARK = '#eaffff';

export const LIVE_HASH_TRACKS: Record<LiveHashTrackId, LiveHashTrack> = {
  pitchFrontLeft: {
    panel: 'pitch',
    side: 'left',
    horizonX: 118,
    extremeX: 218,
    horizonY: HORIZON_Y,
    minY: 150,
    maxY: 850,
  },
  pitchRearRight: {
    panel: 'pitch',
    side: 'right',
    horizonX: 815,
    extremeX: 710,
    horizonY: HORIZON_Y,
    minY: 150,
    maxY: 850,
  },
  rollLeft: {
    panel: 'roll',
    side: 'left',
    horizonX: 940,
    extremeX: 1040,
    horizonY: HORIZON_Y,
    minY: 150,
    maxY: 850,
  },
  rollRight: {
    panel: 'roll',
    side: 'right',
    horizonX: 1640,
    extremeX: 1540,
    horizonY: HORIZON_Y,
    minY: 150,
    maxY: 850,
  },
};

export function getTrackPoint(track: LiveHashTrack, y: number) {
  const clampedY = clamp(y, track.minY, track.maxY);
  const normalized = clamp(
    (clampedY - track.horizonY) / DEFAULT_INDICATOR_TRAVEL_Y,
    -1,
    1,
  );
  const curveAmount = Math.pow(Math.abs(normalized), 1.35);
  const x = track.horizonX + (track.extremeX - track.horizonX) * curveAmount;

  return { x, y: clampedY };
}

function getNormalizedDegrees(value: number, maxDeg: number): number {
  const safeLimit = resolvePositiveDegreeLimit(maxDeg, 1);
  return clamp(safeDeg(value) / safeLimit, -1, 1);
}

function LiveHashMarker({
  id,
  point,
  side,
  reducedMotion,
}: {
  id: LiveHashTrackId;
  point: { x: number; y: number };
  side: 'left' | 'right';
  reducedMotion: boolean;
}) {
  const direction = side === 'left' ? 1 : -1;
  const length = 54;
  const shortLength = 38;
  const notch = 12;
  const transitionStyle = reducedMotion
    ? undefined
    : ({
      transitionProperty: 'transform',
      transitionDuration: '130ms',
      transitionTimingFunction: 'ease-out',
    } as const);

  return (
    <G
      testID={`vehicle-attitude-live-hash-${id}`}
      pointerEvents="none"
      transform={`translate(${point.x} ${point.y})`}
      filter="url(#vehicle-attitude-live-hash-glow)"
      style={transitionStyle}
    >
      <Line
        x1={-length / 2}
        y1={0}
        x2={length / 2}
        y2={0}
        stroke={HASH_HALO}
        strokeWidth={16}
        strokeLinecap="round"
        opacity={0.62}
      />
      <Line
        x1={-length / 2}
        y1={0}
        x2={length / 2}
        y2={0}
        stroke={HASH_CORE}
        strokeWidth={7}
        strokeLinecap="round"
        opacity={0.98}
      />
      <Line
        x1={(-shortLength / 2) * direction}
        y1={-10}
        x2={(shortLength / 2) * direction}
        y2={-10}
        stroke={HASH_CORE}
        strokeWidth={4.5}
        strokeLinecap="round"
        opacity={0.86}
      />
      <Line
        x1={(-shortLength / 2) * direction}
        y1={10}
        x2={(shortLength / 2) * direction}
        y2={10}
        stroke={HASH_CORE}
        strokeWidth={4.5}
        strokeLinecap="round"
        opacity={0.86}
      />
      <Line
        x1={0}
        y1={-notch}
        x2={0}
        y2={notch}
        stroke={HASH_SPARK}
        strokeWidth={3.5}
        strokeLinecap="round"
        opacity={0.94}
      />
    </G>
  );
}

export default function AttitudeLiveHashOverlay({
  pitchDeg,
  rollDeg,
  maxPitchDeg = DEFAULT_MAX_PITCH_DEG,
  maxRollDeg = DEFAULT_MAX_ROLL_DEG,
  orientationCompensated = true,
}: AttitudeLiveHashOverlayProps) {
  const reducedMotion = useReducedMotion();
  void orientationCompensated;

  const points = useMemo(() => {
    const pitchNorm = getNormalizedDegrees(pitchDeg, maxPitchDeg);
    const rollNorm = getNormalizedDegrees(rollDeg, maxRollDeg);

    return {
      pitchFrontLeft: getTrackPoint(
        LIVE_HASH_TRACKS.pitchFrontLeft,
        HORIZON_Y + pitchNorm * PITCH_FRONT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
      ),
      pitchRearRight: getTrackPoint(
        LIVE_HASH_TRACKS.pitchRearRight,
        HORIZON_Y + pitchNorm * PITCH_REAR_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
      ),
      rollLeft: getTrackPoint(
        LIVE_HASH_TRACKS.rollLeft,
        HORIZON_Y + rollNorm * ROLL_LEFT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
      ),
      rollRight: getTrackPoint(
        LIVE_HASH_TRACKS.rollRight,
        HORIZON_Y + rollNorm * ROLL_RIGHT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
      ),
    };
  }, [maxPitchDeg, maxRollDeg, pitchDeg, rollDeg]);

  return (
    <Svg
      testID="vehicle-attitude-live-hash-overlay"
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox="0 0 1753 1024"
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs>
        <Filter id="vehicle-attitude-live-hash-glow" x="-80%" y="-80%" width="260%" height="260%">
          <FeDropShadow dx="0" dy="0" stdDeviation="7" floodColor={HASH_CORE} floodOpacity="0.98" />
        </Filter>
      </Defs>
      <LiveHashMarker
        id="pitchFrontLeft"
        point={points.pitchFrontLeft}
        side={LIVE_HASH_TRACKS.pitchFrontLeft.side}
        reducedMotion={reducedMotion}
      />
      <LiveHashMarker
        id="pitchRearRight"
        point={points.pitchRearRight}
        side={LIVE_HASH_TRACKS.pitchRearRight.side}
        reducedMotion={reducedMotion}
      />
      <LiveHashMarker
        id="rollLeft"
        point={points.rollLeft}
        side={LIVE_HASH_TRACKS.rollLeft.side}
        reducedMotion={reducedMotion}
      />
      <LiveHashMarker
        id="rollRight"
        point={points.rollRight}
        side={LIVE_HASH_TRACKS.rollRight.side}
        reducedMotion={reducedMotion}
      />
    </Svg>
  );
}
