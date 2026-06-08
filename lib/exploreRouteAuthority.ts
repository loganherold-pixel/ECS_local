import type { ExpeditionOpportunity } from './discoverEngine';
import {
  normalizeCanonicalRouteGeometry,
  type CanonicalRouteGeometryResult,
} from './routeGeometryLifecycle';

export const EXPLORE_ROUTE_TYPE_STATUSES = [
  'trailhead_guidance',
  'trail_route',
  'expedition_itinerary',
  'demo_fixture',
  'preview_geometry',
  'imported_geometry',
  'live_verified_geometry',
  'unknown',
] as const;

export type ExploreRouteTypeStatus = typeof EXPLORE_ROUTE_TYPE_STATUSES[number];

export type ExploreRouteAuthority = {
  status: ExploreRouteTypeStatus;
  label: string;
  notice: string;
  sourceLabel: string;
  geometryAuthority: CanonicalRouteGeometryResult['authority'];
  hasRenderableGeometry: boolean;
  hasTrueTrailGeometry: boolean;
  canUseForTrailItinerary: boolean;
  isTrailheadOnly: boolean;
  isPreviewOrDemo: boolean;
  pointCount: number;
};

type RouteLike = Partial<ExpeditionOpportunity> & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function routeRecord(route: unknown): RouteLike {
  return isRecord(route) ? route as RouteLike : {};
}

function routeMetadata(route: unknown): Record<string, unknown> {
  const record = routeRecord(route);
  const metadata = record.routeMetadata ?? record.route_metadata;
  return isRecord(metadata) ? metadata : {};
}

function textToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function truthy(value: unknown): boolean {
  const token = textToken(value);
  return value === true || token === 'true' || token === 'yes' || token === '1';
}

function metadataValue(route: unknown, key: string): unknown {
  const record = routeRecord(route);
  const metadata = routeMetadata(route);
  return metadata[key] ?? record[key];
}

function hasTrailheadCoordinate(route: unknown): boolean {
  const record = routeRecord(route);
  const startLat = Number(record.startLat ?? record.start_lat);
  const startLng = Number(record.startLng ?? record.start_lng);
  if (
    Number.isFinite(startLat) &&
    Number.isFinite(startLng) &&
    Math.abs(startLat) <= 90 &&
    Math.abs(startLng) <= 180
  ) {
    return true;
  }

  const coordinate = record.coordinate ?? metadataValue(route, 'coordinate');
  if (Array.isArray(coordinate)) {
    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }
  if (!isRecord(coordinate)) return false;
  const lat = Number(coordinate.latitude ?? coordinate.lat ?? coordinate.y);
  const lng = Number(coordinate.longitude ?? coordinate.lng ?? coordinate.lon ?? coordinate.x);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function hasExplicitTrailGeometryField(route: unknown): boolean {
  const record = routeRecord(route);
  const metadata = routeMetadata(route);
  return (
    record.trailGeometry != null ||
    record.trail_geometry != null ||
    metadata.trailGeometry != null ||
    metadata.trail_geometry != null
  );
}

function hasExpeditionItinerary(route: unknown): boolean {
  const record = routeRecord(route);
  return record.itinerary != null || record.expeditionItinerary != null || record.expedition_itinerary != null;
}

function hasDemoEvidence(route: unknown, normalized: CanonicalRouteGeometryResult): boolean {
  const geometrySource = textToken(metadataValue(route, 'geometrySource') ?? metadataValue(route, 'geometry_source'));
  const dataState = textToken(metadataValue(route, 'dataState') ?? metadataValue(route, 'trailPackDataState'));
  return (
    normalized.authority === 'demo' ||
    geometrySource === 'ecs_demo_full_route_fixture' ||
    dataState === 'fixture' ||
    truthy(metadataValue(route, 'isDemoGeometry'))
  );
}

function hasImportedEvidence(route: unknown): boolean {
  const source = textToken(metadataValue(route, 'source') ?? metadataValue(route, 'routeSource'));
  const sourceFileType = textToken(metadataValue(route, 'sourceFileType') ?? metadataValue(route, 'source_file_type'));
  return (
    source === 'trip_builder_import' ||
    source === 'imported' ||
    source === 'operator_supplied' ||
    sourceFileType === 'gpx' ||
    sourceFileType === 'kml' ||
    sourceFileType === 'geojson' ||
    source.includes('import') ||
    source.includes('operator_supplied')
  );
}

function hasLiveVerifiedEvidence(route: unknown): boolean {
  const source = textToken(metadataValue(route, 'source') ?? metadataValue(route, 'routeSource'));
  const dataState = textToken(metadataValue(route, 'dataState') ?? metadataValue(route, 'trailPackDataState'));
  const reviewStatus = textToken(metadataValue(route, 'reviewStatus'));
  const catalogVerification = metadataValue(route, 'catalogVerification');
  const catalogRecord = isRecord(catalogVerification) ? catalogVerification : null;
  const publicRecommendation = catalogRecord?.publicRecommendation;
  const catalogStatus = textToken(catalogRecord?.status);
  return (
    source === 'trail_pack' &&
    dataState === 'live' &&
    (reviewStatus === 'approved' || reviewStatus === '') &&
    publicRecommendation !== false &&
    catalogStatus !== 'critical'
  );
}

function hasPreviewEvidence(route: unknown, normalized: CanonicalRouteGeometryResult): boolean {
  const previewStatus = textToken(metadataValue(route, 'previewMetadataStatus') ?? metadataValue(route, 'preview_metadata_status'));
  const source = textToken(metadataValue(route, 'source'));
  return (
    normalized.authority === 'preview' ||
    previewStatus === 'geometry' ||
    previewStatus === 'endpoint' ||
    previewStatus === 'waypoints' ||
    source.includes('preview')
  );
}

function statusFromRoute(
  route: unknown,
  normalized: CanonicalRouteGeometryResult,
): ExploreRouteTypeStatus {
  if (hasDemoEvidence(route, normalized)) return 'demo_fixture';
  if (normalized.valid && hasImportedEvidence(route)) return 'imported_geometry';
  if (normalized.valid && hasLiveVerifiedEvidence(route)) return 'live_verified_geometry';
  if (normalized.valid && hasExpeditionItinerary(route)) return 'expedition_itinerary';
  if (
    normalized.valid &&
    !normalized.isPreviewOrDemo &&
    (normalized.isTrailGeometry || hasExplicitTrailGeometryField(route))
  ) {
    return 'trail_route';
  }
  if (normalized.valid && hasPreviewEvidence(route, normalized)) return 'preview_geometry';

  const previewStatus = textToken(metadataValue(route, 'previewMetadataStatus') ?? metadataValue(route, 'preview_metadata_status'));
  if (previewStatus === 'trailhead_only' || hasTrailheadCoordinate(route)) return 'trailhead_guidance';
  return 'unknown';
}

function sourceLabelForStatus(route: unknown, status: ExploreRouteTypeStatus): string {
  const sourceLabel = String(
    metadataValue(route, 'sourceLabel') ??
      metadataValue(route, 'trailPackSourceLabel') ??
      metadataValue(route, 'source') ??
      '',
  ).trim();
  if (sourceLabel) return sourceLabel;

  switch (status) {
    case 'trailhead_guidance':
      return 'Trailhead coordinate';
    case 'trail_route':
      return 'Trail geometry';
    case 'expedition_itinerary':
      return 'Expedition itinerary';
    case 'demo_fixture':
      return 'ECS demo fixture';
    case 'preview_geometry':
      return 'Preview geometry';
    case 'imported_geometry':
      return 'Operator import';
    case 'live_verified_geometry':
      return 'Source-backed route';
    default:
      return 'Unknown source';
  }
}

export function getExploreRouteAuthorityCopy(
  routeOrStatus: unknown,
): { label: string; notice: string; sourceLabel: string } {
  const status = typeof routeOrStatus === 'string'
    ? routeOrStatus as ExploreRouteTypeStatus
    : classifyExploreRouteAuthority(routeOrStatus).status;
  const sourceLabel = typeof routeOrStatus === 'string'
    ? sourceLabelForStatus(null, status)
    : sourceLabelForStatus(routeOrStatus, status);

  switch (status) {
    case 'trailhead_guidance':
      return {
        label: 'Trailhead guidance',
        sourceLabel,
        notice: 'Trailhead guidance only. Navigate can route to the trailhead, not a verified full trail line.',
      };
    case 'trail_route':
      return {
        label: 'Trail route geometry',
        sourceLabel,
        notice: 'Trail geometry is present. Verify legal access, closures, and conditions before guidance.',
      };
    case 'expedition_itinerary':
      return {
        label: 'Expedition itinerary',
        sourceLabel,
        notice: 'Expedition itinerary geometry is present. Verify each segment before field use.',
      };
    case 'demo_fixture':
      return {
        label: 'Demo fixture',
        sourceLabel,
        notice: 'Demo fixture geometry supports ECS flow testing only and is not verified trail authority.',
      };
    case 'preview_geometry':
      return {
        label: 'Preview geometry',
        sourceLabel,
        notice: 'Preview geometry is renderable but not verified trail geometry.',
      };
    case 'imported_geometry':
      return {
        label: 'Imported route geometry',
        sourceLabel,
        notice: 'Imported operator route geometry is available. Verify legal access and current conditions.',
      };
    case 'live_verified_geometry':
      return {
        label: 'Source-backed geometry',
        sourceLabel,
        notice: 'Source-backed route geometry is available. Verify current conditions and restrictions before departure.',
      };
    default:
      return {
        label: 'Geometry unknown',
        sourceLabel,
        notice: 'Route geometry authority is unknown. ECS will not treat it as verified trail geometry.',
      };
  }
}

export function classifyExploreRouteAuthority(route: unknown): ExploreRouteAuthority {
  const normalized = normalizeCanonicalRouteGeometry(route);
  const status = statusFromRoute(route, normalized);
  const copy = getExploreRouteAuthorityCopy(status);
  const hasTrueTrailGeometry = (
    status === 'trail_route' ||
    status === 'expedition_itinerary' ||
    status === 'imported_geometry' ||
    status === 'live_verified_geometry'
  ) && normalized.valid;

  return {
    status,
    label: copy.label,
    notice: copy.notice,
    sourceLabel: sourceLabelForStatus(route, status),
    geometryAuthority: normalized.authority,
    hasRenderableGeometry: normalized.valid,
    hasTrueTrailGeometry,
    canUseForTrailItinerary: hasTrueTrailGeometry,
    isTrailheadOnly: status === 'trailhead_guidance',
    isPreviewOrDemo: status === 'preview_geometry' || status === 'demo_fixture',
    pointCount: normalized.pointCount,
  };
}
