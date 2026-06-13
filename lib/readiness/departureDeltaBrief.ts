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

export type DepartureAuditDomainIdentity = {
  tripId?: string | null;
  expeditionId?: string | null;
  routeId?: string | null;
  vehicleId?: string | null;
  loadoutId?: string | null;
  dispatchRosterId?: string | null;
  auditSchemaVersion?: string | null;
  createdAt?: string | null;
};

export type DepartureDeltaComparisonStatus =
  | 'comparable'
  | 'no_previous_audit'
  | 'missing_domain_identity'
  | 'domain_mismatch'
  | 'schema_unsupported'
  | 'audit_expired'
  | 'audit_from_future'
  | 'invalid_audit_timestamp'
  | 'unavailable';

export type DepartureDeltaDomainMismatch = {
  field:
    | 'tripId'
    | 'expeditionId'
    | 'routeId'
    | 'vehicleId'
    | 'loadoutId'
    | 'dispatchRosterId'
    | 'auditSchemaVersion'
    | 'createdAt';
  previousValue?: string;
  currentValue?: string;
  reason: string;
};

export type ComparisonSourceIdentity = {
  sourceId?: string;
  sourceType:
    | 'previous_departure_audit'
    | 'readiness_engine'
    | 'fleet_state'
    | 'route_state'
    | 'weather_state'
    | 'offline_package'
    | 'camp_endpoint'
    | 'dispatch_roster'
    | 'resource_margin'
    | 'unknown';
  sourceName?: string;
  observedAt?: string;
  generatedAt?: string;
  schemaVersion?: string;
};

export type TimestampedComparisonValue<T extends DepartureDeltaScalar = DepartureDeltaScalar> = {
  value: T;
  observedAt?: string | null;
  source?: string | null;
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
  sourceName?: string | null;
  generatedAt?: string | null;
  schemaVersion?: string | null;
  unit?: string | null;
};

export type ComparisonEvidence = {
  fieldId: string;
  fieldPath: string;
  label: string;
  previous: TimestampedComparisonValue;
  current: TimestampedComparisonValue;
  previousValue?: DepartureDeltaScalar;
  currentValue?: DepartureDeltaScalar;
  previousObservedAt?: string;
  currentObservedAt?: string;
  previousSource: ComparisonSourceIdentity;
  currentSource: ComparisonSourceIdentity;
  comparable: boolean;
  reason?: string | null;
  nonComparableReason?: string;
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
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
  detail?: string | null;
};

export type DepartureDeltaComparableField = {
  fieldId: string;
  label: string;
  value: DepartureDeltaScalar;
  observedAt?: string | null;
  source?: string | null;
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
  sourceName?: string | null;
  generatedAt?: string | null;
  schemaVersion?: string | null;
  unit?: string | null;
};

export type DepartureDeltaOfflinePackageStatus = {
  packageId?: string | null;
  packageStatus?: DepartureDeltaOfflineStatus | null;
  coverage?: DepartureDeltaCoverageStatus | null;
  freshness?: DepartureDeltaFreshnessStatus | null;
  routeMatch?: boolean | null;
  cacheCompletenessPct?: number | null;
  observedAt?: string | null;
  source?: string | null;
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
};

export type DepartureDeltaCampEndpointConfidence = {
  endpointId?: string | null;
  confidence?: DepartureDeltaConfidence | null;
  confidenceScale?: string | null;
  observedAt?: string | null;
  source?: string | null;
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
};

export type DepartureDeltaFreshnessSnapshot = {
  status?: DepartureDeltaFreshnessStatus | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  source?: string | null;
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
};

export type DepartureDeltaRosterSnapshot = {
  rosterId?: string | null;
  status?: 'fresh' | 'stale' | 'missing' | 'unknown' | string | null;
  observedAt?: string | null;
  source?: string | null;
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
};

export type DepartureDeltaMargins = {
  fuel?: DepartureDeltaComparableField | TimestampedComparisonValue<number | string | null> | null;
  water?: DepartureDeltaComparableField | TimestampedComparisonValue<number | string | null> | null;
  power?: DepartureDeltaComparableField | TimestampedComparisonValue<number | string | null> | null;
};

export type DepartureDeltaPreviousAuditSnapshot = {
  auditId?: string | null;
  capturedAt?: string | null;
  auditSchemaVersion?: string | null;
  domainIdentity?: DepartureAuditDomainIdentity | null;
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
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
  freshness?: DepartureDeltaFreshnessStatus | null;
  blockers?: DepartureDeltaBlocker[] | null;
};

export type DepartureDeltaCurrentContext = {
  domainIdentity?: DepartureAuditDomainIdentity | null;
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

export type DepartureDeltaAuditComparison = {
  status: DepartureDeltaComparisonStatus;
  previousAuditId?: string;
  previousAuditCreatedAt?: string;
  currentComparedAt: string;
  identity?: {
    previous: DepartureAuditDomainIdentity;
    current: DepartureAuditDomainIdentity;
  };
  mismatches: DepartureDeltaDomainMismatch[];
  warnings: string[];
};

export type DepartureDeltaBriefResult = {
  enabled: boolean;
  hasComparablePreviousAudit: boolean;
  sections: DepartureDeltaBriefSections;
  posture: ReadinessPostureDelta;
  summary: string;
  warnings: string[];
  readiness: DepartureDeltaBriefReadiness;
  auditComparison: DepartureDeltaAuditComparison;
};

const EMPTY_SECTIONS: DepartureDeltaBriefSections = {
  newBlockers: [],
  resolvedBlockers: [],
  staleInputs: [],
  changedVehicleLoadoutValues: [],
  offlinePackageRegressions: [],
  campConfidenceChanges: [],
};

export const DEFAULT_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSION = 'departure-delta-v1';
export const DEFAULT_DEPARTURE_DELTA_AUDIT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SUPPORTED_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSIONS = new Set([
  DEFAULT_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSION,
]);

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

function sourceTypeFromSource(source: string | null | undefined): ComparisonSourceIdentity['sourceType'] {
  const normalized = String(source ?? '').toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('previous_departure_audit')) return 'previous_departure_audit';
  if (normalized.includes('readiness')) return 'readiness_engine';
  if (normalized.includes('fleet') || normalized.includes('vehicle') || normalized.includes('loadout')) return 'fleet_state';
  if (normalized.includes('route')) return 'route_state';
  if (normalized.includes('weather')) return 'weather_state';
  if (normalized.includes('offline') || normalized.includes('cache')) return 'offline_package';
  if (normalized.includes('camp')) return 'camp_endpoint';
  if (normalized.includes('dispatch') || normalized.includes('roster')) return 'dispatch_roster';
  if (normalized.includes('margin') || normalized.includes('fuel') || normalized.includes('water') || normalized.includes('power')) return 'resource_margin';
  if (normalized === 'manual') return 'resource_margin';
  return 'unknown';
}

function comparisonSourceIdentity(args: {
  fieldPath: string;
  source?: string | null;
  sourceId?: string | null;
  sourceType?: ComparisonSourceIdentity['sourceType'] | null;
  sourceName?: string | null;
  observedAt?: string | null;
  generatedAt?: string | null;
  schemaVersion?: string | null;
}): ComparisonSourceIdentity {
  const sourceType = args.sourceType ?? sourceTypeFromSource(args.source);
  const sourceId = args.sourceId ?? (args.source && sourceType !== 'unknown' ? `${args.source}:${args.fieldPath}` : undefined);
  return {
    sourceType,
    ...(sourceId ? { sourceId } : {}),
    ...(args.sourceName ?? args.source ? { sourceName: args.sourceName ?? args.source ?? undefined } : {}),
    ...(args.observedAt ? { observedAt: args.observedAt } : {}),
    ...(args.generatedAt ? { generatedAt: args.generatedAt } : {}),
    ...(args.schemaVersion ? { schemaVersion: args.schemaVersion } : {}),
  };
}

function hasSourceIdentity(source: ComparisonSourceIdentity): boolean {
  return source.sourceType !== 'unknown' && Boolean(source.sourceId || source.sourceName || source.schemaVersion);
}

function evidence(args: {
  fieldId: string;
  fieldPath?: string;
  label: string;
  previousValue: DepartureDeltaScalar;
  previousObservedAt?: string | null;
  previousSource?: string | null;
  previousSourceId?: string | null;
  previousSourceType?: ComparisonSourceIdentity['sourceType'] | null;
  previousSourceName?: string | null;
  previousGeneratedAt?: string | null;
  previousSchemaVersion?: string | null;
  previousUnit?: string | null;
  currentValue: DepartureDeltaScalar;
  currentObservedAt?: string | null;
  currentSource?: string | null;
  currentSourceId?: string | null;
  currentSourceType?: ComparisonSourceIdentity['sourceType'] | null;
  currentSourceName?: string | null;
  currentGeneratedAt?: string | null;
  currentSchemaVersion?: string | null;
  currentUnit?: string | null;
  comparable?: boolean;
  reason?: string | null;
}): ComparisonEvidence {
  const fieldPath = args.fieldPath ?? args.fieldId;
  const previousSource = comparisonSourceIdentity({
    fieldPath,
    source: args.previousSource,
    sourceId: args.previousSourceId,
    sourceType: args.previousSourceType,
    sourceName: args.previousSourceName,
    observedAt: args.previousObservedAt,
    generatedAt: args.previousGeneratedAt,
    schemaVersion: args.previousSchemaVersion,
  });
  const currentSource = comparisonSourceIdentity({
    fieldPath,
    source: args.currentSource,
    sourceId: args.currentSourceId,
    sourceType: args.currentSourceType,
    sourceName: args.currentSourceName,
    observedAt: args.currentObservedAt,
    generatedAt: args.currentGeneratedAt,
    schemaVersion: args.currentSchemaVersion,
  });
  return {
    fieldId: args.fieldId,
    fieldPath,
    label: args.label,
    previous: {
      value: args.previousValue,
      observedAt: args.previousObservedAt ?? null,
      source: sourceOrUnknown(args.previousSource),
      sourceId: previousSource.sourceId ?? null,
      sourceType: previousSource.sourceType,
      sourceName: previousSource.sourceName ?? null,
      generatedAt: args.previousGeneratedAt ?? null,
      schemaVersion: args.previousSchemaVersion ?? null,
      unit: args.previousUnit ?? null,
    },
    current: {
      value: args.currentValue,
      observedAt: args.currentObservedAt ?? null,
      source: sourceOrUnknown(args.currentSource),
      sourceId: currentSource.sourceId ?? null,
      sourceType: currentSource.sourceType,
      sourceName: currentSource.sourceName ?? null,
      generatedAt: args.currentGeneratedAt ?? null,
      schemaVersion: args.currentSchemaVersion ?? null,
      unit: args.currentUnit ?? null,
    },
    previousValue: args.previousValue,
    currentValue: args.currentValue,
    ...(args.previousObservedAt ? { previousObservedAt: args.previousObservedAt } : {}),
    ...(args.currentObservedAt ? { currentObservedAt: args.currentObservedAt } : {}),
    previousSource,
    currentSource,
    comparable: args.comparable ?? true,
    reason: args.reason ?? null,
    ...(args.reason ? { nonComparableReason: args.reason } : {}),
  };
}

function isComparableEvidence(nextEvidence: ComparisonEvidence): boolean {
  return (
    nextEvidence.comparable &&
    hasValidTimestamp(nextEvidence.previous.observedAt) &&
    hasValidTimestamp(nextEvidence.current.observedAt) &&
    hasSourceIdentity(nextEvidence.previousSource) &&
    hasSourceIdentity(nextEvidence.currentSource)
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

function identityFromPreviousAudit(previousAudit: DepartureDeltaPreviousAuditSnapshot | null | undefined): DepartureAuditDomainIdentity {
  const identity = previousAudit?.domainIdentity ?? {};
  return {
    tripId: identity.tripId ?? undefined,
    expeditionId: identity.expeditionId ?? undefined,
    routeId: identity.routeId ?? undefined,
    vehicleId: identity.vehicleId ?? undefined,
    loadoutId: identity.loadoutId ?? undefined,
    dispatchRosterId: identity.dispatchRosterId ?? undefined,
    auditSchemaVersion: identity.auditSchemaVersion ?? previousAudit?.auditSchemaVersion ?? undefined,
    createdAt: identity.createdAt ?? previousAudit?.capturedAt ?? undefined,
  };
}

function identityFromCurrentContext(current: DepartureDeltaCurrentContext): DepartureAuditDomainIdentity {
  const identity = current.domainIdentity ?? {};
  return {
    tripId: identity.tripId ?? undefined,
    expeditionId: identity.expeditionId ?? undefined,
    routeId: identity.routeId ?? undefined,
    vehicleId: identity.vehicleId ?? undefined,
    loadoutId: identity.loadoutId ?? undefined,
    dispatchRosterId: identity.dispatchRosterId ?? current.dispatchRoster?.rosterId ?? undefined,
    auditSchemaVersion: identity.auditSchemaVersion ?? DEFAULT_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSION,
    createdAt: identity.createdAt ?? current.readiness.observedAt ?? undefined,
  };
}

function identityHasRouteDomain(identity: DepartureAuditDomainIdentity): boolean {
  return Boolean(identity.routeId || identity.tripId || identity.expeditionId);
}

function identityValue(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function mismatch(
  field: DepartureDeltaDomainMismatch['field'],
  previousValue: string | null | undefined,
  currentValue: string | null | undefined,
  reason: string,
): DepartureDeltaDomainMismatch {
  return {
    field,
    ...(previousValue ? { previousValue } : {}),
    ...(currentValue ? { currentValue } : {}),
    reason,
  };
}

function compareIdentityField(
  mismatches: DepartureDeltaDomainMismatch[],
  field: DepartureDeltaDomainMismatch['field'],
  previousValue: string | null | undefined,
  currentValue: string | null | undefined,
  reason: string,
): void {
  if (!previousValue || !currentValue || previousValue === currentValue) return;
  mismatches.push(mismatch(field, previousValue, currentValue, reason));
}

export function classifyDepartureAuditDomain(
  previousAudit: DepartureDeltaPreviousAuditSnapshot | null | undefined,
  currentContext: DepartureDeltaCurrentContext,
  now: string | null | undefined = new Date().toISOString(),
): DepartureDeltaAuditComparison {
  const currentComparedAt = now ?? new Date().toISOString();
  const currentIdentity = identityFromCurrentContext(currentContext);
  if (!previousAudit) {
    return {
      status: 'no_previous_audit',
      currentComparedAt,
      identity: {
        previous: {},
        current: currentIdentity,
      },
      mismatches: [],
      warnings: ['No comparable previous departure audit available.'],
    };
  }

  const previousIdentity = identityFromPreviousAudit(previousAudit);
  const createdAt = previousIdentity.createdAt ?? previousAudit.capturedAt ?? null;
  const createdAtMs = Date.parse(createdAt ?? '');
  const nowMs = Date.parse(currentComparedAt);
  const base: Omit<DepartureDeltaAuditComparison, 'status' | 'warnings'> = {
    ...(previousAudit.auditId ? { previousAuditId: previousAudit.auditId } : {}),
    ...(createdAt ? { previousAuditCreatedAt: createdAt } : {}),
    currentComparedAt,
    identity: {
      previous: previousIdentity,
      current: currentIdentity,
    },
    mismatches: [],
  };

  if (!Number.isFinite(nowMs)) {
    return {
      ...base,
      status: 'unavailable',
      warnings: ['Departure Delta comparison time is unavailable or invalid.'],
    };
  }
  if (!createdAt || !Number.isFinite(createdAtMs)) {
    return {
      ...base,
      status: 'invalid_audit_timestamp',
      mismatches: [mismatch('createdAt', createdAt ?? undefined, undefined, 'Previous audit createdAt/capturedAt timestamp is invalid.')],
      warnings: ['Previous departure audit timestamp is invalid; delta claims are suppressed.'],
    };
  }
  if (createdAtMs > nowMs) {
    return {
      ...base,
      status: 'audit_from_future',
      mismatches: [mismatch('createdAt', createdAt, currentComparedAt, 'Previous audit timestamp is after the current comparison time.')],
      warnings: ['Previous departure audit is from the future; delta claims are suppressed.'],
    };
  }
  if (nowMs - createdAtMs > DEFAULT_DEPARTURE_DELTA_AUDIT_MAX_AGE_MS) {
    return {
      ...base,
      status: 'audit_expired',
      mismatches: [mismatch('createdAt', createdAt, currentComparedAt, 'Previous audit is older than the allowed comparison window.')],
      warnings: ['Previous departure audit is too old to compare; delta claims are suppressed.'],
    };
  }

  const missingFields: DepartureDeltaDomainMismatch[] = [];
  if (!identityHasRouteDomain(previousIdentity) || !identityHasRouteDomain(currentIdentity)) {
    missingFields.push(mismatch('routeId', previousIdentity.routeId, currentIdentity.routeId, 'Route, trip, or expedition identity is required.'));
  }
  if (!previousIdentity.auditSchemaVersion || !currentIdentity.auditSchemaVersion) {
    missingFields.push(mismatch('auditSchemaVersion', previousIdentity.auditSchemaVersion, currentIdentity.auditSchemaVersion, 'Audit schema version is required.'));
  }
  if (missingFields.length > 0) {
    return {
      ...base,
      status: 'missing_domain_identity',
      mismatches: missingFields,
      warnings: ['Previous departure audit is missing required domain identity; delta claims are suppressed.'],
    };
  }

  if (
    !SUPPORTED_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSIONS.has(String(previousIdentity.auditSchemaVersion)) ||
    !SUPPORTED_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSIONS.has(String(currentIdentity.auditSchemaVersion))
  ) {
    return {
      ...base,
      status: 'schema_unsupported',
      mismatches: [mismatch('auditSchemaVersion', previousIdentity.auditSchemaVersion, currentIdentity.auditSchemaVersion, 'Audit schema version is unsupported.')],
      warnings: ['Previous departure audit schema is unsupported; delta claims are suppressed.'],
    };
  }

  const globalMismatches: DepartureDeltaDomainMismatch[] = [];
  compareIdentityField(globalMismatches, 'tripId', previousIdentity.tripId, currentIdentity.tripId, 'Previous audit belongs to a different trip.');
  compareIdentityField(globalMismatches, 'expeditionId', previousIdentity.expeditionId, currentIdentity.expeditionId, 'Previous audit belongs to a different expedition.');
  compareIdentityField(globalMismatches, 'routeId', previousIdentity.routeId, currentIdentity.routeId, 'Previous audit belongs to a different route.');
  compareIdentityField(globalMismatches, 'auditSchemaVersion', previousIdentity.auditSchemaVersion, currentIdentity.auditSchemaVersion, 'Audit schema versions differ.');
  if (globalMismatches.length > 0) {
    return {
      ...base,
      status: 'domain_mismatch',
      mismatches: globalMismatches,
      warnings: ['Previous departure audit domain does not match the current route/trip context; delta claims are suppressed.'],
    };
  }

  const sectionMismatches: DepartureDeltaDomainMismatch[] = [];
  compareIdentityField(sectionMismatches, 'vehicleId', previousIdentity.vehicleId, currentIdentity.vehicleId, 'Vehicle identity differs; vehicle/loadout values are not comparable.');
  compareIdentityField(sectionMismatches, 'loadoutId', previousIdentity.loadoutId, currentIdentity.loadoutId, 'Loadout identity differs; loadout values are not comparable.');
  compareIdentityField(sectionMismatches, 'dispatchRosterId', previousIdentity.dispatchRosterId, currentIdentity.dispatchRosterId, 'Dispatch roster identity differs; roster state is not comparable.');

  return {
    ...base,
    status: 'comparable',
    mismatches: sectionMismatches,
    warnings: sectionMismatches.map((item) => item.reason),
  };
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

function currentReadinessIsFresh(current: DepartureDeltaCurrentContext): boolean {
  const freshness = current.readiness.freshness;
  return (
    hasValidTimestamp(current.readiness.observedAt) &&
    Boolean(current.readiness.source || current.readiness.sourceId) &&
    freshness !== 'stale' &&
    freshness !== 'expired' &&
    freshness !== 'missing'
  );
}

function previousAuditSourceId(previousAudit: DepartureDeltaPreviousAuditSnapshot): string | undefined {
  return previousAudit.auditId ?? undefined;
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
        previousSourceId: previousAuditSourceId(previousAudit),
        previousSourceType: 'previous_departure_audit',
        previousSchemaVersion: previousAudit.domainIdentity?.auditSchemaVersion ?? previousAudit.auditSchemaVersion ?? undefined,
        currentValue: currentBlocker.severity ?? 'unknown',
        currentObservedAt: blockerObservedAt(currentBlocker, currentReadinessAt),
        currentSource: currentBlocker.source ?? current.readiness.source ?? null,
        currentSourceId: currentBlocker.sourceId ?? current.readiness.sourceId ?? undefined,
        currentSourceType: currentBlocker.sourceType ?? current.readiness.sourceType ?? undefined,
      });
      if (!isComparableEvidence(nextEvidence)) {
        addStale(
          sections,
          staleSeen,
          `stale:blocker:${id}`,
          currentBlocker.label,
          'Blocker was not compared because one side is missing timestamped source identity.',
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
      previousSourceId: previousBlocker.sourceId ?? previousAuditSourceId(previousAudit),
      previousSourceType: previousBlocker.sourceType ?? undefined,
      currentValue: currentBlocker.severity ?? 'unknown',
      currentObservedAt: blockerObservedAt(currentBlocker, currentReadinessAt),
      currentSource: currentBlocker.source ?? current.readiness.source ?? null,
      currentSourceId: currentBlocker.sourceId ?? current.readiness.sourceId ?? undefined,
      currentSourceType: currentBlocker.sourceType ?? current.readiness.sourceType ?? undefined,
    });
    if (!isComparableEvidence(nextEvidence)) {
      addStale(
        sections,
        staleSeen,
        `stale:blocker-severity:${id}`,
        currentBlocker.label,
        'Blocker severity was not compared because one side is missing timestamped source identity.',
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
      previousSourceId: previousBlocker.sourceId ?? previousAuditSourceId(previousAudit),
      previousSourceType: previousBlocker.sourceType ?? undefined,
      currentValue: 'absent',
      currentObservedAt: currentReadinessAt,
      currentSource: current.readiness.source ?? 'readiness_engine',
      currentSourceId: current.readiness.sourceId ?? undefined,
      currentSourceType: current.readiness.sourceType ?? 'readiness_engine',
      comparable: currentReadinessIsFresh(current),
      reason: currentReadinessIsFresh(current) ? null : 'Current readiness evidence is stale or unavailable.',
    });
    if (!isComparableEvidence(nextEvidence)) {
      addStale(
        sections,
        staleSeen,
        `stale:resolved-blocker:${id}`,
        previousBlocker.label,
        'Resolved blocker was not compared because current readiness evidence is stale or unavailable.',
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

function comparisonMismatch(
  auditComparison: DepartureDeltaAuditComparison,
  field: DepartureDeltaDomainMismatch['field'],
): DepartureDeltaDomainMismatch | undefined {
  return auditComparison.mismatches.find((item) => item.field === field);
}

function addDomainMismatchStale(
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
  mismatchItem: DepartureDeltaDomainMismatch,
  label: string,
): void {
  addStale(
    sections,
    staleSeen,
    `stale:domain:${mismatchItem.field}`,
    label,
    `${mismatchItem.field} mismatch: ${mismatchItem.reason}`,
    evidence({
      fieldId: `domain:${mismatchItem.field}`,
      label,
      previousValue: mismatchItem.previousValue ?? null,
      previousObservedAt: null,
      previousSource: 'previous_departure_audit',
      previousSourceType: 'previous_departure_audit',
      currentValue: mismatchItem.currentValue ?? null,
      currentObservedAt: null,
      currentSource: 'readiness_engine',
      currentSourceType: 'readiness_engine',
      comparable: false,
      reason: mismatchItem.reason,
    }),
  );
}

function compareVehicleLoadoutValues(
  previousAudit: DepartureDeltaPreviousAuditSnapshot,
  current: DepartureDeltaCurrentContext,
  sections: DepartureDeltaBriefSections,
  staleSeen: Set<string>,
  auditComparison: DepartureDeltaAuditComparison,
): void {
  const vehicleMismatch = comparisonMismatch(auditComparison, 'vehicleId');
  const loadoutMismatch = comparisonMismatch(auditComparison, 'loadoutId');
  if (vehicleMismatch) {
    addDomainMismatchStale(sections, staleSeen, vehicleMismatch, 'Vehicle identity');
    return;
  }
  if (loadoutMismatch) {
    addDomainMismatchStale(sections, staleSeen, loadoutMismatch, 'Loadout identity');
  }

  const previousValues = new Map((previousAudit.vehicleLoadoutValues ?? []).map((item) => [item.fieldId, item]));
  (current.vehicleLoadoutValues ?? []).forEach((currentValue) => {
    const isLoadoutField = currentValue.fieldId.startsWith('loadout:');
    if (loadoutMismatch && isLoadoutField) return;

    const previousValue = previousValues.get(currentValue.fieldId);
    if (!previousValue) {
      const nextEvidence = evidence({
        fieldId: currentValue.fieldId,
        label: currentValue.label,
        previousValue: null,
        previousObservedAt: previousAudit.capturedAt ?? null,
        previousSource: 'previous_departure_audit',
        previousSourceId: previousAuditSourceId(previousAudit),
        previousSourceType: 'previous_departure_audit',
        currentValue: asScalar(currentValue.value),
        currentObservedAt: currentValue.observedAt ?? null,
        currentSource: currentValue.source ?? null,
        currentSourceId: currentValue.sourceId ?? undefined,
        currentSourceType: currentValue.sourceType ?? undefined,
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
      previousSourceId: previousValue.sourceId ?? undefined,
      previousSourceType: previousValue.sourceType ?? undefined,
      previousUnit: previousValue.unit ?? null,
      currentValue: asScalar(currentValue.value),
      currentObservedAt: currentValue.observedAt ?? null,
      currentSource: currentValue.source ?? null,
      currentSourceId: currentValue.sourceId ?? undefined,
      currentSourceType: currentValue.sourceType ?? undefined,
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
        'Vehicle/loadout value was not compared because timestamped source identity is incomplete.',
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
    previousSourceId: previousPackage.sourceId ?? previousPackage.packageId ?? undefined,
    previousSourceType: previousPackage.sourceType ?? 'offline_package',
    currentValue,
    currentObservedAt: currentPackage.observedAt ?? null,
    currentSource: currentPackage.source ?? null,
    currentSourceId: currentPackage.sourceId ?? currentPackage.packageId ?? undefined,
    currentSourceType: currentPackage.sourceType ?? 'offline_package',
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
      'Offline package comparison is unavailable because source identity or timestamps are incomplete.',
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
        previousSource: previousPackage?.source ?? 'previous_departure_audit',
        previousSourceId: previousPackage?.sourceId ?? previousPackage?.packageId ?? previousAuditSourceId(previousAudit),
        previousSourceType: previousPackage?.sourceType ?? 'previous_departure_audit',
        currentValue: currentPackage ? 'present' : null,
        currentObservedAt: currentPackage?.observedAt ?? null,
        currentSource: currentPackage?.source ?? null,
        currentSourceId: currentPackage?.sourceId ?? currentPackage?.packageId ?? undefined,
        currentSourceType: currentPackage?.sourceType ?? 'offline_package',
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
  const endpointMatches = Boolean(
    previousCamp?.endpointId &&
    currentCamp?.endpointId &&
    previousCamp.endpointId === currentCamp.endpointId,
  );
  const scaleMatches = Boolean(
    previousCamp?.confidenceScale &&
    currentCamp?.confidenceScale &&
    previousCamp.confidenceScale === currentCamp.confidenceScale,
  );
  const nextEvidence = evidence({
    fieldId: 'camp:confidence',
    label: 'Camp confidence',
    previousValue: previousCamp?.confidence ?? null,
    previousObservedAt: previousCamp?.observedAt ?? null,
    previousSource: previousCamp?.source ?? null,
    previousSourceId: previousCamp?.sourceId ?? previousCamp?.endpointId ?? undefined,
    previousSourceType: previousCamp?.sourceType ?? 'camp_endpoint',
    previousSchemaVersion: previousCamp?.confidenceScale ?? undefined,
    currentValue: currentCamp?.confidence ?? null,
    currentObservedAt: currentCamp?.observedAt ?? null,
    currentSource: currentCamp?.source ?? null,
    currentSourceId: currentCamp?.sourceId ?? currentCamp?.endpointId ?? undefined,
    currentSourceType: currentCamp?.sourceType ?? 'camp_endpoint',
    currentSchemaVersion: currentCamp?.confidenceScale ?? undefined,
    comparable: endpointMatches && scaleMatches,
    reason:
      !endpointMatches
        ? 'Endpoint identity changed.'
        : !scaleMatches
          ? 'Confidence scale changed.'
          : null,
  });
  if (!isComparableEvidence(nextEvidence)) {
    addStale(
      sections,
      staleSeen,
      'stale:camp-confidence',
      'Camp confidence',
      'Camp confidence was not compared because endpoint identity, scale, source identity, or timestamps are not comparable.',
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
    previousSourceId: previousAudit?.posture?.sourceId ?? previousAudit?.auditId ?? undefined,
    previousSourceType: previousAudit?.posture?.sourceType ?? undefined,
    currentValue: currentPosture,
    currentObservedAt: current.readiness.observedAt ?? null,
    currentSource: current.readiness.source ?? null,
    currentSourceId: current.readiness.sourceId ?? undefined,
    currentSourceType: current.readiness.sourceType ?? undefined,
  });

  if (!previousAudit || !previousPosture || !isComparableEvidence(nextEvidence)) {
    addStale(
      sections,
      staleSeen,
      'stale:posture',
      'Updated posture',
      'Current posture is shown, but ECS cannot claim a posture change without timestamped previous posture source identity.',
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
      unavailableReason: 'Previous posture evidence is missing, not timestamped, or lacks source identity.',
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
  auditComparison: DepartureDeltaAuditComparison,
): void {
  const rosterMismatch = comparisonMismatch(auditComparison, 'dispatchRosterId');
  if (rosterMismatch) {
    addDomainMismatchStale(sections, staleSeen, rosterMismatch, 'Dispatch roster');
  }

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
        previousSourceId: previousAudit.weatherFreshness?.sourceId ?? undefined,
        previousSourceType: previousAudit.weatherFreshness?.sourceType ?? 'weather_state',
        currentValue: currentWeather?.status ?? null,
        currentObservedAt: currentWeather?.observedAt ?? null,
        currentSource: currentWeather?.source ?? null,
        currentSourceId: currentWeather?.sourceId ?? undefined,
        currentSourceType: currentWeather?.sourceType ?? 'weather_state',
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
        previousSourceId: previousAudit.dispatchRoster?.sourceId ?? previousAudit.dispatchRoster?.rosterId ?? undefined,
        previousSourceType: previousAudit.dispatchRoster?.sourceType ?? 'dispatch_roster',
        currentValue: currentRoster?.status ?? null,
        currentObservedAt: currentRoster?.observedAt ?? null,
        currentSource: currentRoster?.source ?? null,
        currentSourceId: currentRoster?.sourceId ?? currentRoster?.rosterId ?? undefined,
        currentSourceType: currentRoster?.sourceType ?? 'dispatch_roster',
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
        previousSourceId: previousAudit.offlinePackage?.sourceId ?? previousAudit.offlinePackage?.packageId ?? undefined,
        previousSourceType: previousAudit.offlinePackage?.sourceType ?? 'offline_package',
        currentValue: current.offlinePackage ? 'present' : null,
        currentObservedAt: current.offlinePackage?.observedAt ?? null,
        currentSource: current.offlinePackage?.source ?? null,
        currentSourceId: current.offlinePackage?.sourceId ?? current.offlinePackage?.packageId ?? undefined,
        currentSourceType: current.offlinePackage?.sourceType ?? 'offline_package',
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
  result: Pick<DepartureDeltaBriefResult, 'enabled' | 'hasComparablePreviousAudit' | 'sections' | 'posture' | 'auditComparison'>,
  _candidateText?: string | null,
): string {
  if (!result.enabled) return 'Departure Delta Brief is disabled behind the feature flag.';
  if (!result.hasComparablePreviousAudit) {
    if (result.auditComparison.status === 'no_previous_audit') return 'No comparable previous departure audit available.';
    const warning = result.auditComparison.warnings[0] ? ` ${result.auditComparison.warnings[0]}` : '';
    return `Departure Delta comparison unavailable: ${result.auditComparison.status}.${warning}`;
  }
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

function currentOnlyPosture(current: DepartureDeltaCurrentContext, unavailableReason: string): ReadinessPostureDelta {
  return {
    previous: null,
    current: normalizePosture(current.readiness.posture),
    changed: false,
    unavailableReason,
  };
}

function auditComparisonStaleItem(
  auditComparison: DepartureDeltaAuditComparison,
  previousAudit: DepartureDeltaPreviousAuditSnapshot | null | undefined,
  current: DepartureDeltaCurrentContext,
): DeltaItem {
  const mismatchSummary = auditComparison.mismatches.length > 0
    ? auditComparison.mismatches.map((item) => `${item.field}: ${item.reason}`).join(' ')
    : auditComparison.warnings[0] ?? 'Departure audit comparison is unavailable.';
  return staleItem(
    `stale:audit-comparison:${auditComparison.status}`,
    'Previous departure audit',
    mismatchSummary,
    evidence({
      fieldId: `auditComparison:${auditComparison.status}`,
      label: 'Previous departure audit',
      previousValue: previousAudit?.auditId ?? null,
      previousObservedAt: previousAudit?.capturedAt ?? auditComparison.previousAuditCreatedAt ?? null,
      previousSource: 'previous_departure_audit',
      previousSourceId: previousAudit?.auditId ?? undefined,
      previousSourceType: 'previous_departure_audit',
      previousSchemaVersion: previousAudit?.domainIdentity?.auditSchemaVersion ?? previousAudit?.auditSchemaVersion ?? undefined,
      currentValue: auditComparison.status,
      currentObservedAt: current.readiness.observedAt ?? auditComparison.currentComparedAt,
      currentSource: current.readiness.source ?? 'readiness_engine',
      currentSourceId: current.readiness.sourceId ?? undefined,
      currentSourceType: current.readiness.sourceType ?? 'readiness_engine',
      comparable: false,
      reason: mismatchSummary,
    }),
  );
}

export function buildDepartureDeltaBrief(input: DepartureDeltaBriefInput): DepartureDeltaBriefResult {
  const enabled = isDepartureDeltaBriefFeatureEnabled(input.featureFlags);
  const nowIso = input.now ?? new Date().toISOString();
  const auditComparison = enabled
    ? classifyDepartureAuditDomain(input.previousAudit, input.current, nowIso)
    : {
        status: 'unavailable' as const,
        currentComparedAt: nowIso,
        mismatches: [],
        warnings: ['Departure Delta Brief is disabled behind the feature flag.'],
      };

  if (!enabled) {
    const resultWithoutSummary: Omit<DepartureDeltaBriefResult, 'summary'> = {
      enabled: false,
      hasComparablePreviousAudit: false,
      sections: EMPTY_SECTIONS,
      posture: currentOnlyPosture(input.current, 'Departure Delta Brief is disabled behind the feature flag.'),
      warnings: [],
      readiness: 'feature_flagged',
      auditComparison,
    };
    return {
      ...resultWithoutSummary,
      summary: buildDepartureDeltaBriefSummary(resultWithoutSummary),
    };
  }

  if (auditComparison.status !== 'comparable') {
    const sections = cloneEmptySections();
    if (auditComparison.status !== 'no_previous_audit') {
      sections.staleInputs.push(auditComparisonStaleItem(auditComparison, input.previousAudit, input.current));
    }
    const resultWithoutSummary: Omit<DepartureDeltaBriefResult, 'summary'> = {
      enabled: true,
      hasComparablePreviousAudit: false,
      sections,
      posture: currentOnlyPosture(input.current, auditComparison.warnings[0] ?? 'No comparable previous departure audit available.'),
      warnings: auditComparison.warnings,
      readiness: 'feature_flagged',
      auditComparison,
    };
    return {
      ...resultWithoutSummary,
      summary: buildDepartureDeltaBriefSummary(resultWithoutSummary),
    };
  }

  const previousAudit = input.previousAudit;
  if (!previousAudit) {
    const resultWithoutSummary: Omit<DepartureDeltaBriefResult, 'summary'> = {
      enabled: true,
      hasComparablePreviousAudit: false,
      sections: cloneEmptySections(),
      posture: currentOnlyPosture(input.current, 'No comparable previous departure audit available.'),
      warnings: ['No comparable previous departure audit available.'],
      readiness: 'feature_flagged',
      auditComparison,
    };
    return {
      ...resultWithoutSummary,
      summary: buildDepartureDeltaBriefSummary(resultWithoutSummary),
    };
  }

  const sections = cloneEmptySections();
  const staleSeen = new Set<string>();
  const posture = buildPostureDelta(previousAudit, input.current, sections, staleSeen);

  compareBlockers(previousAudit, input.current, sections, staleSeen);
  compareVehicleLoadoutValues(previousAudit, input.current, sections, staleSeen, auditComparison);
  compareOfflinePackage(previousAudit, input.current, sections, staleSeen);
  compareCampConfidence(previousAudit, input.current, sections, staleSeen);
  checkFreshnessStaleInputs(previousAudit, input.current, nowIso, sections, staleSeen, auditComparison);

  const resultWithoutSummary: Omit<DepartureDeltaBriefResult, 'summary'> = {
    enabled: true,
    hasComparablePreviousAudit: true,
    sections,
    posture,
    warnings: [
      ...auditComparison.warnings,
      ...sections.staleInputs.map((item) => item.summary),
    ],
    readiness: 'feature_flagged',
    auditComparison,
  };

  return {
    ...resultWithoutSummary,
    summary: buildDepartureDeltaBriefSummary(resultWithoutSummary),
  };
}
