import { normalizeNavigationGuidanceGeometry } from './navigationCatalogGuidanceGeometry';
import type { RouteSegmentSourceMetadata } from './map/dispersedCampingSegmentBuild';

export const ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING =
  'ECS route geometry is planning/reference geometry. Verify access, closures, and posted rules before travel.';

export type RouteGeometryOverlaySourceKind =
  | 'route_catalog'
  | 'trail_pack'
  | 'explore_route'
  | 'saved_route'
  | 'imported_route'
  | 'custom_route'
  | 'recorded_run'
  | 'favorite_trail';

export type RouteGeometryOverlayConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type RouteGeometryOverlayDataState =
  | 'live'
  | 'local'
  | 'cached'
  | 'stale'
  | 'fixture'
  | 'manual'
  | 'estimated'
  | 'unknown';

export type RouteGeometryOverlayCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteGeometryOverlaySegment = {
  id: string;
  name: string;
  kind: 'route_geometry_segment';
  coordinates: RouteGeometryOverlayCoordinate[];
  color: string;
  sourceKind: RouteGeometryOverlaySourceKind;
  sourceId: string;
  sourceLabel: string;
  dataState: RouteGeometryOverlayDataState;
  confidence: RouteGeometryOverlayConfidence;
  warnings: string[];
  routeGeometrySelected: boolean;
  routeGeometrySourceKind: RouteGeometryOverlaySourceKind;
  routeGeometryDataState: RouteGeometryOverlayDataState;
  routeGeometryConfidence: RouteGeometryOverlayConfidence;
  routeGeometryWarningsJson: string;
  sourceMetadata: RouteSegmentSourceMetadata;
};

export type RouteGeometryOverlayBuildResult = {
  segments: RouteGeometryOverlaySegment[];
  candidateCount: number;
  skippedMissingGeometryCount: number;
  cappedCount: number;
  dedupedCount: number;
  sourceCounts: Record<RouteGeometryOverlaySourceKind, number>;
};

export type BuildRouteGeometryOverlaySegmentsInput = {
  trailPacks?: unknown[];
  routeCatalogRecords?: unknown[];
  routes?: unknown[];
  runs?: unknown[];
  savedRouteAssets?: unknown[];
  exploreSegments?: unknown[];
  maxSegments?: number;
  selectedSegmentIds?: string[];
};

type Candidate = {
  sourceKind: RouteGeometryOverlaySourceKind;
  sourceId: string;
  name: string;
  sourceLabel: string;
  dataState: RouteGeometryOverlayDataState;
  confidence: RouteGeometryOverlayConfidence;
  geometry: unknown;
  warnings?: string[];
};

type NormalizedPoint = { lat: number; lng: number };

const DEFAULT_MAX_SEGMENTS = 240;

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readText(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = cleanText(record[key]);
    if (value) return value;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePoint(value: unknown): NormalizedPoint | null {
  const record = readRecord(value);
  const lat = Array.isArray(value)
    ? finiteNumber(value[1])
    : finiteNumber(record?.lat ?? record?.latitude);
  const lng = Array.isArray(value)
    ? finiteNumber(value[0])
    : finiteNumber(record?.lng ?? record?.lon ?? record?.longitude);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function normalizePointLine(value: unknown): NormalizedPoint[] {
  if (!Array.isArray(value)) return [];
  const line: NormalizedPoint[] = [];
  for (const entry of value) {
    const point = normalizePoint(entry);
    if (!point) continue;
    const previous = line[line.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng) continue;
    line.push(point);
  }
  return line;
}

function linesFromNavigationGeometry(value: unknown): NormalizedPoint[][] {
  const resolved = normalizeNavigationGuidanceGeometry(value);
  const segments = resolved.segments
    .map((segment) => normalizePointLine(segment))
    .filter((segment) => segment.length > 1);
  if (segments.length > 0) return segments;
  const points = normalizePointLine(resolved.points);
  return points.length > 1 ? [points] : [];
}

function linesFromRouteSegments(route: Record<string, unknown>): NormalizedPoint[][] {
  const segments = Array.isArray(route.segments) ? route.segments : [];
  return segments
    .map((segment) => normalizePointLine(readRecord(segment)?.points))
    .filter((line) => line.length > 1);
}

function lineToOverlayCoordinates(line: NormalizedPoint[]): RouteGeometryOverlayCoordinate[] {
  return line.map((point) => ({
    latitude: point.lat,
    longitude: point.lng,
  }));
}

function coordinateHash(line: NormalizedPoint[]): string {
  const payload = line
    .map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`)
    .join('|');
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeDataState(value: unknown, fallback: RouteGeometryOverlayDataState): RouteGeometryOverlayDataState {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'live') return 'live';
  if (normalized === 'local' || normalized === 'local_review') return 'local';
  if (normalized === 'cached') return 'cached';
  if (normalized === 'stale' || normalized === 'aging') return 'stale';
  if (normalized === 'fixture' || normalized === 'mock' || normalized === 'mocked') return 'fixture';
  if (normalized === 'manual') return 'manual';
  if (normalized === 'estimated') return 'estimated';
  if (normalized === 'unknown' || normalized === 'missing') return 'unknown';
  return fallback;
}

function confidenceFromScore(value: unknown, fallback: RouteGeometryOverlayConfidence): RouteGeometryOverlayConfidence {
  const score = finiteNumber(value);
  if (score == null) return fallback;
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  if (score >= 1) return 'low';
  return 'unknown';
}

function routeCatalogConfidence(record: Record<string, unknown>): RouteGeometryOverlayConfidence {
  const verificationStatus = String(record.verificationStatus ?? '').trim();
  if (verificationStatus === 'official_verified') return 'high';
  if (verificationStatus === 'partially_verified' || verificationStatus === 'geometry_only') return 'medium';
  if (verificationStatus === 'stale') return 'low';
  return 'unknown';
}

function routeCatalogDataState(record: Record<string, unknown>): RouteGeometryOverlayDataState {
  const currentCondition = readRecord(record.currentCondition);
  if (currentCondition?.lastEvaluatedAt) return 'live';
  const sourceRecords = Array.isArray(record.sourceRecords) ? record.sourceRecords : [];
  if (sourceRecords.some((source) => readRecord(source)?.lastVerifiedAt)) return 'live';
  return 'unknown';
}

function firstSourceRecordLabel(record: Record<string, unknown>): string | null {
  const sourceRecords = Array.isArray(record.sourceRecords) ? record.sourceRecords : [];
  for (const source of sourceRecords) {
    const label = readText(readRecord(source), 'label', 'authority', 'providerId');
    if (label) return label;
  }
  return null;
}

function sourceColor(sourceKind: RouteGeometryOverlaySourceKind, dataState: RouteGeometryOverlayDataState): string {
  if (dataState === 'stale' || dataState === 'fixture' || dataState === 'unknown') return '#7D8C91';
  if (sourceKind === 'route_catalog' || sourceKind === 'trail_pack' || sourceKind === 'explore_route') {
    return '#65D4FF';
  }
  return '#65C97A';
}

function normalizeWarnings(input: unknown): string[] {
  const values = Array.isArray(input) ? input : [];
  const warnings = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return Array.from(new Set([ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING, ...warnings]));
}

function segmentSourceMetadata(candidate: Candidate): RouteSegmentSourceMetadata {
  return {
    kind: 'ecs_route_geometry',
    sourceLabel: candidate.sourceLabel,
    confidence: 'planning_geometry',
    routeGeometrySourceKind: candidate.sourceKind,
    dataState: candidate.dataState,
    warnings: normalizeWarnings(candidate.warnings),
  };
}

function addTrailPackCandidates(candidates: Candidate[], trailPacks: unknown[] | undefined): void {
  for (const entry of trailPacks ?? []) {
    const pack = readRecord(entry);
    if (!pack) continue;
    const catalogVerification = readRecord(pack.catalogVerification);
    candidates.push({
      sourceKind: 'trail_pack',
      sourceId: readText(pack, 'id', 'publicId') ?? `trail-pack-${candidates.length}`,
      name: readText(pack, 'name', 'title') ?? 'Trail Pack',
      sourceLabel: readText(catalogVerification, 'sourceLabel') ?? readText(pack, 'source') ?? 'Trail Pack',
      dataState: normalizeDataState(pack.dataState, 'live'),
      confidence: confidenceFromScore(catalogVerification?.confidenceScore ?? pack.confidenceScore, 'medium'),
      geometry: pack.routeGeometry ?? pack.route_geometry ?? pack.trailGeometry,
      warnings: Array.isArray(catalogVerification?.warnings) ? catalogVerification?.warnings : undefined,
    });
  }
}

function addRouteCatalogCandidates(candidates: Candidate[], records: unknown[] | undefined): void {
  for (const entry of records ?? []) {
    const record = readRecord(entry);
    if (!record) continue;
    candidates.push({
      sourceKind: 'route_catalog',
      sourceId: readText(record, 'id', 'publicId') ?? `route-catalog-${candidates.length}`,
      name: readText(record, 'name', 'title') ?? 'Route Catalog Geometry',
      sourceLabel: firstSourceRecordLabel(record) ?? readText(record, 'verificationStatus') ?? 'Route Catalog',
      dataState: routeCatalogDataState(record),
      confidence: routeCatalogConfidence(record),
      geometry: record.routeGeometry ?? record.route_geometry,
      warnings: Array.isArray(record.warnings) ? record.warnings : undefined,
    });
  }
}

function addRouteCandidates(candidates: Candidate[], routes: unknown[] | undefined): void {
  for (const entry of routes ?? []) {
    const route = readRecord(entry);
    if (!route) continue;
    const sourceFormat = String(route.source_format ?? '').toLowerCase();
    const isCustom = route.route_category === 'custom' || sourceFormat === 'custom';
    const sourceKind: RouteGeometryOverlaySourceKind = isCustom ? 'custom_route' : 'imported_route';
    candidates.push({
      sourceKind,
      sourceId: readText(route, 'id') ?? `route-${candidates.length}`,
      name: readText(route, 'name', 'title') ?? (isCustom ? 'Custom Route' : 'Imported Route'),
      sourceLabel: readText(route, 'source_app', 'source_format') ?? (isCustom ? 'ECS Route Builder' : 'Imported Route'),
      dataState: 'local',
      confidence: isCustom ? 'medium' : 'high',
      geometry: { segments: linesFromRouteSegments(route) },
    });
  }
}

function addRunCandidates(candidates: Candidate[], runs: unknown[] | undefined): void {
  for (const entry of runs ?? []) {
    const run = readRecord(entry);
    if (!run) continue;
    candidates.push({
      sourceKind: 'recorded_run',
      sourceId: readText(run, 'id') ?? `run-${candidates.length}`,
      name: readText(run, 'title', 'name') ?? 'Recorded Route',
      sourceLabel: readText(run, 'source') ?? 'Recorded Run',
      dataState: 'local',
      confidence: 'medium',
      geometry: run.points,
    });
  }
}

function addSavedRouteAssetCandidates(candidates: Candidate[], assets: unknown[] | undefined): void {
  for (const entry of assets ?? []) {
    const asset = readRecord(entry);
    const payload = readRecord(asset?.navigationPayload);
    if (!asset || !payload) continue;
    const metadata = readRecord(payload.routeMetadata);
    candidates.push({
      sourceKind: 'favorite_trail',
      sourceId: readText(asset, 'id') ?? readText(payload, 'id') ?? `favorite-${candidates.length}`,
      name: readText(asset, 'title') ?? readText(payload, 'title') ?? 'Saved Trail',
      sourceLabel: readText(asset, 'sourceLabel', 'badgeLabel') ?? 'Saved Trail',
      dataState: normalizeDataState(metadata?.dataState, 'cached'),
      confidence: 'medium',
      geometry: {
        segments: payload.trailGeometrySegments,
        routeGeometry: payload.trailGeometry,
      },
    });
  }
}

function addExploreSegmentCandidates(candidates: Candidate[], exploreSegments: unknown[] | undefined): void {
  for (const entry of exploreSegments ?? []) {
    const segment = readRecord(entry);
    if (!segment || segment.kind !== 'explore_route') continue;
    candidates.push({
      sourceKind: 'explore_route',
      sourceId: readText(segment, 'id') ?? `explore-${candidates.length}`,
      name: readText(segment, 'name') ?? 'Explore Route',
      sourceLabel: readText(segment, 'categoryLabel', 'category') ?? 'Explore Route',
      dataState: 'local',
      confidence: 'medium',
      geometry: segment.coordinates,
    });
  }
}

function extractLines(candidate: Candidate): NormalizedPoint[][] {
  const record = readRecord(candidate.geometry);
  if (record && Array.isArray(record.segments)) {
    const segmentLines = (record.segments as unknown[])
      .flatMap((segment) => {
        const resolved = linesFromNavigationGeometry(segment);
        return resolved.length > 0 ? resolved : [normalizePointLine(segment)];
      })
      .filter((line) => line.length > 1);
    if (segmentLines.length > 0) return segmentLines;
  }
  return linesFromNavigationGeometry(record?.routeGeometry ?? candidate.geometry);
}

export function buildRouteGeometryOverlaySegments(
  input: BuildRouteGeometryOverlaySegmentsInput = {},
): RouteGeometryOverlayBuildResult {
  const maxSegments = Math.max(1, Math.floor(input.maxSegments ?? DEFAULT_MAX_SEGMENTS));
  const selectedSegmentIds = new Set((input.selectedSegmentIds ?? []).map(String));
  const candidates: Candidate[] = [];
  const sourceCounts = {
    route_catalog: 0,
    trail_pack: 0,
    explore_route: 0,
    saved_route: 0,
    imported_route: 0,
    custom_route: 0,
    recorded_run: 0,
    favorite_trail: 0,
  } satisfies Record<RouteGeometryOverlaySourceKind, number>;

  addTrailPackCandidates(candidates, input.trailPacks);
  addRouteCatalogCandidates(candidates, input.routeCatalogRecords);
  addRouteCandidates(candidates, input.routes);
  addRunCandidates(candidates, input.runs);
  addSavedRouteAssetCandidates(candidates, input.savedRouteAssets);
  addExploreSegmentCandidates(candidates, input.exploreSegments);

  const segments: RouteGeometryOverlaySegment[] = [];
  const seen = new Set<string>();
  let skippedMissingGeometryCount = 0;
  let cappedCount = 0;
  let dedupedCount = 0;

  for (const candidate of candidates) {
    const lines = extractLines(candidate);
    if (lines.length === 0) {
      skippedMissingGeometryCount += 1;
      continue;
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (line.length < 2) {
        skippedMissingGeometryCount += 1;
        continue;
      }
      const hash = coordinateHash(line);
      const identity = `${candidate.sourceKind}:${candidate.sourceId}:${hash}`;
      if (seen.has(identity)) {
        dedupedCount += 1;
        continue;
      }
      seen.add(identity);
      if (segments.length >= maxSegments) {
        cappedCount += 1;
        continue;
      }

      const id = `route-geometry:${candidate.sourceKind}:${candidate.sourceId}:${lineIndex}:${hash}`;
      const warnings = normalizeWarnings(candidate.warnings);
      const sourceMetadata = segmentSourceMetadata(candidate);
      const segment: RouteGeometryOverlaySegment = {
        id,
        name: candidate.name,
        kind: 'route_geometry_segment',
        coordinates: lineToOverlayCoordinates(line),
        color: sourceColor(candidate.sourceKind, candidate.dataState),
        sourceKind: candidate.sourceKind,
        sourceId: candidate.sourceId,
        sourceLabel: candidate.sourceLabel,
        dataState: candidate.dataState,
        confidence: candidate.confidence,
        warnings,
        routeGeometrySelected: selectedSegmentIds.has(id),
        routeGeometrySourceKind: candidate.sourceKind,
        routeGeometryDataState: candidate.dataState,
        routeGeometryConfidence: candidate.confidence,
        routeGeometryWarningsJson: JSON.stringify(warnings),
        sourceMetadata,
      };
      segments.push(segment);
      sourceCounts[candidate.sourceKind] += 1;
    }
  }

  return {
    segments,
    candidateCount: candidates.length,
    skippedMissingGeometryCount,
    cappedCount,
    dedupedCount,
    sourceCounts,
  };
}

export function routeGeometrySegmentToRouteBuilderSegment(segment: RouteGeometryOverlaySegment) {
  const coordinates = segment.coordinates.map((point) => [point.longitude, point.latitude] as [number, number]);
  const snapConfidence = segment.confidence === 'high' ? 'high' : 'medium';
  return {
    id: `route-builder-${segment.id}`,
    coordinates,
    rawSegment: coordinates,
    snappedSegment: coordinates,
    snapConfidence,
    snapSource: segment.sourceKind,
    snapStatus: 'snapped' as const,
    snapProvider: 'ecs_route_geometry' as const,
    snapProfile: null,
    snapMessage: ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING,
    sourceSegmentId: segment.id,
    buildSource: segment.sourceMetadata,
  };
}
