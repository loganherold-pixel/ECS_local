import { useEffect, useMemo, useRef, useState } from 'react';

import { createMotionState, processAngle } from './attitudeMotionEngine';
import {
  getAttitudeStateMeta,
  getAttitudeSourceMeta,
  getAttitudeTelemetryMeta,
  getAttitudeThresholds,
  getAttitudeSeverityState,
  type AttitudeSeverityState,
  type AttitudeSourceOrigin,
  type AttitudeTelemetryHealth,
  type AttitudeTrustConfidence,
} from './attitudeMonitorModel';
import { ATTITUDE_MONITOR_TUNING } from './attitudeMonitorTuning';

const STALE_AFTER_MS = ATTITUDE_MONITOR_TUNING.telemetry.staleAfterMs;
const HOLD_LAST_GOOD_MS = ATTITUDE_MONITOR_TUNING.telemetry.holdLastGoodMs;
const WARNING_EXIT_BUFFER_DEG = ATTITUDE_MONITOR_TUNING.severity.exitBufferDeg.warning;
const CAUTION_EXIT_BUFFER_DEG = ATTITUDE_MONITOR_TUNING.severity.exitBufferDeg.caution;
const WARNING_UPGRADE_DWELL_MS = ATTITUDE_MONITOR_TUNING.severity.upgradeDwellMs.warning;
const CAUTION_UPGRADE_DWELL_MS = ATTITUDE_MONITOR_TUNING.severity.upgradeDwellMs.caution;
const WARNING_DOWNGRADE_DWELL_MS = ATTITUDE_MONITOR_TUNING.severity.downgradeDwellMs.warning;
const CAUTION_DOWNGRADE_DWELL_MS = ATTITUDE_MONITOR_TUNING.severity.downgradeDwellMs.caution;

interface AttitudeMonitorDisplayStateInput {
  rollDeg?: number | null;
  pitchDeg?: number | null;
  sensorStatus?: string;
  sampleTimestampMs?: number | null;
  advanced?: boolean;
  sourceOrigin?: AttitudeSourceOrigin | null;
  telemetryHealthOverride?: AttitudeTelemetryHealth;
  severityOverride?: AttitudeSeverityState | null;
  sourceLabelOverride?: string | null;
  sourceShortLabelOverride?: string | null;
  sourceChipLabelOverride?: string | null;
  sourceStatusLineOverride?: string | null;
}

export interface AttitudeMonitorDisplayState {
  rawRollDeg: number | null;
  rawPitchDeg: number | null;
  displayRollDeg: number | null;
  displayPitchDeg: number | null;
  telemetryHealth: AttitudeTelemetryHealth;
  severity: AttitudeSeverityState;
  showingHeldData: boolean;
  tone: ReturnType<typeof getAttitudeStateMeta>['tone'];
  label: string;
  statusText: string;
  postureLabel: string;
  postureInstruction: string;
  rollColor: string;
  pitchColor: string;
  tiltColor: string;
  tilt: number | null;
  thresholds: ReturnType<typeof getAttitudeThresholds>;
  badgeLabel: string;
  title: string;
  telemetryHint: string;
  sourceOrigin: AttitudeSourceOrigin | null;
  sourceLabel: string | null;
  sourceShortLabel: string | null;
  sourceChipLabel: string | null;
  sourceStatusLine: string | null;
  confidence: AttitudeTrustConfidence | null;
  confidenceLabel: string | null;
  liveMotion: boolean;
}

function getSeverityRank(severity: AttitudeSeverityState): number {
  switch (severity) {
    case 'warning':
      return 2;
    case 'caution':
      return 1;
    default:
      return 0;
  }
}

function isBelowSeverityExitThreshold(
  severity: AttitudeSeverityState,
  rollDeg: number,
  pitchDeg: number,
  advanced?: boolean,
): boolean {
  const thresholds = getAttitudeThresholds(advanced);
  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);
  const tilt = Math.sqrt((rollDeg * rollDeg) + (pitchDeg * pitchDeg));

  if (severity === 'warning') {
    return (
      absRoll < thresholds.rollDanger - WARNING_EXIT_BUFFER_DEG &&
      absPitch < thresholds.pitchDanger - WARNING_EXIT_BUFFER_DEG &&
      tilt < Math.max(thresholds.rollDanger, thresholds.pitchDanger) - WARNING_EXIT_BUFFER_DEG
    );
  }

  if (severity === 'caution') {
    return (
      absRoll < thresholds.rollWarning - CAUTION_EXIT_BUFFER_DEG &&
      absPitch < thresholds.pitchWarning - CAUTION_EXIT_BUFFER_DEG &&
      tilt < Math.max(thresholds.rollWarning, thresholds.pitchWarning) - CAUTION_EXIT_BUFFER_DEG
    );
  }

  return true;
}

export function useAttitudeMonitorDisplayState({
  rollDeg,
  pitchDeg,
  sensorStatus,
  sampleTimestampMs,
  advanced,
  sourceOrigin,
  telemetryHealthOverride,
  severityOverride,
  sourceLabelOverride,
  sourceShortLabelOverride,
  sourceChipLabelOverride,
  sourceStatusLineOverride,
}: AttitudeMonitorDisplayStateInput): AttitudeMonitorDisplayState {
  // This hook is the runtime normalization seam for every Attitude surface:
  // smoothing, stale-data hold behavior, severity stability, and trust metadata
  // all flow through here before presentation components render.
  const [boundaryTick, setBoundaryTick] = useState(0);
  const rollState = useRef(createMotionState());
  const pitchState = useRef(createMotionState());
  const severityRef = useRef<AttitudeSeverityState>('normal');
  const upgradeTargetRef = useRef<AttitudeSeverityState | null>(null);
  const upgradeBeganAtRef = useRef<number | null>(null);
  const downgradeBeganAtRef = useRef<number | null>(null);
  const lastGoodRef = useRef<{ rollDeg: number; pitchDeg: number; at: number } | null>(null);
  const [smoothedAngles, setSmoothedAngles] = useState<{ rollDeg: number | null; pitchDeg: number | null }>({
    rollDeg: null,
    pitchDeg: null,
  });
  const [severityState, setSeverityState] = useState<AttitudeSeverityState>('normal');

  const rawHasValues = rollDeg != null && pitchDeg != null;
  const baseHealth: AttitudeTelemetryHealth = telemetryHealthOverride
    ? telemetryHealthOverride
    : sensorStatus === 'LIVE' || sensorStatus === 'CALIBRATED'
      ? 'live'
      : 'unavailable';

  useEffect(() => {
    if (baseHealth === 'unavailable' || !rawHasValues) {
      return;
    }

    const nextRoll = processAngle(rollState.current, rollDeg ?? 0);
    const nextPitch = processAngle(pitchState.current, pitchDeg ?? 0);
    const nextAngles = {
      rollDeg: nextRoll.smoothedAngle,
      pitchDeg: nextPitch.smoothedAngle,
    };

    lastGoodRef.current = {
      ...nextAngles,
      at: sampleTimestampMs ?? Date.now(),
    };

    setSmoothedAngles((prev) =>
      prev.rollDeg === nextAngles.rollDeg && prev.pitchDeg === nextAngles.pitchDeg ? prev : nextAngles,
    );
  }, [baseHealth, pitchDeg, rawHasValues, rollDeg, sampleTimestampMs]);

  const lastGood = lastGoodRef.current;
  const nowMs = Date.now();
  const lastGoodAgeMs = lastGood == null ? Number.POSITIVE_INFINITY : nowMs - lastGood.at;
  const liveAgeMs = sampleTimestampMs == null ? 0 : nowMs - sampleTimestampMs;
  const liveHasFreshSample = baseHealth === 'live' && rawHasValues && liveAgeMs <= STALE_AFTER_MS;
  const showingRecentData =
    !liveHasFreshSample &&
    baseHealth === 'recent' &&
    lastGood != null &&
    lastGoodAgeMs <= HOLD_LAST_GOOD_MS;
  const showingHeldData =
    !liveHasFreshSample &&
    !showingRecentData &&
    baseHealth !== 'stale' &&
    lastGood != null &&
    lastGoodAgeMs <= HOLD_LAST_GOOD_MS;
  const showingExpiredStaleData =
    !liveHasFreshSample &&
    baseHealth === 'stale' &&
    lastGood != null;
  const telemetryHealth: AttitudeTelemetryHealth =
    liveHasFreshSample
      ? 'live'
      : showingRecentData
        ? 'recent'
        : showingHeldData
          ? 'stale'
          : showingExpiredStaleData
            ? 'stale'
            : 'unavailable';

  const lastGoodAtMs = lastGood?.at ?? null;

  useEffect(() => {
    const deadlines: number[] = [];
    const now = Date.now();

    if (baseHealth === 'live' && rawHasValues && sampleTimestampMs != null) {
      deadlines.push(sampleTimestampMs + STALE_AFTER_MS);
    }

    if (lastGoodAtMs != null) {
      deadlines.push(lastGoodAtMs + HOLD_LAST_GOOD_MS);
    }

    const nextDeadline = deadlines
      .filter(
        (deadline) =>
          deadline > now + ATTITUDE_MONITOR_TUNING.telemetry.boundaryWakeThresholdMs,
      )
      .sort((left, right) => left - right)[0];

    if (nextDeadline == null) {
      return;
    }

    const delayMs = Math.max(
      ATTITUDE_MONITOR_TUNING.telemetry.boundaryWakeMinDelayMs,
      Math.ceil(nextDeadline - now + ATTITUDE_MONITOR_TUNING.telemetry.boundaryWakeLeadMs),
    );
    const timeout = setTimeout(() => {
      setBoundaryTick((value) => value + 1);
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [baseHealth, boundaryTick, lastGoodAtMs, rawHasValues, sampleTimestampMs]);

  const displayRollDeg =
    telemetryHealth === 'live'
      ? smoothedAngles.rollDeg
      : telemetryHealth === 'recent' || telemetryHealth === 'stale'
        ? lastGood?.rollDeg ?? smoothedAngles.rollDeg
        : null;
  const displayPitchDeg =
    telemetryHealth === 'live'
      ? smoothedAngles.pitchDeg
      : telemetryHealth === 'recent' || telemetryHealth === 'stale'
        ? lastGood?.pitchDeg ?? smoothedAngles.pitchDeg
        : null;

  useEffect(() => {
    const nowMs = Date.now();

    if (severityOverride) {
      severityRef.current = severityOverride;
      upgradeTargetRef.current = null;
      upgradeBeganAtRef.current = null;
      downgradeBeganAtRef.current = null;
      setSeverityState((prev) => (prev === severityOverride ? prev : severityOverride));
      return;
    }

    if (telemetryHealth === 'unavailable' || displayRollDeg == null || displayPitchDeg == null) {
      severityRef.current = 'normal';
      upgradeTargetRef.current = null;
      upgradeBeganAtRef.current = null;
      downgradeBeganAtRef.current = null;
      setSeverityState((prev) => (prev === 'normal' ? prev : 'normal'));
      return;
    }

    const instantSeverity = getAttitudeSeverityState(displayRollDeg, displayPitchDeg, advanced);
    const currentSeverity = severityRef.current;

    if (instantSeverity === currentSeverity) {
      upgradeTargetRef.current = null;
      upgradeBeganAtRef.current = null;
      downgradeBeganAtRef.current = null;
      return;
    }

    if (getSeverityRank(instantSeverity) > getSeverityRank(currentSeverity)) {
      downgradeBeganAtRef.current = null;
      if (upgradeTargetRef.current !== instantSeverity) {
        upgradeTargetRef.current = instantSeverity;
        upgradeBeganAtRef.current = nowMs;
        return;
      }

      const upgradeDwellMs =
        instantSeverity === 'warning' ? WARNING_UPGRADE_DWELL_MS : CAUTION_UPGRADE_DWELL_MS;

      if (
        upgradeBeganAtRef.current != null &&
        nowMs - upgradeBeganAtRef.current >= upgradeDwellMs
      ) {
        severityRef.current = instantSeverity;
        upgradeTargetRef.current = null;
        upgradeBeganAtRef.current = null;
        setSeverityState(instantSeverity);
      }
      return;
    }

    upgradeTargetRef.current = null;
    upgradeBeganAtRef.current = null;

    if (!isBelowSeverityExitThreshold(currentSeverity, displayRollDeg, displayPitchDeg, advanced)) {
      downgradeBeganAtRef.current = null;
      return;
    }

    if (downgradeBeganAtRef.current == null) {
      downgradeBeganAtRef.current = nowMs;
      return;
    }

    const dwellMs =
      currentSeverity === 'warning' ? WARNING_DOWNGRADE_DWELL_MS : CAUTION_DOWNGRADE_DWELL_MS;

    if (nowMs - downgradeBeganAtRef.current >= dwellMs) {
      severityRef.current = instantSeverity;
      downgradeBeganAtRef.current = null;
      setSeverityState(instantSeverity);
    }
  }, [
    advanced,
    displayPitchDeg,
    displayRollDeg,
    severityOverride,
    telemetryHealth,
  ]);

  const stateMeta = useMemo(() => {
    if (displayRollDeg == null || displayPitchDeg == null) {
      return null;
    }
    return getAttitudeStateMeta(displayRollDeg, displayPitchDeg, advanced, severityOverride ?? severityState);
  }, [advanced, displayPitchDeg, displayRollDeg, severityOverride, severityState]);

  const telemetryMeta = useMemo(
    () => getAttitudeTelemetryMeta(telemetryHealth, sensorStatus),
    [sensorStatus, telemetryHealth],
  );
  const sourceMeta = useMemo(
    () => getAttitudeSourceMeta(sourceOrigin, telemetryHealth),
    [sourceOrigin, telemetryHealth],
  );
  const thresholds = useMemo(
    () => stateMeta?.thresholds ?? getAttitudeThresholds(advanced),
    [advanced, stateMeta],
  );

  const postureInstruction =
    telemetryHealth === 'recent'
      ? 'Using recent device attitude sample.'
      : telemetryHealth === 'stale'
      ? 'Holding last known posture.'
      : stateMeta?.postureInstruction ?? telemetryMeta.hint;
  const postureLabel =
    telemetryHealth === 'recent'
      ? 'Device attitude recent'
      : telemetryHealth === 'stale'
      ? 'Telemetry stale'
      : stateMeta?.postureLabel ?? telemetryMeta.title;
  const tone = telemetryHealth === 'live' ? stateMeta?.tone ?? 'good' : telemetryMeta.tone;
  const resolvedSourceLabel = sourceLabelOverride ?? sourceMeta.label;
  const resolvedSourceShortLabel = sourceShortLabelOverride ?? sourceMeta.shortLabel;
  const resolvedSourceChipLabel = sourceChipLabelOverride ?? sourceMeta.chipLabel;
  const sourceStatusLine =
    sourceStatusLineOverride ??
    (resolvedSourceLabel == null
      ? null
      : telemetryHealth === 'recent'
        ? `${resolvedSourceShortLabel ?? resolvedSourceLabel} • Recent device attitude`
        : telemetryHealth === 'stale'
          ? `${resolvedSourceShortLabel ?? resolvedSourceLabel} • Holding last known posture`
        : telemetryHealth === 'unavailable'
          ? resolvedSourceShortLabel ?? resolvedSourceLabel
          : sourceMeta.confidenceLabel
            ? `${resolvedSourceLabel} • ${sourceMeta.confidenceLabel}`
            : resolvedSourceLabel);

  return useMemo(
    () => ({
      rawRollDeg: rollDeg ?? null,
      rawPitchDeg: pitchDeg ?? null,
      displayRollDeg,
      displayPitchDeg,
      telemetryHealth,
      severity: severityOverride ?? severityState,
      showingHeldData,
      tone,
      label:
        telemetryHealth === 'live'
          ? stateMeta?.label ?? 'STABLE ATTITUDE'
          : telemetryHealth === 'recent'
            ? telemetryMeta.badgeLabel
          : telemetryHealth === 'stale'
            ? 'STALE ATTITUDE'
            : telemetryMeta.badgeLabel,
      statusText:
        telemetryHealth === 'live'
          ? stateMeta?.statusText ?? telemetryMeta.hint
          : telemetryHealth === 'recent'
            ? 'Recent device attitude sample'
          : telemetryHealth === 'stale'
            ? 'Holding last known posture'
            : telemetryMeta.hint,
      postureLabel,
      postureInstruction,
      rollColor: stateMeta?.rollColor ?? '#8B949E',
      pitchColor: stateMeta?.pitchColor ?? '#8B949E',
      tiltColor: stateMeta?.tiltColor ?? '#8B949E',
      tilt: stateMeta?.tilt ?? null,
      thresholds,
      badgeLabel: telemetryMeta.badgeLabel,
      title: telemetryMeta.title,
      telemetryHint: telemetryMeta.hint,
      sourceOrigin: sourceMeta.origin,
      sourceLabel: resolvedSourceLabel,
      sourceShortLabel: resolvedSourceShortLabel,
      sourceChipLabel: resolvedSourceChipLabel,
      sourceStatusLine,
      confidence: sourceMeta.confidence,
      confidenceLabel: sourceMeta.confidenceLabel,
      liveMotion: telemetryHealth === 'live' && displayRollDeg != null && displayPitchDeg != null,
    }),
    [
      displayPitchDeg,
      displayRollDeg,
      pitchDeg,
      postureInstruction,
      postureLabel,
      rollDeg,
      severityOverride,
      severityState,
      showingHeldData,
      sourceMeta.confidence,
      sourceMeta.confidenceLabel,
      sourceMeta.origin,
      sourceStatusLine,
      resolvedSourceChipLabel,
      resolvedSourceLabel,
      resolvedSourceShortLabel,
      stateMeta,
      telemetryHealth,
      telemetryMeta.badgeLabel,
      telemetryMeta.hint,
      telemetryMeta.title,
      thresholds,
      tone,
    ],
  );
}
