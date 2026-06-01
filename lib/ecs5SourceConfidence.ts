import type { ObservationGeometry, SourceObservation } from './ecs5ObservationPipeline';
import type { NormalizedAgencyObservation } from './ecs5AgencyIngestion';

export type SourceConfidenceLabel = 'high' | 'medium' | 'low' | 'unknown';
export type SourceConfidenceDecisionType =
  | 'legal_access'
  | 'closure'
  | 'passability'
  | 'weather'
  | 'smoke_aqi'
  | 'active_fire'
  | 'fire_perimeter'
  | 'incident_context'
  | 'community_condition'
  | 'manual_review'
  | 'unknown';

export interface ConfidenceEvidenceSource {
  id: string;
  providerId?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  recordType?: string | null;
  subjectType?: string | null;
  status?: string | null;
  detail?: string | null;
  observedAt?: string | null;
  publishedAt?: string | null;
  ingestedAt?: string | null;
  expiresAt?: string | null;
  ttlSeconds?: number | null;
  geometry?: ObservationGeometry | null;
  evidenceUrl?: string | null;
  knownLimitations?: string[];
  qualityIssues?: string[];
  official?: boolean;
  jurisdictionKnown?: boolean;
  cached?: boolean;
  stale?: boolean;
  agrees?: boolean | null;
  conflictsWith?: string[];
  manualReviewed?: boolean;
  manualReviewAllowed?: boolean;
  spatialSpecificity?: 'exact' | 'route_segment' | 'area' | 'jurisdiction' | 'unknown';
  temporalSpecificity?: 'active_window' | 'timestamped' | 'dated' | 'seasonal' | 'unknown';
}

export interface SourceConfidenceScore {
  score: number;
  label: SourceConfidenceLabel;
  sourceAuthorityScore: number;
  freshnessScore: number;
  spatialSpecificityScore: number;
  temporalSpecificityScore: number;
  corroborationScore: number;
  conflictPenalty: number;
  dataQualityPenalty: number;
  knownLimitationPenalty: number;
  staleDataPenalty: number;
  manualReviewBoost: number;
  topReasons: string[];
  limitationNotes: string[];
  calculatedAt: string;
  sourceNames: string[];
  timestamps: string[];
  staleWarning?: string | null;
  evidenceObservationIds: string[];
}

export interface SourceConfidenceInput {
  decisionType: SourceConfidenceDecisionType;
  sources: ConfidenceEvidenceSource[];
  now?: Date;
}

export function calculateECS5SourceConfidence(input: SourceConfidenceInput): SourceConfidenceScore {
  const now = input.now ?? new Date();
  const sources = input.sources.filter(Boolean);
  if (sources.length === 0) return emptyConfidence(now);

  const authorityScores = sources.map((source) => authorityScore(input.decisionType, source));
  const freshnessScores = sources.map((source) => freshnessScore(source, now));
  const spatialScores = sources.map(spatialSpecificityScore);
  const temporalScores = sources.map((source) => temporalSpecificityScore(source, now));
  const corroboration = corroborationScore(sources);
  const conflictPenalty = conflictPenaltyScore(sources);
  const dataQualityPenalty = dataQualityPenaltyScore(sources);
  const knownLimitationPenalty = limitationPenaltyScore(sources);
  const staleDataPenalty = stalePenaltyScore(sources, now);
  const manualReviewBoost = manualReviewBoostScore(sources);

  const sourceAuthorityScore = weightedAverage(authorityScores);
  const freshness = weightedAverage(freshnessScores);
  const spatial = weightedAverage(spatialScores);
  const temporal = weightedAverage(temporalScores);

  let score = sources.length > 0 ? 8 : 0;
  score += sourceAuthorityScore * 0.34;
  score += freshness * 0.18;
  score += spatial * 0.12;
  score += temporal * 0.1;
  score += corroboration * 0.12;
  score += manualReviewBoost;
  score -= conflictPenalty;
  score -= dataQualityPenalty;
  score -= knownLimitationPenalty;
  score -= staleDataPenalty;
  score = clamp(score, 0, 100);

  const limitationNotes = dedupe(sources.flatMap((source) => source.knownLimitations ?? []));
  const staleSources = sources.filter((source) => source.stale === true || freshnessScore(source, now) < 45);
  return {
    score,
    label: confidenceLabel(score),
    sourceAuthorityScore: Math.round(sourceAuthorityScore),
    freshnessScore: Math.round(freshness),
    spatialSpecificityScore: Math.round(spatial),
    temporalSpecificityScore: Math.round(temporal),
    corroborationScore: Math.round(corroboration),
    conflictPenalty,
    dataQualityPenalty,
    knownLimitationPenalty,
    staleDataPenalty,
    manualReviewBoost,
    topReasons: buildTopReasons({
      decisionType: input.decisionType,
      sources,
      sourceAuthorityScore,
      freshness,
      spatial,
      temporal,
      corroboration,
      conflictPenalty,
      dataQualityPenalty,
      knownLimitationPenalty,
      staleDataPenalty,
      manualReviewBoost,
    }),
    limitationNotes,
    calculatedAt: now.toISOString(),
    sourceNames: dedupe(sources.map((source) => source.sourceName ?? source.providerId ?? 'Unknown source')),
    timestamps: dedupe(sources.flatMap((source) => [source.observedAt, source.publishedAt, source.ingestedAt]).filter(Boolean) as string[]),
    staleWarning: staleSources.length > 0
      ? 'One or more sources are stale or cached; verify before relying on this decision operationally.'
      : null,
    evidenceObservationIds: dedupe(sources.map((source) => source.id)),
  };
}

export function sourceConfidenceLabel(score: number | null | undefined): SourceConfidenceLabel {
  if (!score || score <= 0) return 'unknown';
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export function evidenceFromSourceObservation(observation: SourceObservation): ConfidenceEvidenceSource {
  return {
    id: observation.id,
    providerId: observation.providerId,
    sourceName: observation.sourceName,
    sourceType: observation.sourceType,
    subjectType: observation.subjectType,
    observedAt: observation.observedAt,
    publishedAt: observation.publishedAt,
    ingestedAt: observation.ingestedAt,
    expiresAt: observation.expiresAt,
    geometry: observation.geometry,
    evidenceUrl: observation.evidenceUrl,
    knownLimitations: observation.knownLimitations,
    cached: observation.sourceType === 'cached',
    stale: observation.confidenceBreakdown?.stalePenalty > 0,
  };
}

export function evidenceFromAgencyObservation(observation: NormalizedAgencyObservation): ConfidenceEvidenceSource {
  return {
    id: observation.id,
    providerId: observation.providerId,
    sourceName: String(observation.normalizedPayload.title ?? observation.normalizedPayload.roadTrailId ?? observation.providerId),
    sourceType: undefined,
    recordType: observation.recordType,
    status: String(observation.normalizedPayload.status ?? observation.normalizedPayload.legalAccessStatus ?? ''),
    observedAt: observation.observedAt ?? null,
    publishedAt: observation.publishedAt ?? null,
    ingestedAt: observation.ingestedAt,
    expiresAt: observation.expiresAt ?? null,
    geometry: observation.geometry,
    evidenceUrl: observation.evidenceUrl ?? null,
    knownLimitations: observation.knownLimitations,
    cached: false,
    stale: observation.historical === true,
  };
}

function authorityScore(decisionType: SourceConfidenceDecisionType, source: ConfidenceEvidenceSource): number {
  const providerId = String(source.providerId ?? '').toLowerCase();
  const sourceType = String(source.sourceType ?? '').toLowerCase();
  const recordType = String(source.recordType ?? source.subjectType ?? '').toLowerCase();
  const text = `${source.status ?? ''} ${source.detail ?? ''}`.toLowerCase();

  if (providerId === 'manual_agency_ingestion' || sourceType === 'manual_admin') {
    if (source.manualReviewed && source.evidenceUrl) return 76;
    if (source.evidenceUrl) return 62;
    return 42;
  }
  if (providerId === 'community' || sourceType === 'community_report') {
    return decisionType === 'passability' || decisionType === 'community_condition' ? 55 : 12;
  }
  if (decisionType === 'closure' && (recordType === 'closure' || /closure|closed|order/.test(text))) {
    if (providerId === 'nps') return 92;
    if (providerId === 'state_dot_511') return 90;
    if (source.official || sourceType.includes('agency') || sourceType.includes('official')) return 94;
  }
  if (providerId === 'usfs_mvum') return decisionType === 'legal_access' ? 90 : decisionType === 'passability' ? 30 : 58;
  if (providerId === 'blm_plad') return decisionType === 'legal_access' ? 88 : decisionType === 'passability' ? 30 : 56;
  if (providerId === 'nws') return decisionType === 'weather' ? 94 : decisionType === 'closure' ? 10 : 74;
  if (providerId === 'openweather_onecall') return decisionType === 'weather' ? 78 : decisionType === 'closure' || decisionType === 'legal_access' ? 0 : 55;
  if (providerId === 'airnow') return decisionType === 'smoke_aqi' ? 90 : decisionType === 'closure' || decisionType === 'legal_access' ? 0 : 60;
  if (providerId === 'nasa_firms') return decisionType === 'active_fire' ? 88 : decisionType === 'closure' || decisionType === 'legal_access' ? 0 : 64;
  if (providerId === 'nifc_wfigs') return decisionType === 'fire_perimeter' ? 92 : decisionType === 'closure' ? 20 : 72;
  if (providerId === 'inciweb') {
    if (decisionType === 'incident_context') return 84;
    if (decisionType === 'closure' && /closure|order|closed/.test(text) && source.evidenceUrl) return 72;
    return 62;
  }
  if (source.official || sourceType.includes('official') || sourceType.includes('agency')) return 72;
  return 30;
}

function freshnessScore(source: ConfidenceEvidenceSource, now: Date): number {
  if (source.stale === true || source.cached === true) return 35;
  const expiresAt = parseTime(source.expiresAt);
  if (expiresAt != null && expiresAt <= now.getTime()) return 15;
  const timestamp = parseTime(source.observedAt ?? source.publishedAt ?? source.ingestedAt);
  if (timestamp == null) return 45;
  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  const ttlHours = Math.max(1, (source.ttlSeconds ?? 86_400) / 3600);
  if (ageHours <= ttlHours) return 92;
  if (ageHours <= ttlHours * 2) return 68;
  if (ageHours <= ttlHours * 7) return 38;
  return 18;
}

function spatialSpecificityScore(source: ConfidenceEvidenceSource): number {
  if (source.spatialSpecificity === 'exact') return 95;
  if (source.spatialSpecificity === 'route_segment') return 86;
  if (source.spatialSpecificity === 'area') return 70;
  if (source.spatialSpecificity === 'jurisdiction') return 48;
  if (!source.geometry) return source.jurisdictionKnown === false ? 25 : 42;
  if (source.geometry.type === 'Point') return 94;
  if (source.geometry.type === 'LineString') return 86;
  if (source.geometry.type === 'Polygon' || source.geometry.type === 'MultiPolygon') return 78;
  return 55;
}

function temporalSpecificityScore(source: ConfidenceEvidenceSource, now: Date): number {
  if (source.temporalSpecificity === 'active_window') return 94;
  if (source.temporalSpecificity === 'timestamped') return 84;
  if (source.temporalSpecificity === 'dated') return 68;
  if (source.temporalSpecificity === 'seasonal') return 58;
  const expires = parseTime(source.expiresAt);
  const observed = parseTime(source.observedAt ?? source.publishedAt);
  if (expires != null && expires > now.getTime()) return 90;
  if (observed != null) return 76;
  return 42;
}

function corroborationScore(sources: ConfidenceEvidenceSource[]): number {
  const available = sources.filter((source) => source.agrees !== false);
  const providers = new Set(available.map((source) => source.providerId ?? source.sourceName ?? source.id));
  if (providers.size >= 3) return 92;
  if (providers.size === 2) return 78;
  if (providers.size === 1) return 54;
  return 30;
}

function conflictPenaltyScore(sources: ConfidenceEvidenceSource[]): number {
  let penalty = 0;
  penalty += sources.filter((source) => source.agrees === false).length * 12;
  penalty += sources.reduce((sum, source) => sum + (source.conflictsWith?.length ?? 0) * 8, 0);
  return clamp(penalty, 0, 38);
}

function dataQualityPenaltyScore(sources: ConfidenceEvidenceSource[]): number {
  let penalty = 0;
  penalty += sources.filter((source) => source.jurisdictionKnown === false).length * 10;
  penalty += sources.reduce((sum, source) => sum + (source.qualityIssues?.length ?? 0) * 6, 0);
  penalty += sources.filter((source) => !source.evidenceUrl && source.providerId === 'manual_agency_ingestion').length * 8;
  return clamp(penalty, 0, 30);
}

function limitationPenaltyScore(sources: ConfidenceEvidenceSource[]): number {
  const limitations = dedupe(sources.flatMap((source) => source.knownLimitations ?? []));
  const meaningful = limitations.filter((limitation) =>
    /not_|preliminary|delayed|not_legal|not_closure|passability|false_positive|closure_language|living_dataset/i.test(limitation));
  return clamp(meaningful.length * 3, 0, 24);
}

function stalePenaltyScore(sources: ConfidenceEvidenceSource[], now: Date): number {
  return clamp(sources.filter((source) => source.stale === true || source.cached === true || freshnessScore(source, now) < 45).length * 10, 0, 30);
}

function manualReviewBoostScore(sources: ConfidenceEvidenceSource[]): number {
  return clamp(sources.filter((source) => source.manualReviewed === true && source.manualReviewAllowed !== false).length * 8, 0, 12);
}

function buildTopReasons(input: {
  decisionType: SourceConfidenceDecisionType;
  sources: ConfidenceEvidenceSource[];
  sourceAuthorityScore: number;
  freshness: number;
  spatial: number;
  temporal: number;
  corroboration: number;
  conflictPenalty: number;
  dataQualityPenalty: number;
  knownLimitationPenalty: number;
  staleDataPenalty: number;
  manualReviewBoost: number;
}): string[] {
  return dedupe([
    input.sourceAuthorityScore >= 85 ? 'High-authority source for this decision type.' : null,
    input.sourceAuthorityScore <= 35 ? 'Source has limited authority for this decision type.' : null,
    input.freshness < 45 ? 'Freshness is reduced by stale, cached, or expired data.' : null,
    input.spatial >= 80 ? 'Source is spatially specific to the point, route, or segment.' : null,
    input.temporal >= 85 ? 'Source includes an active or explicit time window.' : null,
    input.corroboration >= 78 ? 'Multiple sources corroborate this decision.' : null,
    input.conflictPenalty > 0 ? 'Conflicting evidence reduces confidence.' : null,
    input.dataQualityPenalty > 0 ? 'Data quality or jurisdiction uncertainty reduces confidence.' : null,
    input.knownLimitationPenalty > 0 ? 'Known source limitations reduce confidence.' : null,
    input.staleDataPenalty > 0 ? 'Stale or cached data requires verification.' : null,
    input.manualReviewBoost > 0 ? 'Manual review with an evidence reference improves confidence.' : null,
  ]);
}

function emptyConfidence(now: Date): SourceConfidenceScore {
  return {
    score: 0,
    label: 'unknown',
    sourceAuthorityScore: 0,
    freshnessScore: 0,
    spatialSpecificityScore: 0,
    temporalSpecificityScore: 0,
    corroborationScore: 0,
    conflictPenalty: 0,
    dataQualityPenalty: 0,
    knownLimitationPenalty: 0,
    staleDataPenalty: 0,
    manualReviewBoost: 0,
    topReasons: ['No evidence sources were available.'],
    limitationNotes: [],
    calculatedAt: now.toISOString(),
    sourceNames: [],
    timestamps: [],
    staleWarning: null,
    evidenceObservationIds: [],
  };
}

function confidenceLabel(score: number): SourceConfidenceLabel {
  return sourceConfidenceLabel(score);
}

function weightedAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    output.push(clean);
  }
  return output;
}
