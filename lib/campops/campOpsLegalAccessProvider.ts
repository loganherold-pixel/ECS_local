import type {
  CampAccessRestrictionStatus,
  CampCandidate,
  CampLegalStatus,
  CampOpsConfidence,
  CampOpsDataSource,
  CampPublicAccessStatus,
} from './campOpsTypes';
import type {
  CampOpsExternalSourceSignal,
  CampOpsProviderRawStatus,
  CampOpsSourceCategory,
  CampOpsSourceProvider,
  CampOpsSourceProviderRequest,
  CampOpsSourceProviderResult,
  CampOpsSourceFreshness,
} from './campOpsSourceAdapters';
import { isCampOpsSourceSignalStale } from './campOpsSourceAdapters';

export const CAMP_OPS_LEGAL_ACCESS_PROVIDER_ID = 'campops.fixture_legal_access';

export type CampOpsLegalAccessDecision = 'yes' | 'no' | 'likely' | 'unknown';
export type CampOpsAccessDecision = 'yes' | 'no' | 'restricted' | 'unknown';
export type CampOpsLandStatus = 'public' | 'private' | 'mixed' | 'unknown';

export type CampOpsLegalAccessRecord = {
  candidateId?: string | null;
  providerId?: string | null;
  providerDisplayName?: string | null;
  sourceCategory?: Extract<CampOpsSourceCategory, 'legal' | 'access' | 'closure'>;
  source: CampOpsDataSource;
  campingAllowed: CampOpsLegalAccessDecision;
  accessAllowed: CampOpsAccessDecision;
  landStatus: CampOpsLandStatus;
  legalConfidence: CampOpsConfidence;
  restrictionType?: string | null;
  observedAtIso?: string | null;
  staleAfterMinutes?: number | null;
  sourceSummary?: string | null;
  rawProviderStatus?: CampOpsProviderRawStatus;
  warnings?: string[];
  missingDataReason?: string | null;
};

export type CampOpsLegalAccessSourceProviderOptions = {
  id?: string;
  displayName?: string;
  sourceConfidence?: CampOpsConfidence;
  staleAfterMinutes?: number | null;
  records?: CampOpsLegalAccessRecord[];
  recordsByCandidateId?: Record<string, CampOpsLegalAccessRecord | undefined>;
};

function legalStatusFromCampingAllowed(value: CampOpsLegalAccessDecision): CampLegalStatus {
  if (value === 'yes') return 'allowed';
  if (value === 'likely') return 'likely_allowed';
  if (value === 'no') return 'prohibited';
  return 'unknown';
}

function publicAccessFromLandStatus(value: CampOpsLandStatus): CampPublicAccessStatus {
  if (value === 'public') return 'public';
  if (value === 'private') return 'private';
  if (value === 'mixed') return 'permission_required';
  return 'unknown';
}

function closureStatusFromAccess(record: CampOpsLegalAccessRecord): CampAccessRestrictionStatus {
  const restriction = String(record.restrictionType ?? '').toLowerCase();
  if (record.accessAllowed === 'no') return 'closed';
  if (record.accessAllowed === 'restricted') {
    if (restriction.includes('permit')) return 'permit_required';
    return 'restricted';
  }
  if (restriction.includes('closure') || restriction.includes('closed')) return 'closed';
  return record.accessAllowed === 'yes' ? 'open' : 'unknown';
}

function sourceFreshness(
  record: CampOpsLegalAccessRecord,
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

function safeSummary(record: CampOpsLegalAccessRecord): string {
  return record.sourceSummary || [
    `camping ${record.campingAllowed}`,
    `access ${record.accessAllowed}`,
    `land ${record.landStatus}`,
  ].join('; ');
}

export function campOpsLegalAccessRecordToSourceSignal(
  record: CampOpsLegalAccessRecord,
): CampOpsExternalSourceSignal {
  const sourceSummary = safeSummary(record);
  return {
    source: record.source,
    confidence: record.legalConfidence,
    observedAtIso: record.observedAtIso ?? null,
    staleAfterMinutes: record.staleAfterMinutes ?? null,
    legalStatus: legalStatusFromCampingAllowed(record.campingAllowed),
    legalConfidence: record.legalConfidence,
    closureStatus: closureStatusFromAccess(record),
    publicAccessStatus: publicAccessFromLandStatus(record.landStatus),
    dataLimitations: [
      `Legal/access source: ${sourceSummary}`,
      ...(record.restrictionType ? [`Restriction type: ${record.restrictionType}`] : []),
      ...(record.missingDataReason ? [record.missingDataReason] : []),
    ],
  };
}

function recordForCandidate(
  candidate: CampCandidate,
  options: CampOpsLegalAccessSourceProviderOptions,
): CampOpsLegalAccessRecord | null {
  return options.recordsByCandidateId?.[candidate.id] ?? options.records?.find((record) => record.candidateId === candidate.id) ?? null;
}

export class CampOpsLegalAccessSourceProvider implements CampOpsSourceProvider {
  readonly id: string;
  readonly displayName: string;
  readonly sourceCategory = 'legal' as const;
  readonly sourceConfidence: CampOpsConfidence;
  readonly staleAfterMinutes?: number | null;

  constructor(private readonly options: CampOpsLegalAccessSourceProviderOptions = {}) {
    this.id = options.id ?? CAMP_OPS_LEGAL_ACCESS_PROVIDER_ID;
    this.displayName = options.displayName ?? 'CampOps legal/access fixture provider';
    this.sourceConfidence = options.sourceConfidence ?? 'medium';
    this.staleAfterMinutes = options.staleAfterMinutes ?? 30 * 24 * 60;
  }

  collectSignals({ candidates, currentTimeIso }: CampOpsSourceProviderRequest): CampOpsSourceProviderResult[] {
    return candidates.map((candidate) => {
      const record = recordForCandidate(candidate, this.options);
      if (!record) {
        return {
          candidateId: candidate.id,
          providerId: this.id,
          providerDisplayName: this.displayName,
          sourceCategory: 'legal',
          sourceConfidence: this.sourceConfidence,
          sourceFreshness: 'missing',
          sourceTimestampIso: null,
          rawProviderStatus: { status: 'missing' },
          signal: null,
          warnings: [],
          errors: [],
          missingDataReason: 'No legal/access record matched this camp candidate.',
        };
      }

      const signal = campOpsLegalAccessRecordToSourceSignal({
        ...record,
        staleAfterMinutes: record.staleAfterMinutes ?? this.staleAfterMinutes ?? null,
      });
      return {
        candidateId: candidate.id,
        providerId: record.providerId ?? this.id,
        providerDisplayName: record.providerDisplayName ?? this.displayName,
        sourceCategory: record.sourceCategory ?? 'legal',
        sourceConfidence: record.legalConfidence,
        sourceFreshness: sourceFreshness(record, currentTimeIso, this.staleAfterMinutes),
        sourceTimestampIso: record.observedAtIso ?? null,
        rawProviderStatus: record.rawProviderStatus ?? {
          campingAllowed: record.campingAllowed,
          accessAllowed: record.accessAllowed,
          landStatus: record.landStatus,
          restrictionType: record.restrictionType ?? null,
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
