import type {
  CampAccessRestrictionStatus,
  CampCandidate,
  CampOpsConfidence,
  CampOpsDataSource,
  CampOpsRestrictionWindow,
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

export const CAMP_OPS_CLOSURE_PROVIDER_ID = 'campops.fixture_closure';

export type CampOpsClosureStatusInput = 'open' | 'closed' | 'seasonal' | 'restricted' | 'unknown';

export type CampOpsClosureRecord = {
  candidateId?: string | null;
  providerId?: string | null;
  providerDisplayName?: string | null;
  source: CampOpsDataSource;
  closureStatus: CampOpsClosureStatusInput;
  closureReason?: string | null;
  restrictionWindow?: CampOpsRestrictionWindow | null;
  appliesToCamping?: boolean | null;
  appliesToVehicleAccess?: boolean | null;
  appliesToFires?: boolean | null;
  sourceConfidence: CampOpsConfidence;
  observedAtIso?: string | null;
  staleAfterMinutes?: number | null;
  sourceSummary?: string | null;
  rawProviderStatus?: CampOpsProviderRawStatus;
  warnings?: string[];
  missingDataReason?: string | null;
};

export type CampOpsClosureSourceProviderOptions = {
  id?: string;
  displayName?: string;
  sourceConfidence?: CampOpsConfidence;
  staleAfterMinutes?: number | null;
  records?: CampOpsClosureRecord[];
  recordsByCandidateId?: Record<string, CampOpsClosureRecord | undefined>;
};

function isWithinRestrictionWindow(
  currentTimeIso: string,
  window: CampOpsRestrictionWindow | null | undefined,
): boolean | null {
  if (!window?.startIso && !window?.endIso) return null;
  const currentMs = Date.parse(currentTimeIso);
  if (!Number.isFinite(currentMs)) return null;
  const startMs = window.startIso ? Date.parse(window.startIso) : Number.NEGATIVE_INFINITY;
  const endMs = window.endIso ? Date.parse(window.endIso) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(startMs) && startMs !== Number.NEGATIVE_INFINITY) return null;
  if (!Number.isFinite(endMs) && endMs !== Number.POSITIVE_INFINITY) return null;
  return currentMs >= startMs && currentMs <= endMs;
}

function normalizedClosureStatus(record: CampOpsClosureRecord): CampAccessRestrictionStatus {
  if (record.closureStatus === 'closed') return 'closed';
  if (record.closureStatus === 'seasonal') return 'seasonal';
  if (record.closureStatus === 'restricted') return 'restricted';
  if (record.closureStatus === 'open') {
    return record.sourceConfidence === 'high' || record.sourceConfidence === 'medium' ? 'open' : 'unknown';
  }
  return 'unknown';
}

function sourceFreshness(
  record: CampOpsClosureRecord,
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

function safeSummary(record: CampOpsClosureRecord): string {
  return record.sourceSummary || [
    `closure ${record.closureStatus}`,
    record.closureReason ? `reason ${record.closureReason}` : null,
    record.restrictionWindow?.label ? `window ${record.restrictionWindow.label}` : null,
  ].filter(Boolean).join('; ');
}

export function campOpsClosureRecordToSourceSignal(
  record: CampOpsClosureRecord,
  options: { stale?: boolean; inactiveWindow?: boolean } = {},
): CampOpsExternalSourceSignal {
  const sourceSummary = safeSummary(record);
  const stale = options.stale === true;
  const inactiveWindow = options.inactiveWindow === true;
  const closureStatus = stale
    ? 'unknown'
    : inactiveWindow && (record.sourceConfidence === 'high' || record.sourceConfidence === 'medium')
      ? 'open'
      : normalizedClosureStatus(record);
  return {
    source: record.source,
    confidence: stale ? 'low' : record.sourceConfidence,
    observedAtIso: record.observedAtIso ?? null,
    staleAfterMinutes: record.staleAfterMinutes ?? null,
    closureStatus,
    closureReason: record.closureReason ?? null,
    restrictionWindow: record.restrictionWindow ?? null,
    closureAppliesToCamping: record.appliesToCamping ?? null,
    closureAppliesToVehicleAccess: record.appliesToVehicleAccess ?? null,
    closureAppliesToFires: record.appliesToFires ?? null,
    dataLimitations: [
      `Closure source: ${sourceSummary}`,
      ...(record.restrictionWindow
        ? [`Restriction window: ${record.restrictionWindow.label ?? 'specified window'}`]
        : []),
      ...(inactiveWindow ? ['Restriction window is not active at the CampOps evaluation time.'] : []),
      ...(stale ? [`Stale closure source retained as uncertainty, not confirmed ${record.closureStatus}.`] : []),
      ...(record.missingDataReason ? [record.missingDataReason] : []),
    ],
  };
}

function recordForCandidate(
  candidate: CampCandidate,
  options: CampOpsClosureSourceProviderOptions,
): CampOpsClosureRecord | null {
  return options.recordsByCandidateId?.[candidate.id] ?? options.records?.find((record) => record.candidateId === candidate.id) ?? null;
}

export class CampOpsClosureSourceProvider implements CampOpsSourceProvider {
  readonly id: string;
  readonly displayName: string;
  readonly sourceCategory = 'closure' as const;
  readonly sourceConfidence: CampOpsConfidence;
  readonly staleAfterMinutes?: number | null;

  constructor(private readonly options: CampOpsClosureSourceProviderOptions = {}) {
    this.id = options.id ?? CAMP_OPS_CLOSURE_PROVIDER_ID;
    this.displayName = options.displayName ?? 'CampOps closure fixture provider';
    this.sourceConfidence = options.sourceConfidence ?? 'medium';
    this.staleAfterMinutes = options.staleAfterMinutes ?? 6 * 60;
  }

  collectSignals({ candidates, currentTimeIso }: CampOpsSourceProviderRequest): CampOpsSourceProviderResult[] {
    return candidates.map((candidate) => {
      const record = recordForCandidate(candidate, this.options);
      if (!record) {
        return {
          candidateId: candidate.id,
          providerId: this.id,
          providerDisplayName: this.displayName,
          sourceCategory: 'closure',
          sourceConfidence: this.sourceConfidence,
          sourceFreshness: 'missing',
          sourceTimestampIso: null,
          rawProviderStatus: { status: 'missing' },
          signal: null,
          warnings: [],
          errors: [],
          missingDataReason: 'No closure or seasonal restriction record matched this camp candidate.',
        };
      }

      const freshness = sourceFreshness(record, currentTimeIso, this.staleAfterMinutes);
      const windowActive = isWithinRestrictionWindow(currentTimeIso, record.restrictionWindow);
      const signal = campOpsClosureRecordToSourceSignal(
        {
          ...record,
          staleAfterMinutes: record.staleAfterMinutes ?? this.staleAfterMinutes ?? null,
        },
        { stale: freshness === 'stale', inactiveWindow: windowActive === false },
      );
      return {
        candidateId: candidate.id,
        providerId: record.providerId ?? this.id,
        providerDisplayName: record.providerDisplayName ?? this.displayName,
        sourceCategory: 'closure',
        sourceConfidence: freshness === 'stale' ? 'low' : record.sourceConfidence,
        sourceFreshness: freshness,
        sourceTimestampIso: record.observedAtIso ?? null,
        rawProviderStatus: record.rawProviderStatus ?? {
          closureStatus: record.closureStatus,
          closureReason: record.closureReason ?? null,
          appliesToCamping: record.appliesToCamping ?? null,
          appliesToVehicleAccess: record.appliesToVehicleAccess ?? null,
          appliesToFires: record.appliesToFires ?? null,
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
