import type {
  CampAccessRestrictionStatus,
  CampFireRestrictionStatus,
  CampFireUseDecision,
  CampImpactLevel,
  CampOpsConfidence,
  CampOpsDataSource,
  CampOpsRiskLevel,
} from './campOpsTypes';
import type {
  CampOpsExternalSourceSignal,
  CampOpsProviderRawStatus,
  CampOpsSourceProvider,
  CampOpsSourceProviderRequest,
  CampOpsSourceProviderResult,
  CampOpsSourceFreshness,
} from './campOpsSourceAdapters';
import { isCampOpsSourceSignalStale } from './campOpsSourceAdapters';
import type { CampCandidate } from './campOpsTypes';

export const CAMP_OPS_FIRE_RESTRICTION_PROVIDER_ID = 'campops.fixture_fire_restriction';

export type CampOpsFireRestrictionRecord = {
  candidateId?: string | null;
  providerId?: string | null;
  providerDisplayName?: string | null;
  source: CampOpsDataSource;
  campfireAllowed: CampFireUseDecision;
  stoveAllowed: CampFireUseDecision;
  fireRestrictionLevel?: string | null;
  redFlagRisk: CampOpsRiskLevel;
  smokeOrAirQualityRisk?: CampOpsRiskLevel | null;
  areaClosedDueToFire?: boolean | null;
  closureReason?: string | null;
  sourceConfidence: CampOpsConfidence;
  observedAtIso?: string | null;
  staleAfterMinutes?: number | null;
  sourceSummary?: string | null;
  rawProviderStatus?: CampOpsProviderRawStatus;
  warnings?: string[];
  missingDataReason?: string | null;
};

export type CampOpsFireRestrictionSourceProviderOptions = {
  id?: string;
  displayName?: string;
  sourceConfidence?: CampOpsConfidence;
  staleAfterMinutes?: number | null;
  records?: CampOpsFireRestrictionRecord[];
  recordsByCandidateId?: Record<string, CampOpsFireRestrictionRecord | undefined>;
};

function sourceFreshness(
  record: CampOpsFireRestrictionRecord,
  currentTimeIso: string,
  fallbackStaleAfterMinutes: number | null | undefined,
): CampOpsSourceFreshness {
  if (!record.observedAtIso) return record.missingDataReason ? 'missing' : 'unknown';
  const staleAfterMinutes = record.staleAfterMinutes ?? fallbackStaleAfterMinutes ?? null;
  return isCampOpsSourceSignalStale(
    { observedAtIso: record.observedAtIso, staleAfterMinutes },
    currentTimeIso,
  ) ? 'stale' : 'fresh';
}

function fireRestrictionStatus(record: CampOpsFireRestrictionRecord): CampFireRestrictionStatus {
  if (record.areaClosedDueToFire === true) return 'fire_ban';
  if (record.campfireAllowed === 'no') return 'fire_ban';
  if (
    record.campfireAllowed === 'restricted' ||
    record.stoveAllowed === 'no' ||
    record.stoveAllowed === 'restricted'
  ) {
    return 'restricted';
  }
  if (record.redFlagRisk === 'high' || record.redFlagRisk === 'medium') return 'restrictions_possible';
  if (
    record.campfireAllowed === 'yes' &&
    record.stoveAllowed === 'yes' &&
    (record.redFlagRisk === 'low' || record.redFlagRisk === 'unknown')
  ) {
    return 'none_known';
  }
  return 'unknown';
}

function weatherExposure(record: CampOpsFireRestrictionRecord): CampImpactLevel {
  if (record.areaClosedDueToFire === true) return 'critical';
  if (record.smokeOrAirQualityRisk === 'high' || record.redFlagRisk === 'high') return 'critical';
  if (record.smokeOrAirQualityRisk === 'medium' || record.redFlagRisk === 'medium') return 'caution';
  if (record.smokeOrAirQualityRisk === 'low' || record.redFlagRisk === 'low') return 'watch';
  return 'unknown';
}

function closureStatus(record: CampOpsFireRestrictionRecord): CampAccessRestrictionStatus | null {
  return record.areaClosedDueToFire === true ? 'closed' : null;
}

function safeSummary(record: CampOpsFireRestrictionRecord): string {
  return record.sourceSummary || [
    `campfire ${record.campfireAllowed}`,
    `stove ${record.stoveAllowed}`,
    `red flag ${record.redFlagRisk}`,
    record.smokeOrAirQualityRisk ? `smoke/AQI ${record.smokeOrAirQualityRisk}` : null,
  ].filter(Boolean).join('; ');
}

export function campOpsFireRestrictionRecordToSourceSignal(
  record: CampOpsFireRestrictionRecord,
  options: { stale?: boolean } = {},
): CampOpsExternalSourceSignal {
  const stale = options.stale === true;
  const summary = safeSummary(record);
  const normalizedFireStatus = stale ? 'unknown' : fireRestrictionStatus(record);
  const normalizedClosureStatus = stale ? null : closureStatus(record);
  return {
    source: record.source,
    confidence: stale ? 'low' : record.sourceConfidence,
    observedAtIso: record.observedAtIso ?? null,
    staleAfterMinutes: record.staleAfterMinutes ?? null,
    closureStatus: normalizedClosureStatus,
    closureReason: normalizedClosureStatus === 'closed'
      ? record.closureReason ?? 'Fire or emergency restriction indicates the area is closed.'
      : null,
    closureAppliesToCamping: normalizedClosureStatus === 'closed' ? true : null,
    closureAppliesToVehicleAccess: normalizedClosureStatus === 'closed' ? true : null,
    fireRestrictionStatus: normalizedFireStatus,
    campfireAllowed: stale ? 'unknown' : record.campfireAllowed,
    stoveAllowed: stale ? 'unknown' : record.stoveAllowed,
    fireRestrictionLevel: stale ? null : record.fireRestrictionLevel ?? null,
    redFlagRisk: stale ? 'unknown' : record.redFlagRisk,
    smokeOrAirQualityRisk: stale ? 'unknown' : record.smokeOrAirQualityRisk ?? 'unknown',
    weatherExposure: stale ? 'unknown' : weatherExposure(record),
    emergencyRestrictionConflict: normalizedClosureStatus === 'closed' ? true : null,
    dataLimitations: [
      `Fire restriction source: ${summary}`,
      ...(record.fireRestrictionLevel ? [`Fire restriction level: ${record.fireRestrictionLevel}`] : []),
      ...(stale ? ['Stale fire restriction source retained as uncertainty, not current fire status.'] : []),
      ...(record.missingDataReason ? [record.missingDataReason] : []),
    ],
  };
}

function recordForCandidate(
  candidate: CampCandidate,
  options: CampOpsFireRestrictionSourceProviderOptions,
): CampOpsFireRestrictionRecord | null {
  return options.recordsByCandidateId?.[candidate.id] ?? options.records?.find((record) => record.candidateId === candidate.id) ?? null;
}

export class CampOpsFireRestrictionSourceProvider implements CampOpsSourceProvider {
  readonly id: string;
  readonly displayName: string;
  readonly sourceCategory = 'fire' as const;
  readonly sourceConfidence: CampOpsConfidence;
  readonly staleAfterMinutes?: number | null;

  constructor(private readonly options: CampOpsFireRestrictionSourceProviderOptions = {}) {
    this.id = options.id ?? CAMP_OPS_FIRE_RESTRICTION_PROVIDER_ID;
    this.displayName = options.displayName ?? 'CampOps fire restriction fixture provider';
    this.sourceConfidence = options.sourceConfidence ?? 'medium';
    this.staleAfterMinutes = options.staleAfterMinutes ?? 90;
  }

  collectSignals({ candidates, currentTimeIso }: CampOpsSourceProviderRequest): CampOpsSourceProviderResult[] {
    return candidates.map((candidate) => {
      const record = recordForCandidate(candidate, this.options);
      if (!record) {
        return {
          candidateId: candidate.id,
          providerId: this.id,
          providerDisplayName: this.displayName,
          sourceCategory: 'fire',
          sourceConfidence: this.sourceConfidence,
          sourceFreshness: 'missing',
          sourceTimestampIso: null,
          rawProviderStatus: { status: 'missing' },
          signal: null,
          warnings: [],
          errors: [],
          missingDataReason: 'No fire restriction record matched this camp candidate.',
        };
      }

      const freshness = sourceFreshness(record, currentTimeIso, this.staleAfterMinutes);
      const signal = campOpsFireRestrictionRecordToSourceSignal(
        {
          ...record,
          staleAfterMinutes: record.staleAfterMinutes ?? this.staleAfterMinutes ?? null,
        },
        { stale: freshness === 'stale' },
      );
      return {
        candidateId: candidate.id,
        providerId: record.providerId ?? this.id,
        providerDisplayName: record.providerDisplayName ?? this.displayName,
        sourceCategory: 'fire',
        sourceConfidence: freshness === 'stale' ? 'low' : record.sourceConfidence,
        sourceFreshness: freshness,
        sourceTimestampIso: record.observedAtIso ?? null,
        rawProviderStatus: record.rawProviderStatus ?? {
          campfireAllowed: record.campfireAllowed,
          stoveAllowed: record.stoveAllowed,
          fireRestrictionLevel: record.fireRestrictionLevel ?? null,
          redFlagRisk: record.redFlagRisk,
          smokeOrAirQualityRisk: record.smokeOrAirQualityRisk ?? null,
          areaClosedDueToFire: record.areaClosedDueToFire ?? null,
          sourceSummary: safeSummary(record),
        },
        signal,
        warnings: record.warnings ?? [],
        errors: [],
        missingDataReason: record.missingDataReason ?? null,
      };
    });
  }
}
