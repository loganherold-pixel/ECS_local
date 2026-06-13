export type DepartureDeltaBriefReadiness = 'feature_flagged';
export type DepartureDeltaBriefPosture = 'go' | 'caution' | 'hold';
export type DepartureDeltaDirection = 'increased' | 'decreased' | 'unchanged';
export type DepartureDeltaItemKind =
  | 'new_blocker'
  | 'resolved_blocker'
  | 'blocker_severity_changed'
  | 'vehicle_loadout_changed'
  | 'offline_regression'
  | 'camp_confidence_changed'
  | 'stale_input';
export type DepartureDeltaSeverity = 'info' | 'watch' | 'caution' | 'critical' | 'unavailable';
export type DepartureDeltaScalar = string | number | boolean | null;
export type DepartureDeltaBlockerSeverity = 'info' | 'warning' | 'blocker' | 'critical' | 'unknown';
export type DepartureDeltaOfflineStatus = 'ready' | 'partial' | 'missing' | 'unknown' | string;
export type DepartureDeltaCoverageStatus = 'complete' | 'partial' | 'missing' | 'unknown' | string;
export type DepartureDeltaFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'missing' | 'unknown' | string;
export type DepartureDeltaConfidence = 'high' | 'medium' | 'low' | 'unknown' | string;

export type DepartureDeltaFeatureFlags = {
  departureDeltaBrief?: boolean | null;
};

export type TimestampedComparisonValue<T extends DepartureDeltaScalar = DepartureDeltaScalar> = {
  value: T;
  observedAt?: string | null;
  source?: string | null;
  unit?: string | null;
};

export type ComparisonEvidence = {
  fieldId: string;
  label: string;
  previous: TimestampedComparisonValue;
  current: TimestampedComparisonValue;
  comparable: boolean;
  reason?: string | null;
};

export type DeltaItem = {
  id: string;
  kind: DepartureDeltaItemKind;
  label: string;
  summary: string;
  severity: DepartureDeltaSeverity;
  direction?: DepartureDeltaDirection;
  evidence: ComparisonEvidence;
};

export type ReadinessPostureDelta = {
  previous?: DepartureDeltaBriefPosture | null;
  current: DepartureDeltaBriefPosture;
  changed: boolean;
  evidence?: ComparisonEvidence;
  unavailableReason?: string | null;
};

export type DepartureDeltaBlocker = {
  id: string;
  label: string;
  severity?: DepartureDeltaBlockerSeverity | null;
  observedAt?: string | null;
  source?: string | null;
  detail?: string | null;
};

export type DepartureDeltaComparableField = {
  fieldId: string;
  label: string;
  value: DepartureDeltaScalar;
  observedAt?: string | null;
  source?: string | null;
  unit?: string | null;
};

export type DepartureDeltaOfflinePackageStatus = {
  packageStatus?: DepartureDeltaOfflineStatus | null;
  coverage?: DepartureDeltaCoverageStatus | null;
  freshness?: DepartureDeltaFreshnessStatus | null;
  routeMatch?: boolean | null;
  cacheCompletenessPct?: number | null;
  observedAt?: string | null;
  source?: string | null;
};

export type DepartureDeltaCampEndpointConfidence = {
  endpointId?: string | null;
  confidence?: DepartureDeltaConfidence | null;
  confidenceScale?: string | null;
  observedAt?: string | null;
  source?: string | null;
};

export type DepartureDeltaFreshnessSnapshot = {
  status?: DepartureDeltaFreshnessStatus | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  source?: string | null;
};

export type DepartureDeltaRosterSnapshot = {
  status?: 'fresh' | 'stale' | 'missing' | 'unknown' | string | null;
  observedAt?: string | null;
  source?: string | null;
};

export type DepartureDeltaMargins = {
  fuel?: DepartureDeltaComparableField | TimestampedComparisonValue<number | string | null> | null;
  water?: DepartureDeltaComparableField | TimestampedComparisonValue<number | string | null> | null;
  power?: DepartureDeltaComparableField | TimestampedComparisonValue<number | string | null> | null;
};

export type DepartureDeltaPreviousAuditSnapshot = {
  auditId?: string | null;
  capturedAt?: string | null;
  posture?: TimestampedComparisonValue<DepartureDeltaBriefPosture | null> | null;
  blockers?: DepartureDeltaBlocker[] | null;
  vehicleLoadoutValues?: DepartureDeltaComparableField[] | null;
  routeState?: DepartureDeltaComparableField | TimestampedComparisonValue | null;
  weatherFreshness?: DepartureDeltaFreshnessSnapshot | null;
  offlinePackage?: DepartureDeltaOfflinePackageStatus | null;
  campEndpointConfidence?: DepartureDeltaCampEndpointConfidence | null;
  dispatchRoster?: DepartureDeltaRosterSnapshot | null;
  margins?: DepartureDeltaMargins | null;
};

export type DepartureDeltaCurrentReadiness = {
  posture?: DepartureDeltaBriefPosture | 'ready' | 'hold' | 'caution' | null;
  observedAt?: string | null;
  source?: string | null;
  blockers?: DepartureDeltaBlocker[] | null;
};

export type DepartureDeltaCurrentContext = {
  readiness: DepartureDeltaCurrentReadiness;
  activeVehicle?: unknown;
  routeState?: DepartureDeltaComparableField | TimestampedComparisonValue | null;
  weatherFreshness?: DepartureDeltaFreshnessSnapshot | null;
  offlinePackage?: DepartureDeltaOfflinePackageStatus | null;
  campEndpointConfidence?: DepartureDeltaCampEndpointConfidence | null;
  dispatchRoster?: DepartureDeltaRosterSnapshot | null;
  vehicleLoadoutValues?: DepartureDeltaComparableField[] | null;
  margins?: DepartureDeltaMargins | null;
};

export type DepartureDeltaBriefInput = {
  featureFlags?: DepartureDeltaFeatureFlags | null;
  previousAudit?: DepartureDeltaPreviousAuditSnapshot | null;
  current: DepartureDeltaCurrentContext;
  now?: string | null;
};

export type DepartureDeltaBriefSections = {
  newBlockers: DeltaItem[];
  resolvedBlockers: DeltaItem[];
  staleInputs: DeltaItem[];
  changedVehicleLoadoutValues: DeltaItem[];
  offlinePackageRegressions: DeltaItem[];
  campConfidenceChanges: DeltaItem[];
};

export type DepartureDeltaBriefResult = {
  enabled: boolean;
  hasComparablePreviousAudit: boolean;
  sections: DepartureDeltaBriefSections;
  posture: ReadinessPostureDelta;
  summary: string;
  warnings: string[];
  readiness: DepartureDeltaBriefReadiness;
};

const EMPTY_SECTIONS: DepartureDeltaBriefSections = {
  newBlockers: [],
  resolvedBlockers: [],
  staleInputs: [],
  changedVehicleLoadoutValues: [],
  offlinePackageRegressions: [],
  campConfidenceChanges: [],
};

function cloneEmptySections(): DepartureDeltaBriefSections {
  return {
    newBlockers: [],
    resolvedBlockers: [],
    staleInputs: [],
    changedVehicleLoadoutValues: [],
    offlinePackageRegressions: [],
    campConfidenceChanges: [],
  };
}

function envFlagEnabled(key: string): boolean {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const value = env?.[key];
  return value === '1' || value === 'true' || value === 'TRUE';
}

export function isDepartureDeltaBriefFeatureEnabled(flags?: DepartureDeltaFeatureFlags | null): boolean {
  if (flags?.departureDeltaBrief != null) return flags.departureDeltaBrief === true;
  const globalFlag = (globalThis as { __ECS_DEPARTURE_DELTA_BRIEF__?: unknown }).__ECS_DEPARTURE_DELTA_BRIEF__;
  if (globalFlag != null) return globalFlag === true || globalFlag === '1' || globalFlag === 'true';
  return envFlagEnabled('EXPO_PUBLIC_ECS_DEPARTURE_DELTA_BRIEF') || envFlagEnabled('ECS_DEPARTURE_DELTA_BRIEF');
}

function hasValidTimestamp(value: string | null | undefined): value is string {
  if (!value) return false;
  return Number.isFinite(Date.parse(value));
}

function asScalar(value: unknown): DepartureDeltaScalar {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (value == null) return null;
  return String(value);
}

function normalizePosture(value: DepartureDeltaCurrentReadiness['posture']): DepartureDeltaBriefPosture {
  if (value === 'ready' || value === 'go') return 'go';
  if (value === 'caution') return 'caution';
  return 'hold';
}

function sourceOrUnknown(value: string | null | undefined): string | null {
  return value ?? null;
}

function evidence(args: {
  fieldId: string;
  label: string;
  previousValue: DepartureDeltaScalar;
  previousObservedAt?: string | null;
  previousSource?: string | null;
  previousUnit?: string | null;
  currentValue: DepartureDeltaScalar;
  currentObservedAt?: string | null;
  currentSource?: string | null;
  currentUnit?: string | null;
  comparable?: boolean;
  reason?: string | null;
}): ComparisonEvidence {
  return {
    fieldId: args.fieldId,
    label: args.label,
    previous: {
      value: args.previousValue,
      observedAt: args.previousObservedAt ?? null,
      source: sourceOrUnknown(args.previousSource),
      unit: args.previousUnit ?? null,
    },
    current: {
      value: args.currentValue,
      observedAt: args.currentObservedAt ?? null,
      source: sourceOrUnknown(args.currentSource),
      unit: args.currentUnit ?? null,
    },
    comparable: args.comparable ?? true,
    reason: args.reason ?? null,
  };
}

function isComparableEvidence(nextEvidence: ComparisonEvidence): boolean {
  return (
    nextEvidence.comparable &&
    hasValidTimestamp(nextEvidence.previous.observedAt) &&
    hasValidTimestamp(nextEvidence.current.observedAt)
  );
}

function staleItem(
  id: string,
  label: string,
  summary: string,
  nextEvidence: ComparisonEvidence,
): DeltaItem {
  return {
    id,
    kind: 'stale_input',
    label,
    summary,
    severity: 'unavailable',
    evidence: {
      ...nextEvidence,
      comparable: false,
    },
  };
}

function addStale(
  sections: DepartureDeltaBriefSections,
  seen: Set<string>,
  id: string,
  label: string,
  summary: string,
  nextEvidence: ComparisonEvidence,
): void {
  if (seen.has(id)) return;
  seen.add(id);
  sections.staleInputs.push(staleItem(id, label, summary, nextEvidence));
}

function blockerObservedAt(
  blocker: DepartureDeltaBlocker | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return blocker?.observedAt ?? fallback ?? null;
}

function blockerSeverityRank(severity: DepartureDeltaBlockerSeverity | null | undefined): number {
  if (severity === 'critical') return 3;
  if (severity === 'blocker') return 2;
  if (severity === 'warning') return 1;
  if (severity === 'info') return 0;
  return -1;
}

function blockerTone(severity: DepartureDeltaBlockerSeverity | null | undefined): DepartureDeltaSeverity {
  if (severity === 'critical' || severity === 'blocker') return 'critical';
  if (severity === 'warning') return 'caution';
  if (severity === 'info') return 'info';
  return 'watch';
}

function compareBlockers(
  previousAudit: DepartureDeltaPreviousAuditSnapshot,
  current: DepartureDeltaCurrentContext,
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
): void {
  const previousCapturedAt = previousAudit.capturedAt ?? null;
  const currentReadinessAt = current.readiness.observedAt ?? null;
  const previous = new Map((previousAudit.blockers ?? []).map((item) => [item.id, item]));
  const next = new Map((current.readiness.blockers ?? []).map((item) => [item.id, item]));

  next.forEach((currentBlocker, id) => {
    const previousBlocker = previous.get(id);
    if (!previousBlocker) {
      const nextEvidence = evidence({
        fieldId: `blocker:${id}`,
        label: currentBlocker.label,
        previousValue: 'absent',
        previousObservedAt: previousCapturedAt,
        previousSource: 'previous_departure_audit',
        currentValue: currentBlocker.severity ?? 'unknown',
        currentObservedAt: blockerObservedAt(currentBlocker, currentReadinessAt),
        currentSource: currentBlocker.source ?? current.readiness.source ?? null,
      });
      if (!isComparableEvidence(nextEvidence)) {
        addStale(
          sections,
          staleSeen,
          `stale:blocker:${id}`,
          currentBlocker.label,
          'Blocker was not compared because one side is missing timestamped evidence.',
          nextEvidence,
        );
        return;
      }
      sections.newBlockers.push({
        id: `new-blocker:${id}`,
        kind: 'new_blocker',
        label: currentBlocker.label,
        summary: `New blocker: ${currentBlocker.label}.`,
        severity: blockerTone(currentBlocker.severity),
        evidence: nextEvidence,
      });
      return;
    }

    const previousRank = blockerSeverityRank(previousBlocker.severity);
    const currentRank = blockerSeverityRank(currentBlocker.severity);
    if (previousRank === currentRank) return;

    const nextEvidence = evidence({
      fieldId: `blocker:${id}:severity`,
      label: currentBlocker.label,
      previousValue: previousBlocker.severity ?? 'unknown',
      previousObservedAt: blockerObservedAt(previousBlocker, previousCapturedAt),
      previousSource: previousBlocker.source ?? 'previous_departure_audit',
      currentValue: currentBlocker.severity ?? 'unknown',
      currentObservedAt: blockerObservedAt(currentBlocker, currentReadinessAt),
      currentSource: currentBlocker.source ?? current.readiness.source ?? null,
    });
    if (!isComparableEvidence(nextEvidence)) {
      addStale(
        sections,
        staleSeen,
        `stale:blocker-severity:${id}`,
        currentBlocker.label,
        'Blocker severity was not compared because one side is missing timestamped evidence.',
        nextEvidence,
      );
      return;
    }
    const improved = currentRank < previousRank;
    const item: DeltaItem = {
      id: `severity-change:${id}`,
      kind: 'blocker_severity_changed',
      label: currentBlocker.label,
      summary: `Blocker severity ${improved ? 'improved' : 'worsened'} from ${previousBlocker.severity ?? 'unknown'} to ${currentBlocker.severity ?? 'unknown'}.`,
      severity: improved ? 'watch' : blockerTone(currentBlocker.severity),
      direction: improved ? 'decreased' : 'increased',
      evidence: nextEvidence,
    };
    if (improved) {
      sections.resolvedBlockers.push(item);
    } else {
      sections.newBlockers.push(item);
    }
  });

  previous.forEach((previousBlocker, id) => {
    if (next.has(id)) return;
    const nextEvidence = evidence({
      fieldId: `blocker:${id}`,
      label: previousBlocker.label,
      previousValue: previousBlocker.severity ?? 'unknown',
      previousObservedAt: blockerObservedAt(previousBlocker, previousCapturedAt),
      previousSource: previousBlocker.source ?? 'previous_departure_audit',
      currentValue: 'absent',
      currentObservedAt: currentReadinessAt,
      currentSource: current.readiness.source ?? 'readiness_engine',
    });
    if (!isComparableEvidence(nextEvidence)) {
      addStale(
        sections,
        staleSeen,
        `stale:resolved-blocker:${id}`,
        previousBlocker.label,
        'Resolved blocker was not compared because one side is missing timestamped evidence.',
        nextEvidence,
      );
      return;
    }
    sections.resolvedBlockers.push({
      id: `resolved-blocker:${id}`,
      kind: 'resolved_blocker',
      label: previousBlocker.label,
      summary: `Resolved blocker: ${previousBlocker.label}.`,
      severity: 'watch',
      direction: 'decreased',
      evidence: nextEvidence,
    });
  });
}

function valuesEqual(previousValue: DepartureDeltaScalar, currentValue: DepartureDeltaScalar): boolean {
  return previousValue === currentValue;
}

function compareVehicleLoadoutValues(
  previousAudit: DepartureDeltaPreviousAuditSnapshot,
  current: DepartureDeltaCurrentContext,
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
): void {
  const previousValues = new Map((previousAudit.vehicleLoadoutValues ?? []).map((item) => [item.fieldId, item]));
  (current.vehicleLoadoutValues ?? []).forEach((currentValue) => {
    const previousValue = previousValues.get(currentValue.fieldId);
    if (!previousValue) {
      const nextEvidence = evidence({
        fieldId: currentValue.fieldId,
        label: currentValue.label,
        previousValue: null,
        previousObservedAt: previousAudit.capturedAt ?? null,
        previousSource: 'previous_departure_audit',
        currentValue: asScalar(currentValue.value),
        currentObservedAt: currentValue.observedAt ?? null,
        currentSource: currentValue.source ?? null,
        currentUnit: currentValue.unit ?? null,
        comparable: false,
        reason: 'Field identity was not present in the previous audit.',
      });
      addStale(
        sections,
        staleSeen,
        `stale:${currentValue.fieldId}`,
        currentValue.label,
        'Vehicle/loadout value was not compared because the previous field identity is unavailable.',
        nextEvidence,
      );
      return;
    }
    const nextEvidence = evidence({
      fieldId: currentValue.fieldId,
      label: currentValue.label,
      previousValue: asScalar(previousValue.value),
      previousObservedAt: previousValue.observedAt ?? null,
      previousSource: previousValue.source ?? null,
      previousUnit: previousValue.unit ?? null,
      currentValue: asScalar(currentValue.value),
      currentObservedAt: currentValue.observedAt ?? null,
      currentSource: currentValue.source ?? null,
      currentUnit: currentValue.unit ?? null,
      comparable: previousValue.unit === currentValue.unit,
      reason: previousValue.unit === currentValue.unit ? null : 'Units do not match.',
    });
    if (!isComparableEvidence(nextEvidence)) {
      addStale(
        sections,
        staleSeen,
        `stale:${currentValue.fieldId}`,
        currentValue.label,
        'Vehicle/loadout value was not compared because timestamped comparable evidence is incomplete.',
        nextEvidence,
      );
      return;
    }
    if (valuesEqual(nextEvidence.previous.value, nextEvidence.current.value)) return;
    sections.changedVehicleLoadoutValues.push({
      id: `vehicle-loadout-change:${currentValue.fieldId}`,
      kind: 'vehicle_loadout_changed',
      label: currentValue.label,
      summary: `${currentValue.label} changed from ${nextEvidence.previous.value} to ${nextEvidence.current.value}.`,
      severity: 'watch',
      evidence: nextEvidence,
    });
  });
}

function rankPackageStatus(value: DepartureDeltaOfflineStatus | null | undefined): number {
  if (value === 'ready') return 3;
  if (value === 'partial') return 2;
  if (value === 'missing') return 1;
  if (value === 'unknown') return 0;
  return -1;
}

function rankCoverage(value: DepartureDeltaCoverageStatus | null | undefined): number {
  if (value === 'complete') return 3;
  if (value === 'partial') return 2;
  if (value === 'missing') return 1;
  if (value === 'unknown') return 0;
  return -1;
}

function rankFreshness(value: DepartureDeltaFreshnessStatus | null | undefined): number {
  if (value === 'fresh') return 3;
  if (value === 'stale' || value === 'expired') return 2;
  if (value === 'missing') return 1;
  if (value === 'unknown') return 0;
  return -1;
}

function offlineFieldEvidence(
  fieldId: string,
  label: string,
  previousPackage: DepartureDeltaOfflinePackageStatus,
  currentPackage: DepartureDeltaOfflinePackageStatus,
  previousValue: DepartureDeltaScalar,
  currentValue: DepartureDeltaScalar,
): ComparisonEvidence {
  return evidence({
    fieldId,
    label,
    previousValue,
    previousObservedAt: previousPackage.observedAt ?? null,
    previousSource: previousPackage.source ?? null,
    currentValue,
    currentObservedAt: currentPackage.observedAt ?? null,
    currentSource: currentPackage.source ?? null,
  });
}

function addOfflineRegression(
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
  field: string,
  label: string,
  previousPackage: DepartureDeltaOfflinePackageStatus,
  currentPackage: DepartureDeltaOfflinePackageStatus,
  previousValue: DepartureDeltaScalar,
  currentValue: DepartureDeltaScalar,
  isRegression: boolean,
): void {
  const nextEvidence = offlineFieldEvidence(
    `offline:${field}`,
    label,
    previousPackage,
    currentPackage,
    previousValue,
    currentValue,
  );
  if (!isComparableEvidence(nextEvidence)) {
    addStale(
      sections,
      staleSeen,
      'stale:offline-package',
      'Offline package metadata',
      'Offline package comparison is unavailable because source metadata or timestamps are incomplete.',
      nextEvidence,
    );
    return;
  }
  if (!isRegression) return;
  sections.offlinePackageRegressions.push({
    id: `offline-regression:${field}`,
    kind: 'offline_regression',
    label,
    summary: `${label} regressed from ${previousValue} to ${currentValue}.`,
    severity: 'caution',
    direction: 'decreased',
    evidence: nextEvidence,
  });
}

function compareOfflinePackage(
  previousAudit: DepartureDeltaPreviousAuditSnapshot,
  current: DepartureDeltaCurrentContext,
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
): void {
  const previousPackage = previousAudit.offlinePackage;
  const currentPackage = current.offlinePackage;
  if (!previousPackage || !currentPackage) {
    addStale(
      sections,
      staleSeen,
      'stale:offline-package',
      'Offline package metadata',
      'Offline package comparison is unavailable because one side is missing package metadata.',
      evidence({
        fieldId: 'offline:package',
        label: 'Offline package metadata',
        previousValue: previousPackage ? 'present' : null,
        previousObservedAt: previousPackage?.observedAt ?? previousAudit.capturedAt ?? null,
        previousSource: previousPackage?.source ?? null,
        currentValue: currentPackage ? 'present' : null,
        currentObservedAt: currentPackage?.observedAt ?? null,
        currentSource: currentPackage?.source ?? null,
        comparable: false,
        reason: 'Package metadata is missing.',
      }),
    );
    return;
  }

  addOfflineRegression(
    sections,
    staleSeen,
    'packageStatus',
    'Offline package status',
    previousPackage,
    currentPackage,
    previousPackage.packageStatus ?? 'unknown',
    currentPackage.packageStatus ?? 'unknown',
    rankPackageStatus(currentPackage.packageStatus) < rankPackageStatus(previousPackage.packageStatus),
  );
  addOfflineRegression(
    sections,
    staleSeen,
    'coverage',
    'Offline coverage',
    previousPackage,
    currentPackage,
    previousPackage.coverage ?? 'unknown',
    currentPackage.coverage ?? 'unknown',
    rankCoverage(currentPackage.coverage) < rankCoverage(previousPackage.coverage),
  );
  addOfflineRegression(
    sections,
    staleSeen,
    'freshness',
    'Offline freshness',
    previousPackage,
    currentPackage,
    previousPackage.freshness ?? 'unknown',
    currentPackage.freshness ?? 'unknown',
    rankFreshness(currentPackage.freshness) < rankFreshness(previousPackage.freshness),
  );
  addOfflineRegression(
    sections,
    staleSeen,
    'routeMatch',
    'Offline route match',
    previousPackage,
    currentPackage,
    previousPackage.routeMatch ?? null,
    currentPackage.routeMatch ?? null,
    previousPackage.routeMatch === true && currentPackage.routeMatch === false,
  );
  addOfflineRegression(
    sections,
    staleSeen,
    'cacheCompletenessPct',
    'Offline cache completeness',
    previousPackage,
    currentPackage,
    typeof previousPackage.cacheCompletenessPct === 'number' ? previousPackage.cacheCompletenessPct : null,
    typeof currentPackage.cacheCompletenessPct === 'number' ? currentPackage.cacheCompletenessPct : null,
    typeof previousPackage.cacheCompletenessPct === 'number' &&
      typeof currentPackage.cacheCompletenessPct === 'number' &&
      currentPackage.cacheCompletenessPct < previousPackage.cacheCompletenessPct,
  );
}

function rankConfidence(value: DepartureDeltaConfidence | null | undefined): number {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  if (value === 'unknown') return 0;
  return -1;
}

function compareCampConfidence(
  previousAudit: DepartureDeltaPreviousAuditSnapshot,
  current: DepartureDeltaCurrentContext,
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
): void {
  const previousCamp = previousAudit.campEndpointConfidence;
  const currentCamp = current.campEndpointConfidence;
  const nextEvidence = evidence({
    fieldId: 'camp:confidence',
    label: 'Camp confidence',
    previousValue: previousCamp?.confidence ?? null,
    previousObservedAt: previousCamp?.observedAt ?? null,
    previousSource: previousCamp?.source ?? null,
    currentValue: currentCamp?.confidence ?? null,
    currentObservedAt: currentCamp?.observedAt ?? null,
    currentSource: currentCamp?.source ?? null,
    comparable: Boolean(
      previousCamp?.endpointId &&
      currentCamp?.endpointId &&
      previousCamp.endpointId === currentCamp.endpointId &&
      previousCamp.confidenceScale &&
      currentCamp.confidenceScale &&
      previousCamp.confidenceScale === currentCamp.confidenceScale,
    ),
    reason:
      previousCamp?.endpointId !== currentCamp?.endpointId
        ? 'Endpoint identity changed.'
        : previousCamp?.confidenceScale !== currentCamp?.confidenceScale
          ? 'Confidence scale changed.'
          : null,
  });
  if (!isComparableEvidence(nextEvidence)) {
    addStale(
      sections,
      staleSeen,
      'stale:camp-confidence',
      'Camp confidence',
      'Camp confidence was not compared because endpoint identity, scale, or timestamps are not comparable.',
      nextEvidence,
    );
    return;
  }

  const previousRank = rankConfidence(previousCamp?.confidence);
  const currentRank = rankConfidence(currentCamp?.confidence);
  if (previousRank === currentRank) return;
  const direction: DepartureDeltaDirection = currentRank > previousRank ? 'increased' : 'decreased';
  sections.campConfidenceChanges.push({
    id: `camp-confidence-change:${currentCamp?.endpointId}`,
    kind: 'camp_confidence_changed',
    label: 'Camp confidence',
    summary: `Camp confidence ${direction} from ${previousCamp?.confidence ?? 'unknown'} to ${currentCamp?.confidence ?? 'unknown'}.`,
    severity: direction === 'decreased' ? 'caution' : 'info',
    direction,
    evidence: nextEvidence,
  });
}

function buildPostureDelta(
  previousAudit: DepartureDeltaPreviousAuditSnapshot | null | undefined,
  current: DepartureDeltaCurrentContext,
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
): ReadinessPostureDelta {
  const currentPosture = normalizePosture(current.readiness.posture);
  const previousPosture = previousAudit?.posture?.value ?? null;
  const nextEvidence = evidence({
    fieldId: 'posture',
    label: 'Updated posture',
    previousValue: previousPosture ?? null,
    previousObservedAt: previousAudit?.posture?.observedAt ?? null,
    previousSource: previousAudit?.posture?.source ?? null,
    currentValue: currentPosture,
    currentObservedAt: current.readiness.observedAt ?? null,
    currentSource: current.readiness.source ?? null,
  });

  if (!previousAudit || !previousPosture || !isComparableEvidence(nextEvidence)) {
    addStale(
      sections,
      staleSeen,
      'stale:posture',
      'Updated posture',
      'Current posture is shown, but ECS cannot claim a posture change without timestamped previous posture evidence.',
      {
        ...nextEvidence,
        comparable: false,
      },
    );
    return {
      previous: previousPosture,
      current: currentPosture,
      changed: false,
      evidence: nextEvidence,
      unavailableReason: 'Previous posture evidence is missing or not timestamped.',
    };
  }

  return {
    previous: previousPosture,
    current: currentPosture,
    changed: previousPosture !== currentPosture,
    evidence: nextEvidence,
  };
}

function checkFreshnessStaleInputs(
  previousAudit: DepartureDeltaPreviousAuditSnapshot,
  current: DepartureDeltaCurrentContext,
  nowIso: string,
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
): void {
  const currentWeather = current.weatherFreshness;
  const weatherExpired =
    currentWeather?.status === 'expired' ||
    currentWeather?.status === 'stale' ||
    currentWeather?.status === 'missing' ||
    (hasValidTimestamp(currentWeather?.expiresAt) && Date.parse(currentWeather.expiresAt) <= Date.parse(nowIso));
  if (!currentWeather || weatherExpired || !hasValidTimestamp(currentWeather.observedAt)) {
    addStale(
      sections,
      staleSeen,
      'stale:weather-freshness',
      'Weather freshness',
      'Weather freshness is expired, stale, missing, or lacks timestamped source evidence.',
      evidence({
        fieldId: 'weather:freshness',
        label: 'Weather freshness',
        previousValue: previousAudit.weatherFreshness?.status ?? null,
        previousObservedAt: previousAudit.weatherFreshness?.observedAt ?? null,
        previousSource: previousAudit.weatherFreshness?.source ?? null,
        currentValue: currentWeather?.status ?? null,
        currentObservedAt: currentWeather?.observedAt ?? null,
        currentSource: currentWeather?.source ?? null,
        comparable: false,
        reason: 'Weather freshness is stale or missing.',
      }),
    );
  }

  const currentRoster = current.dispatchRoster;
  if (!currentRoster || currentRoster.status !== 'fresh' || !hasValidTimestamp(currentRoster.observedAt)) {
    addStale(
      sections,
      staleSeen,
      'stale:dispatch-roster',
      'Dispatch roster',
      'Dispatch roster state is stale, missing, or lacks timestamped source evidence.',
      evidence({
        fieldId: 'dispatch:roster',
        label: 'Dispatch roster',
        previousValue: previousAudit.dispatchRoster?.status ?? null,
        previousObservedAt: previousAudit.dispatchRoster?.observedAt ?? null,
        previousSource: previousAudit.dispatchRoster?.source ?? null,
        currentValue: currentRoster?.status ?? null,
        currentObservedAt: currentRoster?.observedAt ?? null,
        currentSource: currentRoster?.source ?? null,
        comparable: false,
        reason: 'Dispatch roster is stale or missing.',
      }),
    );
  }

  if (!current.offlinePackage || !hasValidTimestamp(current.offlinePackage.observedAt)) {
    addStale(
      sections,
      staleSeen,
      'stale:offline-package',
      'Offline package metadata',
      'Offline package metadata is missing or lacks timestamped source evidence.',
      evidence({
        fieldId: 'offline:package',
        label: 'Offline package metadata',
        previousValue: previousAudit.offlinePackage ? 'present' : null,
        previousObservedAt: previousAudit.offlinePackage?.observedAt ?? null,
        previousSource: previousAudit.offlinePackage?.source ?? null,
        currentValue: current.offlinePackage ? 'present' : null,
        currentObservedAt: current.offlinePackage?.observedAt ?? null,
        currentSource: current.offlinePackage?.source ?? null,
        comparable: false,
        reason: 'Offline package metadata is missing.',
      }),
    );
  }
}

function countSections(sections: DepartureDeltaBriefSections): number {
  return (
    sections.newBlockers.length +
    sections.resolvedBlockers.length +
    sections.staleInputs.length +
    sections.changedVehicleLoadoutValues.length +
    sections.offlinePackageRegressions.length +
    sections.campConfidenceChanges.length
  );
}

export function buildDepartureDeltaBriefSummary(
  result: Pick<DepartureDeltaBriefResult, 'enabled' | 'hasComparablePreviousAudit' | 'sections' | 'posture'>,
  _candidateText?: string | null,
): string {
  if (!result.enabled) return 'Departure Delta Brief is disabled behind the feature flag.';
  if (!result.hasComparablePreviousAudit) return 'No comparable previous departure audit available.';
  const sections = result.sections;
  const parts = [
    `Current posture: ${result.posture.current}`,
    `${sections.newBlockers.length} new blocker${sections.newBlockers.length === 1 ? '' : 's'}`,
    `${sections.resolvedBlockers.length} resolved blocker${sections.resolvedBlockers.length === 1 ? '' : 's'}`,
    `${sections.staleInputs.length} stale input${sections.staleInputs.length === 1 ? '' : 's'}`,
  ];
  const changedCount =
    sections.changedVehicleLoadoutValues.length +
    sections.offlinePackageRegressions.length +
    sections.campConfidenceChanges.length;
  if (changedCount > 0) {
    parts.push(`${changedCount} comparable field change${changedCount === 1 ? '' : 's'}`);
  }
  if (countSections(sections) === 0 && !result.posture.changed) {
    parts.push('no comparable changes detected');
  }
  return `${parts.join('; ')}.`;
}

export function buildDepartureDeltaBrief(input: DepartureDeltaBriefInput): DepartureDeltaBriefResult {
  const enabled = isDepartureDeltaBriefFeatureEnabled(input.featureFlags);
  const sections = cloneEmptySections();
  const staleSeen = new Set<string>();
  const posture = buildPostureDelta(input.previousAudit, input.current, sections, staleSeen);

  if (!enabled) {
    return {
      enabled: false,
      hasComparablePreviousAudit: false,
      sections: EMPTY_SECTIONS,
      posture,
      summary: 'Departure Delta Brief is disabled behind the feature flag.',
      warnings: [],
      readiness: 'feature_flagged',
    };
  }

  const previousAudit = input.previousAudit;
  if (!previousAudit || !hasValidTimestamp(previousAudit.capturedAt)) {
    return {
      enabled: true,
      hasComparablePreviousAudit: false,
      sections: cloneEmptySections(),
      posture: {
        ...posture,
        changed: false,
        unavailableReason: 'No comparable previous departure audit available.',
      },
      summary: 'No comparable previous departure audit available.',
      warnings: ['No comparable previous departure audit available.'],
      readiness: 'feature_flagged',
    };
  }

  compareBlockers(previousAudit, input.current, sections, staleSeen);
  compareVehicleLoadoutValues(previousAudit, input.current, sections, staleSeen);
  compareOfflinePackage(previousAudit, input.current, sections, staleSeen);
  compareCampConfidence(previousAudit, input.current, sections, staleSeen);
  checkFreshnessStaleInputs(previousAudit, input.current, input.now ?? new Date().toISOString(), sections, staleSeen);

  const resultWithoutSummary: Omit<DepartureDeltaBriefResult, 'summary'> = {
    enabled: true,
    hasComparablePreviousAudit: true,
    sections,
    posture,
    warnings: sections.staleInputs.map((item) => item.summary),
    readiness: 'feature_flagged',
  };

  return {
    ...resultWithoutSummary,
    summary: buildDepartureDeltaBriefSummary(resultWithoutSummary),
  };
}
