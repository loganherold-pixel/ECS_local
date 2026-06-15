import type { ExpeditionOpportunity } from '../discoverEngine';

export type ExploreLiveConfidenceSource =
  | 'catalog_verification'
  | 'route_metadata'
  | 'recommendation'
  | 'legacy_label'
  | 'unavailable';

export type ExploreLiveConfidence = {
  score: number | null;
  label: string;
  source: ExploreLiveConfidenceSource;
  reasons: string[];
  state: 'live' | 'estimated' | 'stale' | 'missing';
};

type ConfidenceRoute = Partial<ExpeditionOpportunity> & {
  recommendationConfidence?: { score?: unknown; reasons?: unknown };
  aiConfidence?: unknown;
  confidence?: unknown;
  routeMetadata?: Record<string, unknown> | null;
};

type CoordinateCountResult = {
  pointCount: number;
  segmentCount: number;
};

type FreshnessCounts = {
  fresh: number;
  aging: number;
  stale: number;
  missing: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed <= 1 ? parsed * 100 : parsed)));
    }
  }
  return null;
}

function uniqueLimited(values: unknown[], max = 5): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= max) break;
  }
  return output;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (clean === 'true' || clean === 'yes') return true;
    if (clean === 'false' || clean === 'no') return false;
  }
  return null;
}

function countArrayCoordinate(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    return 1;
  }
  return value.reduce((sum, entry) => sum + countArrayCoordinate(entry), 0);
}

function countObjectCoordinate(value: unknown): number {
  const candidate = record(value);
  if (Object.keys(candidate).length === 0) return 0;
  const lat = candidate.lat ?? candidate.latitude ?? candidate.y;
  const lng = candidate.lng ?? candidate.lon ?? candidate.longitude ?? candidate.x;
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) return 1;
  return 0;
}

function countCoordinates(value: unknown): CoordinateCountResult {
  if (!value) return { pointCount: 0, segmentCount: 0 };
  if (Array.isArray(value)) {
    const pointCount = countArrayCoordinate(value);
    return { pointCount, segmentCount: pointCount > 1 ? 1 : 0 };
  }

  const geometry = record(value);
  if (Object.keys(geometry).length === 0) {
    return { pointCount: 0, segmentCount: 0 };
  }

  if (countObjectCoordinate(geometry) > 0) {
    return { pointCount: 1, segmentCount: 0 };
  }

  const coordinates = geometry.coordinates ?? geometry.points ?? geometry.path ?? geometry.polyline;
  if (coordinates) {
    if (geometry.type === 'MultiLineString' && Array.isArray(coordinates)) {
      const segments = coordinates
        .map((segment) => countArrayCoordinate(segment))
        .filter((count) => count > 1);
      return {
        pointCount: segments.reduce((sum, count) => sum + count, 0),
        segmentCount: segments.length,
      };
    }

    const pointCount = countArrayCoordinate(coordinates);
    return { pointCount, segmentCount: pointCount > 1 ? 1 : 0 };
  }

  if (Array.isArray(geometry.segments)) {
    return geometry.segments.reduce(
      (sum, segment) => {
        const counted = countCoordinates(segment);
        return {
          pointCount: sum.pointCount + counted.pointCount,
          segmentCount: sum.segmentCount + counted.segmentCount,
        };
      },
      { pointCount: 0, segmentCount: 0 },
    );
  }

  return { pointCount: 0, segmentCount: 0 };
}

function routeGeometryStats(route: ConfidenceRoute, metadata: Record<string, unknown>): CoordinateCountResult {
  const routeRecord = route as Record<string, unknown>;
  const candidates = [
    routeRecord.routeGeometry,
    routeRecord.trailGeometry,
    routeRecord.geometry,
    routeRecord.polyline,
    metadata.routeGeometry,
    metadata.trailGeometry,
    metadata.geometry,
    metadata.polyline,
  ];
  return candidates.reduce<CoordinateCountResult>(
    (best, candidate) => {
      const counted = countCoordinates(candidate);
      return counted.pointCount > best.pointCount ? counted : best;
    },
    { pointCount: 0, segmentCount: 0 },
  );
}

function activeGuidanceRecord(route: ConfidenceRoute, metadata: Record<string, unknown>, catalogVerification: Record<string, unknown>): Record<string, unknown> {
  const routeRecord = route as Record<string, unknown>;
  return record(
    routeRecord.activeGuidance ??
      metadata.activeGuidance ??
      catalogVerification.activeGuidance ??
      record(routeRecord.communitySignal ?? metadata.communitySignal).activeGuidance,
  );
}

function freshnessCounts(catalogVerification: Record<string, unknown>, metadata: Record<string, unknown>): FreshnessCounts {
  const dataUsed = [
    ...normalizeRecordArray(catalogVerification.dataUsed),
    ...normalizeRecordArray(metadata.dataUsed),
  ];
  return dataUsed.reduce<FreshnessCounts>(
    (counts, source) => {
      const freshness = String(source.freshness ?? source.state ?? source.sourceState ?? '').toLowerCase();
      if (/fresh|current|live/.test(freshness)) counts.fresh += 1;
      else if (/aging|aged/.test(freshness)) counts.aging += 1;
      else if (/stale|expired/.test(freshness)) counts.stale += 1;
      else if (/missing|unknown/.test(freshness)) counts.missing += 1;
      return counts;
    },
    { fresh: 0, aging: 0, stale: 0, missing: 0 },
  );
}

function normalizeRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => {
        return !!entry && typeof entry === 'object' && !Array.isArray(entry);
      })
    : [];
}

function geometryModifier(route: ConfidenceRoute, metadata: Record<string, unknown>): number {
  const { pointCount } = routeGeometryStats(route, metadata);
  const distanceMiles = readNumber(route.distanceMiles, metadata.distanceMiles) ?? 0;
  const density = distanceMiles > 0 ? pointCount / Math.max(1, distanceMiles) : pointCount;
  let modifier = 0;

  if (pointCount >= 20) modifier += 3;
  else if (pointCount >= 8) modifier += 2;
  else if (pointCount >= 2) modifier -= 2;
  else modifier -= 16;

  if (distanceMiles >= 80 && pointCount < 10) modifier -= 5;
  if (distanceMiles >= 30 && pointCount <= 3) modifier -= 7;
  if (density > 0 && density < 0.08) modifier -= 5;
  else if (density > 0 && density < 0.15) modifier -= 3;

  return modifier;
}

function activeGuidanceModifier(activeGuidance: Record<string, unknown>): number {
  const status = String(activeGuidance.status ?? '').toLowerCase();
  const topologyResolved = readBoolean(activeGuidance.topologyResolved) === true;
  const joinedGapCount = readNumber(activeGuidance.joinedSegmentGapCount) ?? 0;
  const disjointGapCount = readNumber(activeGuidance.disjointSegmentGapCount) ?? 0;
  const maxJoinGapMeters = readNumber(activeGuidance.maxJoinGapMeters) ?? 0;
  const branchDetected = readBoolean(activeGuidance.branchDetected) === true;
  let modifier = 0;

  if (status === 'ready') modifier += topologyResolved ? 3 : 1;
  else if (status === 'preview_only') modifier -= 10;
  else if (status === 'unavailable') modifier -= 18;

  modifier -= Math.min(8, Math.max(0, joinedGapCount) * 2);
  modifier -= Math.min(16, Math.max(0, disjointGapCount) * 4);
  if (maxJoinGapMeters > 30) modifier -= 2;
  if (maxJoinGapMeters > 100) modifier -= 3;
  if (branchDetected && !topologyResolved) modifier -= 2;

  return modifier;
}

function verificationModifier(
  route: ConfidenceRoute,
  metadata: Record<string, unknown>,
  catalogVerification: Record<string, unknown>,
): number {
  const warnings = [
    ...normalizeStringArray(metadata.warnings),
    ...normalizeStringArray(catalogVerification.warnings),
  ];
  const blockers = [
    ...normalizeStringArray(metadata.blockers),
    ...normalizeStringArray(catalogVerification.blockers),
  ];
  const currentCondition = record(catalogVerification.currentCondition ?? metadata.currentCondition);
  const conditionWarnings = normalizeStringArray(currentCondition.warnings);
  const conditionBlockers = normalizeStringArray(currentCondition.blockers);
  const activeClosureCount = readNumber(currentCondition.activeClosureCount) ?? 0;
  const conditionStatus = String(currentCondition.status ?? '').toLowerCase();
  const freshness = freshnessCounts(catalogVerification, metadata);
  const publicRecommendation = readBoolean(catalogVerification.publicRecommendation);
  const communitySignal = record((route as Record<string, unknown>).communitySignal ?? metadata.communitySignal);
  const completionCount = readNumber(
    communitySignal.completions,
    communitySignal.completionCount,
    (route as Record<string, unknown>).completionCount,
    metadata.completionCount,
  ) ?? 0;
  const positiveCount = readNumber(
    communitySignal.positiveReports,
    communitySignal.positiveFeedbackCount,
    (route as Record<string, unknown>).positiveFeedbackCount,
    metadata.positiveFeedbackCount,
  ) ?? 0;
  const independentConfirmations = readNumber(communitySignal.independentConfirmations) ?? 0;
  let modifier = 0;

  modifier += Math.min(4, freshness.fresh * 2);
  modifier -= Math.min(6, freshness.aging * 2);
  modifier -= Math.min(12, freshness.stale * 5);
  modifier -= Math.min(8, freshness.missing * 3);
  modifier -= Math.min(12, warnings.length * 4);
  modifier -= Math.min(36, blockers.length * 18);
  modifier -= Math.min(9, conditionWarnings.length * 3);
  modifier -= Math.min(24, conditionBlockers.length * 12);
  modifier -= Math.min(30, Math.max(0, activeClosureCount) * 20);

  if (conditionStatus === 'clear') modifier += 2;
  else if (conditionStatus === 'watch') modifier -= 4;
  else if (conditionStatus === 'blocked') modifier -= 20;

  if (publicRecommendation === true) modifier += 2;
  if (publicRecommendation === false) modifier -= 12;
  modifier += Math.min(4, Math.max(0, completionCount) + Math.max(0, positiveCount) * 0.5 + Math.max(0, independentConfirmations) * 2);

  return modifier;
}

function routeComplexityModifier(route: ConfidenceRoute, metadata: Record<string, unknown>): number {
  const terrainDifficulty = readNumber(route.terrainDifficulty, metadata.terrainDifficulty) ?? 0;
  const remotenessScore = readNumber(route.remotenessScore, metadata.remotenessScore) ?? 0;
  const { pointCount } = routeGeometryStats(route, metadata);
  let modifier = 0;

  if (terrainDifficulty >= 8) modifier -= 3;
  else if (terrainDifficulty >= 6) modifier -= 1;
  if (remotenessScore >= 9) modifier -= 2;
  else if (remotenessScore >= 7) modifier -= 1;
  if ((terrainDifficulty >= 7 || remotenessScore >= 8) && pointCount < 8) modifier -= 4;

  return modifier;
}

function routeModeModifier(route: ConfidenceRoute, metadata: Record<string, unknown>, catalogVerification: Record<string, unknown>): number {
  const routeRecord = route as Record<string, unknown>;
  const routeGeometryMode = String(
    routeRecord.routeGeometryMode ??
      metadata.routeGeometryMode ??
      catalogVerification.routeGeometryMode ??
      '',
  ).toLowerCase();
  const geometrySource = String(metadata.geometrySource ?? catalogVerification.geometrySource ?? '').toLowerCase();

  if (routeGeometryMode === 'full' || routeGeometryMode === 'stitched') return 1;
  if (geometrySource.includes('stitched')) return 1;
  if (routeGeometryMode === 'preview_simplified') return -10;
  if (routeGeometryMode === 'omitted') return -16;
  return 0;
}

function deriveRouteSpecificScore(
  route: ConfidenceRoute,
  baseScore: number,
  metadata: Record<string, unknown>,
  catalogVerification: Record<string, unknown>,
  state: ExploreLiveConfidence['state'],
): number {
  const activeGuidance = activeGuidanceRecord(route, metadata, catalogVerification);
  let score =
    baseScore +
    geometryModifier(route, metadata) +
    activeGuidanceModifier(activeGuidance) +
    verificationModifier(route, metadata, catalogVerification) +
    routeComplexityModifier(route, metadata) +
    routeModeModifier(route, metadata, catalogVerification);

  if (state === 'stale') score = Math.min(score, 72);
  if (state === 'estimated') score = Math.min(score, 86);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function labelForScore(score: number | null): string {
  if (score == null) return 'Confidence unavailable';
  if (score >= 85) return 'High confidence';
  if (score >= 60) return 'Medium confidence';
  return 'Low confidence';
}

function stateFromMetadata(metadata: Record<string, unknown>): ExploreLiveConfidence['state'] {
  const searchable = [
    metadata.dataState,
    metadata.trailPackDataState,
    metadata.sourceState,
    metadata.freshness,
    record(metadata.catalogVerification).dataState,
    record(metadata.catalogVerification).freshness,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/stale|aging|expired/.test(searchable)) return 'stale';
  if (/mock|fixture|estimated|manual|cached/.test(searchable)) return 'estimated';
  return 'live';
}

function legacyLabelScore(value: unknown): number | null {
  const label = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (label === 'high') return 88;
  if (label === 'good') return 76;
  if (label === 'explore') return 62;
  return null;
}

export function deriveExploreLiveConfidence(route: ConfidenceRoute | null | undefined): ExploreLiveConfidence {
  if (!route) {
    return {
      score: null,
      label: 'Confidence unavailable',
      source: 'unavailable',
      reasons: ['Route confidence source missing'],
      state: 'missing',
    };
  }

  const metadata = record(route.routeMetadata);
  const catalogVerification = record(metadata.catalogVerification);
  const recommendation = record(route.recommendationConfidence);
  const candidates: Array<{
    score: number | null;
    source: ExploreLiveConfidenceSource;
  }> = [
    {
      score: finiteScore(catalogVerification.confidenceScore ?? catalogVerification.confidence),
      source: 'catalog_verification',
    },
    {
      score: finiteScore(
        metadata.confidenceScore ??
          metadata.routeConfidenceScore ??
          metadata.sourceConfidenceScore ??
          metadata.confidence,
      ),
      source: 'route_metadata',
    },
    {
      score: finiteScore(recommendation.score),
      source: 'recommendation',
    },
    {
      score: legacyLabelScore(route.aiConfidence ?? (typeof route.confidence === 'string' ? route.confidence : null)),
      source: 'legacy_label',
    },
  ];
  const selected = candidates.find((candidate) => candidate.score != null) ?? null;
  const state = selected ? stateFromMetadata(metadata) : 'missing';
  const cappedScore =
    selected?.score != null
      ? deriveRouteSpecificScore(route, selected.score, metadata, catalogVerification, state)
      : null;
  const reasons = uniqueLimited([
    ...normalizeStringArray(catalogVerification.confidenceReasons),
    ...normalizeStringArray(metadata.confidenceReasons),
    ...normalizeStringArray(recommendation.reasons),
    catalogVerification.sourceLabel,
    selected?.source === 'route_metadata' ? 'Route metadata confidence' : null,
  ]);

  return {
    score: cappedScore,
    label: labelForScore(cappedScore),
    source: selected?.source ?? 'unavailable',
    reasons: reasons.length > 0 ? reasons : ['Confidence source unavailable'],
    state,
  };
}
