import type { CampHardGateResult } from './campOpsTypes';

export type CampOpsLegacySafetyScoreKey = 'accessConfidence' | 'legalAccess';

export type CampOpsLegacyHardGateSignalsInput = {
  candidate: unknown;
  safetyScores: Partial<Record<CampOpsLegacySafetyScoreKey, number | null>>;
  minimumSafetyScore: number;
};

export type CampOpsLegacyHardGateSignals = {
  rejected: boolean;
  safetyRejectionReasons: string[];
  hardGateResults: CampHardGateResult[];
};

const LEGACY_SAFETY_RESTRICTION_KEYS = [
  'accessType',
  'accessKind',
  'accessClass',
  'accessStatus',
  'legalAccessStatus',
  'legalStatus',
  'campingStatus',
  'closureStatus',
  'landOwnership',
  'landUse',
  'restriction',
  'restrictions',
  'warning',
  'warnings',
  'reason',
  'explanation',
  'category',
];

const LEGACY_SAFETY_RESTRICTION_PATTERNS = [
  /\bprivate(?:\s+property|\s+land)?\b/i,
  /\bno\s+access\b/i,
  /\baccess\s+(?:denied|prohibited|closed|restricted)\b/i,
  /\bclosed\b/i,
  /\bclosure\b/i,
  /\bprohibited\b/i,
  /\bno\s+camp(?:ing)?\b/i,
  /\bcamping\s+(?:prohibited|closed|not\s+allowed)\b/i,
  /\btrespass(?:ing)?\b/i,
  /\billegal\b/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPath(record: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(record, path)) return record[path];
  return path.split('.').reduce<unknown>((cursor, key) => {
    if (!isRecord(cursor)) return undefined;
    return cursor[key];
  }, record);
}

function safetyTextFromValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(safetyTextFromValue).filter(Boolean).join(' ');
  }
  if (!isRecord(value)) return '';
  return LEGACY_SAFETY_RESTRICTION_KEYS
    .map((key) => safetyTextFromValue(value[key]))
    .filter(Boolean)
    .join(' ');
}

function collectLegacySafetyRestrictionText(candidate: unknown): string {
  if (!isRecord(candidate)) return '';
  return LEGACY_SAFETY_RESTRICTION_KEYS
    .map((key) => safetyTextFromValue(readPath(candidate, key)))
    .filter(Boolean)
    .join(' ');
}

export function getLegacyCampSafetyRestrictionReasons(candidate: unknown): string[] {
  const text = collectLegacySafetyRestrictionText(candidate);
  if (!text) return [];
  return LEGACY_SAFETY_RESTRICTION_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

function buildLegacyGate(gateId: string, reason: string): CampHardGateResult {
  return {
    state: 'rejected',
    gateId,
    severity: 'critical',
    reason,
    missingDataFields: [],
  };
}

export function evaluateLegacyCampHardGateSignals({
  candidate,
  safetyScores,
  minimumSafetyScore,
}: CampOpsLegacyHardGateSignalsInput): CampOpsLegacyHardGateSignals {
  const safetyRejectionReasons = getLegacyCampSafetyRestrictionReasons(candidate);
  const hardGateResults: CampHardGateResult[] = safetyRejectionReasons.map((reason) =>
    buildLegacyGate('campops.legacy.access_or_legal_restriction', reason),
  );

  (Object.keys(safetyScores) as CampOpsLegacySafetyScoreKey[]).forEach((key) => {
    const score = safetyScores[key];
    if (score != null && score < minimumSafetyScore) {
      const reason = `${key}<${minimumSafetyScore}`;
      safetyRejectionReasons.push(reason);
      hardGateResults.push(
        buildLegacyGate(
          key === 'legalAccess'
            ? 'campops.legacy.legal_access_score'
            : 'campops.legacy.access_confidence_score',
          reason,
        ),
      );
    }
  });

  return {
    rejected: hardGateResults.length > 0,
    safetyRejectionReasons,
    hardGateResults,
  };
}
