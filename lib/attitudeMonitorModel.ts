import { TACTICAL } from './theme';
import {
  ATTITUDE_MONITOR_TUNING,
  getAttitudeMonitorThresholdPreset,
} from './attitudeMonitorTuning';

export type AttitudeSurfaceTone = 'good' | 'attention' | 'critical' | 'neutral';
export type AttitudeSeverityState = 'normal' | 'caution' | 'warning';
export type AttitudeTelemetryHealth = 'live' | 'stale' | 'unavailable';
export type AttitudeSourceOrigin =
  | 'vehicle_telemetry'
  | 'blu_device'
  | 'device_sensors'
  | 'manual'
  | 'unknown';
export type AttitudeTrustConfidence = 'high' | 'medium' | 'low';

export interface AttitudeThresholds {
  rollDanger: number;
  rollWarning: number;
  pitchDanger: number;
  pitchWarning: number;
}

export interface AttitudeSensorState {
  live: boolean;
  waiting: boolean;
  badgeLabel: string;
  title: string;
  hint: string;
  tone: AttitudeSurfaceTone;
}

export interface AttitudeStateMeta {
  tilt: number;
  critical: boolean;
  warning: boolean;
  tone: AttitudeSurfaceTone;
  label: string;
  statusText: string;
  postureLabel: string;
  postureInstruction: string;
  rollColor: string;
  pitchColor: string;
  tiltColor: string;
  thresholds: AttitudeThresholds;
}

export interface AttitudeSourceMeta {
  origin: AttitudeSourceOrigin | null;
  label: string | null;
  shortLabel: string | null;
  chipLabel: string | null;
  confidence: AttitudeTrustConfidence | null;
  confidenceLabel: string | null;
}

type AttitudeDominantAxis = 'roll' | 'pitch' | 'balanced';

export function getAttitudeThresholds(advanced?: boolean): AttitudeThresholds {
  return { ...getAttitudeMonitorThresholdPreset(advanced) };
}

function getDominantAxis(absRoll: number, absPitch: number): AttitudeDominantAxis {
  if (Math.abs(absRoll - absPitch) <= ATTITUDE_MONITOR_TUNING.labels.balancedAxisDeltaDeg) {
    return 'balanced';
  }
  return absRoll > absPitch ? 'roll' : 'pitch';
}

function getNormalPostureLabel(
  absRoll: number,
  absPitch: number,
  thresholds: AttitudeThresholds,
): { postureLabel: string; statusText: string; postureInstruction: string } {
  const dominantAxis = getDominantAxis(absRoll, absPitch);
  const moderateRoll = absRoll >= Math.max(
    ATTITUDE_MONITOR_TUNING.labels.normal.moderateRollMinDeg,
    thresholds.rollWarning * ATTITUDE_MONITOR_TUNING.labels.normal.moderateRollThresholdRatio,
  );
  const moderatePitch = absPitch >= Math.max(
    ATTITUDE_MONITOR_TUNING.labels.normal.moderatePitchMinDeg,
    thresholds.pitchWarning * ATTITUDE_MONITOR_TUNING.labels.normal.moderatePitchThresholdRatio,
  );

  if (dominantAxis === 'roll' && moderateRoll) {
    return {
      postureLabel: 'Mild side angle',
      statusText: 'Stable on current side angle',
      postureInstruction: 'Continue monitoring.',
    };
  }

  if (dominantAxis === 'pitch' && moderatePitch) {
    return {
      postureLabel: 'Moderate incline',
      statusText: 'Stable on current grade',
      postureInstruction: 'Continue monitoring.',
    };
  }

  return {
    postureLabel: 'Stable',
    statusText: 'Within safe working angle',
    postureInstruction: 'Within safe working angle.',
  };
}

function getCautionPostureLabel(
  rollDeg: number,
  pitchDeg: number,
): { postureLabel: string; statusText: string; postureInstruction: string } {
  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);
  const dominantAxis = getDominantAxis(absRoll, absPitch);

  if (dominantAxis === 'roll') {
    return {
      postureLabel: 'Off-camber',
      statusText: 'Approaching side-angle limit',
      postureInstruction: 'Reduce side angle.',
    };
  }

  if (dominantAxis === 'pitch') {
    return {
      postureLabel: 'Moderate incline',
      statusText: pitchDeg >= 0 ? 'Approaching climb limit' : 'Approaching descent limit',
      postureInstruction: pitchDeg >= 0 ? 'Ease climb angle.' : 'Ease descent angle.',
    };
  }

  return {
    postureLabel: 'Moderate posture',
    statusText: 'Proceed with caution',
    postureInstruction: 'Reduce combined angle.',
  };
}

function getWarningPostureLabel(
  rollDeg: number,
  pitchDeg: number,
): { postureLabel: string; statusText: string; postureInstruction: string } {
  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);
  const dominantAxis = getDominantAxis(absRoll, absPitch);

  if (dominantAxis === 'roll') {
    return {
      postureLabel: 'Approaching limit',
      statusText: 'High side angle',
      postureInstruction: 'Reposition vehicle.',
    };
  }

  if (dominantAxis === 'pitch') {
    return {
      postureLabel: 'Approaching limit',
      statusText: pitchDeg >= 0 ? 'Steep climb angle' : 'Steep descent angle',
      postureInstruction: pitchDeg >= 0 ? 'Reduce climb angle.' : 'Reduce descent angle.',
    };
  }

  return {
    postureLabel: 'Approaching limit',
    statusText: 'Combined vehicle angle is high',
    postureInstruction: 'Reduce angle before advancing.',
  };
}

export function getAttitudeSeverityState(
  rollDeg: number,
  pitchDeg: number,
  advanced?: boolean,
): AttitudeSeverityState {
  const thresholds = getAttitudeThresholds(advanced);
  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);
  const tilt = Math.sqrt((rollDeg * rollDeg) + (pitchDeg * pitchDeg));

  if (
    absRoll >= thresholds.rollDanger ||
    absPitch >= thresholds.pitchDanger ||
    tilt >= Math.max(thresholds.rollDanger, thresholds.pitchDanger)
  ) {
    return 'warning';
  }

  if (
    absRoll >= thresholds.rollWarning ||
    absPitch >= thresholds.pitchWarning ||
    tilt >= Math.max(thresholds.rollWarning, thresholds.pitchWarning)
  ) {
    return 'caution';
  }

  return 'normal';
}

export function getAttitudeStateMeta(
  rollDeg: number,
  pitchDeg: number,
  advanced?: boolean,
  severityOverride?: AttitudeSeverityState,
): AttitudeStateMeta {
  const thresholds = getAttitudeThresholds(advanced);
  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);
  const tilt = Math.sqrt((rollDeg * rollDeg) + (pitchDeg * pitchDeg));
  const severity = severityOverride ?? getAttitudeSeverityState(rollDeg, pitchDeg, advanced);
  const critical = severity === 'warning';
  const warning = severity === 'caution';
  const posture =
    severity === 'warning'
      ? getWarningPostureLabel(rollDeg, pitchDeg)
      : severity === 'caution'
        ? getCautionPostureLabel(rollDeg, pitchDeg)
        : getNormalPostureLabel(absRoll, absPitch, thresholds);

  return {
    tilt,
    critical,
    warning,
    tone: critical ? 'critical' : warning ? 'attention' : 'good',
    label: critical ? 'CRITICAL ATTITUDE' : warning ? 'CAUTION ATTITUDE' : 'STABLE ATTITUDE',
    statusText: posture.statusText,
    postureLabel: posture.postureLabel,
    postureInstruction: posture.postureInstruction,
    rollColor:
      critical || absRoll >= thresholds.rollDanger
        ? TACTICAL.danger
        : absRoll >= thresholds.rollWarning
          ? '#E67E22'
          : TACTICAL.text,
    pitchColor:
      critical || absPitch >= thresholds.pitchDanger
        ? TACTICAL.danger
        : absPitch >= thresholds.pitchWarning
          ? '#E67E22'
          : TACTICAL.text,
    tiltColor: critical ? TACTICAL.danger : warning ? '#E67E22' : '#66BB6A',
    thresholds,
  };
}

export function getAttitudeTelemetryMeta(
  health: AttitudeTelemetryHealth,
  sensorStatus?: string,
): AttitudeSensorState {
  if (health === 'live') {
    return {
      live: true,
      waiting: false,
      badgeLabel: sensorStatus === 'CALIBRATED' ? 'SENSOR CALIBRATED' : 'LIVE SENSOR',
      title: sensorStatus === 'CALIBRATED' ? 'Sensor calibrated' : 'Live attitude',
      hint: sensorStatus === 'CALIBRATED' ? 'Calibration is active.' : 'Live pitch and roll are updating.',
      tone: 'good',
    };
  }

  if (health === 'stale') {
    return {
      live: true,
      waiting: false,
      badgeLabel: 'STALE ATTITUDE',
      title: 'Telemetry stale',
      hint: 'Holding last known posture.',
      tone: 'attention',
    };
  }

  if (sensorStatus === 'AWAITING') {
    return {
      live: false,
      waiting: true,
      badgeLabel: 'WAITING FOR SENSORS',
      title: 'Waiting for sensors',
      hint: 'Hold level for calibration.',
      tone: 'attention',
    };
  }

  return {
    live: false,
    waiting: false,
    badgeLabel: 'SENSOR UNAVAILABLE',
    title: 'Sensor unavailable',
    hint: 'Check motion permissions.',
    tone: 'neutral',
  };
}

export function getAttitudeSourceMeta(
  origin: AttitudeSourceOrigin | null | undefined,
  health: AttitudeTelemetryHealth,
): AttitudeSourceMeta {
  if (!origin || origin === 'unknown') {
    return {
      origin: null,
      label: null,
      shortLabel: null,
      chipLabel: null,
      confidence: null,
      confidenceLabel: null,
    };
  }

  const base =
    origin === 'vehicle_telemetry'
      ? {
          label: 'Live vehicle data',
          shortLabel: 'Vehicle data',
          chipLabel: 'VEHICLE DATA',
          confidence: 'high' as AttitudeTrustConfidence,
        }
      : origin === 'blu_device'
        ? {
            label: 'BLU device data',
            shortLabel: 'BLU device',
            chipLabel: 'BLU DEVICE',
            confidence: 'high' as AttitudeTrustConfidence,
          }
        : origin === 'device_sensors'
          ? {
              label: 'Device sensors',
              shortLabel: 'Device sensors',
              chipLabel: 'DEVICE SENSORS',
              confidence: 'medium' as AttitudeTrustConfidence,
            }
          : {
              label: 'Manual attitude input',
              shortLabel: 'Manual input',
              chipLabel: 'MANUAL INPUT',
              confidence: 'low' as AttitudeTrustConfidence,
            };

  const confidence =
    health === 'stale'
      ? 'low'
      : health === 'unavailable'
        ? null
        : base.confidence;

  return {
    origin,
    label: base.label,
    shortLabel: base.shortLabel,
    chipLabel: base.chipLabel,
    confidence,
    confidenceLabel:
      confidence === 'high'
        ? 'High confidence'
        : confidence === 'medium'
          ? 'Medium confidence'
          : confidence === 'low'
            ? 'Low confidence'
            : null,
  };
}

export function getAttitudeSensorState(sensorStatus?: string): AttitudeSensorState {
  if (sensorStatus === 'LIVE' || sensorStatus === 'CALIBRATED') {
    return {
      live: true,
      waiting: false,
      badgeLabel: sensorStatus === 'CALIBRATED' ? 'SENSOR CALIBRATED' : 'LIVE SENSOR',
      title: sensorStatus === 'CALIBRATED' ? 'Sensor calibrated' : 'Live attitude',
      hint: sensorStatus === 'CALIBRATED' ? 'Calibration is active.' : 'Live pitch and roll are updating.',
      tone: 'good',
    };
  }

  if (sensorStatus === 'AWAITING') {
    return {
      live: false,
      waiting: true,
      badgeLabel: 'WAITING FOR SENSORS',
      title: 'Waiting for sensors',
      hint: 'Hold level for calibration.',
      tone: 'attention',
    };
  }

  return {
    live: false,
    waiting: false,
    badgeLabel: 'SENSOR UNAVAILABLE',
    title: 'Sensor unavailable',
    hint: 'Check motion permissions.',
    tone: 'neutral',
  };
}

export function formatAttitudeDegrees(value: number | null | undefined, digits: number = 1): string {
  if (value == null || Number.isNaN(value)) {
    return '--.-°';
  }
  return `${value.toFixed(digits)}°`;
}
