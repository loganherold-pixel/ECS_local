import type { ProviderDefinition } from './ecs5ProviderRegistry';
import type {
  ObservationBBox,
  ObservationGeometry,
  ProviderAdapter,
  ProviderAdapterContext,
  SourceObservation,
  SourceObservationConfidenceBreakdown,
} from './ecs5ObservationPipeline';
import { stableContentHash } from './ecs5ObservationPipeline';

export type FireRiskLevel = 'low' | 'moderate' | 'high' | 'critical' | 'unknown';
export type FireWeatherContextLevel = 'low' | 'elevated' | 'critical' | 'unknown';

export interface FireCoordinate {
  lat: number;
  lon: number;
}

export interface RouteFireIntelligenceInput {
  routeId: string;
  routeGeometry: FireCoordinate[];
  observations: SourceObservation[];
  bailoutSegments?: Array<{ id: string; label?: string; geometry: FireCoordinate[] }>;
  now?: Date;
}

export interface RouteFireIntelligenceResult {
  routeId: string;
  generatedAt: string;
  fireRiskLevel: FireRiskLevel;
  fireWeatherContext: FireWeatherContextLevel;
  blockingSafetyIssue: boolean;
  bailoutReevaluationRecommended: boolean;
  legalClosureImplied: false;
  concerns: string[];
  evidenceObservationIds: string[];
  nearestActiveFireMiles: number | null;
  perimeterIntersections: string[];
  bailoutImpacts: string[];
  confidenceScore: number;
}

export const NASA_FIRMS_KNOWN_LIMITATIONS = [
  'satellite_detection_not_ground_confirmation',
  'not_legal_closure_order',
  'false_positives_possible',
  'detection_time_depends_on_satellite_pass',
] as const;

export const WFIGS_KNOWN_LIMITATIONS = [
  'perimeter_not_legal_closure_by_itself',
  'update_frequency_varies',
  'use_active_current_layers_for_current_route_decisions',
] as const;

export const INCIWEB_KNOWN_LIMITATIONS = [
  'webpage_or_feed_structure_may_change',
  'incident_context_not_always_geometry',
  'closure_language_requires_careful_parsing',
] as const;

export function createNasaFirmsAdapter(provider: ProviderDefinition): ProviderAdapter {
  return {
    providerId: 'nasa_firms',
    supportsFixtureMode: true,
    supportsLiveMode: true,
    async fetch(input: any, context: ProviderAdapterContext): Promise<unknown> {
      if (context.fixtureMode && input?.fixturePayload != null) return input.fixturePayload;
      if (input?.fixturePayload != null) return input.fixturePayload;
      if (!input?.apiKeyAvailable) throw new Error('NASA FIRMS MAP_KEY is not available.');
      if (!context.serverFetch) throw new Error('NASA FIRMS live fetch requires serverFetch. Do not call this adapter directly from the client.');
      return context.serverFetch({
        url: buildNasaFirmsAreaUrl(input),
        timeoutMs: 10_000,
        headers: { Accept: 'text/csv, application/json' },
      });
    },
    normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] {
      return normalizeNasaFirmsPayload(rawPayload, provider, context);
    },
    getHealth: () => provider,
    getKnownLimitations: () => [...NASA_FIRMS_KNOWN_LIMITATIONS],
    getDefaultConfidence: () => 86,
    getCacheTtl: () => provider.cacheTtlSeconds,
  };
}

export function createWfigsAdapter(provider: ProviderDefinition): ProviderAdapter {
  return {
    providerId: 'nifc_wfigs',
    supportsFixtureMode: true,
    supportsLiveMode: true,
    async fetch(input: any, context: ProviderAdapterContext): Promise<unknown> {
      if (context.fixtureMode && input?.fixturePayload != null) return input.fixturePayload;
      if (input?.fixturePayload != null) return input.fixturePayload;
      if (!context.serverFetch) throw new Error('NIFC / WFIGS live fetch requires serverFetch. Do not call this adapter directly from the client.');
      return context.serverFetch({
        url: String(input?.url ?? 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson'),
        timeoutMs: 10_000,
        headers: { Accept: 'application/geo+json, application/json' },
      });
    },
    normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] {
      return normalizeWfigsPayload(rawPayload, provider, context);
    },
    getHealth: () => provider,
    getKnownLimitations: () => [...WFIGS_KNOWN_LIMITATIONS],
    getDefaultConfidence: () => 90,
    getCacheTtl: () => provider.cacheTtlSeconds,
  };
}

export function createInciWebAdapter(provider: ProviderDefinition): ProviderAdapter {
  return {
    providerId: 'inciweb',
    supportsFixtureMode: true,
    supportsLiveMode: true,
    async fetch(input: any, context: ProviderAdapterContext): Promise<unknown> {
      if (context.fixtureMode && input?.fixturePayload != null) return input.fixturePayload;
      if (input?.fixturePayload != null) return input.fixturePayload;
      if (!context.serverFetch) throw new Error('InciWeb live fetch requires serverFetch. Do not call this adapter directly from the client.');
      return context.serverFetch({
        url: String(input?.url ?? 'https://inciweb.wildfire.gov/feeds/rss.xml'),
        timeoutMs: 10_000,
        headers: { Accept: 'application/json, application/rss+xml, text/xml' },
      });
    },
    normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] {
      return normalizeInciWebPayload(rawPayload, provider, context);
    },
    getHealth: () => provider,
    getKnownLimitations: () => [...INCIWEB_KNOWN_LIMITATIONS],
    getDefaultConfidence: () => 84,
    getCacheTtl: () => provider.cacheTtlSeconds,
  };
}

export function normalizeNasaFirmsPayload(
  rawPayload: unknown,
  provider: ProviderDefinition,
  context: ProviderAdapterContext = {},
): SourceObservation[] {
  const rows = parseFirmsRows(rawPayload);
  const ingestedAt = (context.now ?? new Date()).toISOString();
  const rawHash = stableContentHash(rawPayload);
  return rows.map((row, index) => {
    const lat = toNumber(row.latitude ?? row.lat);
    const lon = toNumber(row.longitude ?? row.lon ?? row.lng);
    const observedAt = acquisitionTimestamp(row);
    return {
      id: String(row.id ?? row.objectid ?? `nasa-firms:${rawHash}:${index}`),
      providerId: 'nasa_firms',
      sourceName: 'NASA FIRMS',
      sourceType: 'satellite',
      subjectType: 'active_fire',
      subjectId: nullableString(row.source_dataset ?? row.instrument ?? row.sensor),
      geometry: lat != null && lon != null ? { type: 'Point', coordinates: [lon, lat] } : null,
      bbox: lat != null && lon != null ? bboxAroundPoint(lat, lon, 0.03) : null,
      observedAt,
      publishedAt: observedAt,
      ingestedAt,
      expiresAt: new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: {
        latitude: lat,
        longitude: lon,
        brightness: toNumber(row.brightness ?? row.bright_ti4 ?? row.bright_ti5),
        confidence: row.confidence ?? null,
        acquisitionDate: row.acq_date ?? null,
        acquisitionTime: row.acq_time ?? null,
        satellite: row.satellite ?? null,
        sensor: row.instrument ?? row.sensor ?? null,
        frp: toNumber(row.frp),
        sourceDataset: row.source_dataset ?? row.dataset ?? row.daynight ?? null,
        legalClosureSignal: false,
      },
      evidenceUrl: context.sourceUrl ?? 'https://firms.modaps.eosdis.nasa.gov/',
      contentHash: stableContentHash({ providerId: 'nasa_firms', row }),
      confidenceScore: confidenceFromFirms(row.confidence),
      confidenceBreakdown: confidenceBreakdown(confidenceFromFirms(row.confidence), 84),
      knownLimitations: [...NASA_FIRMS_KNOWN_LIMITATIONS],
      supersedesObservationId: null,
      offlineCacheEligible: true,
    };
  });
}

export function normalizeWfigsPayload(
  rawPayload: unknown,
  provider: ProviderDefinition,
  context: ProviderAdapterContext = {},
): SourceObservation[] {
  const features = geoJsonFeatures(rawPayload);
  const ingestedAt = (context.now ?? new Date()).toISOString();
  const rawHash = stableContentHash(rawPayload);
  return features.map((feature, index) => {
    const props = isRecord(feature.properties) ? feature.properties : {};
    const geometry = normalizeGeometry(feature.geometry);
    const subjectType = geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon' ? 'fire_perimeter' : 'fire_incident';
    const modifiedAt = normalizeTimestamp(props.ModifiedOnDateTime ?? props.ModifiedOnDateTime_dt ?? props.FireDiscoveryDateTime ?? props.CreateDate);
    return {
      id: String(props.IrwinID ?? props.OBJECTID ?? props.GlobalID ?? `wfigs:${rawHash}:${index}`),
      providerId: 'nifc_wfigs',
      sourceName: 'NIFC / WFIGS',
      sourceType: 'official_gis',
      subjectType,
      subjectId: nullableString(props.IncidentName ?? props.poly_IncidentName ?? props.UniqueFireIdentifier),
      geometry,
      bbox: normalizeBbox(feature.bbox) ?? geometryBbox(geometry),
      observedAt: modifiedAt,
      publishedAt: modifiedAt,
      ingestedAt,
      expiresAt: new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: {
        incidentName: props.IncidentName ?? props.poly_IncidentName ?? null,
        incidentId: props.IrwinID ?? props.UniqueFireIdentifier ?? null,
        acres: toNumber(props.GISAcres ?? props.DailyAcres ?? props.CalculatedAcres),
        percentContained: toNumber(props.PercentContained),
        discoveryAt: normalizeTimestamp(props.FireDiscoveryDateTime),
        modifiedAt,
        incidentStatus: props.IncidentTypeCategory ?? props.IncidentStatus ?? props.POOProtectingUnit ?? null,
        active: !/historical|inactive|out|contained/i.test(String(props.IncidentTypeCategory ?? props.IncidentStatus ?? '')),
        legalClosureSignal: false,
      },
      evidenceUrl: context.sourceUrl ?? null,
      contentHash: stableContentHash({ providerId: 'nifc_wfigs', feature }),
      confidenceScore: 90,
      confidenceBreakdown: confidenceBreakdown(90, 88),
      knownLimitations: [...WFIGS_KNOWN_LIMITATIONS],
      supersedesObservationId: null,
      offlineCacheEligible: true,
    };
  });
}

export function normalizeInciWebPayload(
  rawPayload: unknown,
  provider: ProviderDefinition,
  context: ProviderAdapterContext = {},
): SourceObservation[] {
  const items = inciWebItems(rawPayload);
  const ingestedAt = (context.now ?? new Date()).toISOString();
  const rawHash = stableContentHash(rawPayload);
  return items.map((item, index) => {
    const lat = toNumber(item.latitude ?? item.lat);
    const lon = toNumber(item.longitude ?? item.lon ?? item.lng);
    const updatedAt = normalizeTimestamp(item.updatedAt ?? item.updated ?? item.pubDate ?? item.modifiedAt);
    return {
      id: String(item.id ?? item.guid ?? item.url ?? `inciweb:${rawHash}:${index}`),
      providerId: 'inciweb',
      sourceName: 'InciWeb',
      sourceType: 'official_webpage',
      subjectType: 'fire_incident',
      subjectId: nullableString(item.incidentName ?? item.title ?? item.name),
      geometry: normalizeGeometry(item.geometry) ?? (lat != null && lon != null ? { type: 'Point', coordinates: [lon, lat] } : null),
      bbox: normalizeBbox(item.bbox) ?? (lat != null && lon != null ? bboxAroundPoint(lat, lon, 0.1) : null),
      observedAt: updatedAt,
      publishedAt: updatedAt,
      ingestedAt,
      expiresAt: new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: {
        incidentName: item.incidentName ?? item.title ?? item.name ?? null,
        status: item.status ?? null,
        summary: item.summary ?? item.description ?? null,
        url: item.url ?? item.link ?? null,
        updatedAt,
        closureLanguagePresent: /\bclosure|closed|evacuation|restriction\b/i.test(String(item.summary ?? item.description ?? item.title ?? '')),
        legalClosureSignal: false,
      },
      evidenceUrl: nullableString(item.url ?? item.link ?? context.sourceUrl),
      contentHash: stableContentHash({ providerId: 'inciweb', item }),
      confidenceScore: 84,
      confidenceBreakdown: confidenceBreakdown(84, 82),
      knownLimitations: [...INCIWEB_KNOWN_LIMITATIONS],
      supersedesObservationId: null,
      offlineCacheEligible: true,
    };
  });
}

export function evaluateRouteFireIntelligence(input: RouteFireIntelligenceInput): RouteFireIntelligenceResult {
  const now = input.now ?? new Date();
  const route = input.routeGeometry.filter(validPoint);
  const concerns: string[] = [];
  const evidenceObservationIds: string[] = [];
  const perimeterIntersections: string[] = [];
  const bailoutImpacts: string[] = [];
  let fireRiskLevel: FireRiskLevel = 'unknown';
  let fireWeatherContext: FireWeatherContextLevel = 'unknown';
  let nearestActiveFireMiles: number | null = null;
  let blockingSafetyIssue = false;

  for (const observation of input.observations) {
    if (observation.subjectType === 'active_fire') {
      const point = pointFromObservation(observation);
      const distance = point && route.length ? distancePointToRouteMiles(point, route) : null;
      if (distance != null) nearestActiveFireMiles = nearestActiveFireMiles == null ? distance : Math.min(nearestActiveFireMiles, distance);
      const detectionRisk = fireRiskFromDetection(observation, distance, now);
      fireRiskLevel = maxFireRisk([fireRiskLevel, detectionRisk]);
      if (detectionRisk === 'high' || detectionRisk === 'critical') {
        evidenceObservationIds.push(observation.id);
        concerns.push(`NASA FIRMS active fire detection ${distance != null ? `${distance.toFixed(1)} mi from route` : 'near route context'} raises fire risk; detection is not a legal closure order.`);
      }
    }

    if (observation.subjectType === 'fire_perimeter') {
      const intersects = route.length > 0 && geometryIntersectsRoute(observation.geometry, route);
      if (intersects) {
        evidenceObservationIds.push(observation.id);
        perimeterIntersections.push(observation.subjectId ?? observation.id);
        fireRiskLevel = 'critical';
        blockingSafetyIssue = true;
        concerns.push('WFIGS fire perimeter intersects the route. Treat as a critical/blocking safety issue until verified with current official sources.');
      }
    }

    if (observation.subjectType === 'fire_incident') {
      const point = pointFromObservation(observation);
      const distance = point && route.length ? distancePointToRouteMiles(point, route) : null;
      if (distance == null || distance <= 25) {
        evidenceObservationIds.push(observation.id);
        fireRiskLevel = maxFireRisk([fireRiskLevel, 'moderate']);
        concerns.push('InciWeb incident context nearby adds evidence but is not primary perimeter geometry.');
      }
    }

    if (observation.subjectType === 'weather_alert') {
      const payload = observation.normalizedPayload as any;
      const text = `${payload?.event ?? ''} ${payload?.headline ?? ''} ${payload?.description ?? ''}`;
      if (/red flag|fire weather/i.test(text)) {
        evidenceObservationIds.push(observation.id);
        fireWeatherContext = /warning|severe|extreme/i.test(text) ? 'critical' : 'elevated';
        fireRiskLevel = maxFireRisk([fireRiskLevel, 'high']);
        concerns.push('NWS fire weather or red flag alert raises fire_weather_context; this is not an active fire detection.');
      }
    }
  }

  for (const bailout of input.bailoutSegments ?? []) {
    const impacted = input.observations.some((observation) =>
      (observation.subjectType === 'fire_perimeter' && geometryIntersectsRoute(observation.geometry, bailout.geometry.filter(validPoint))) ||
      (observation.subjectType === 'active_fire' && pointFromObservation(observation) && distancePointToRouteMiles(pointFromObservation(observation)!, bailout.geometry.filter(validPoint)) <= 10));
    if (impacted) bailoutImpacts.push(bailout.label ?? bailout.id);
  }

  if (fireRiskLevel === 'unknown' && input.observations.length > 0) fireRiskLevel = 'low';
  if (fireWeatherContext === 'unknown' && input.observations.length > 0) fireWeatherContext = 'low';

  return {
    routeId: input.routeId,
    generatedAt: now.toISOString(),
    fireRiskLevel,
    fireWeatherContext,
    blockingSafetyIssue,
    bailoutReevaluationRecommended: blockingSafetyIssue || fireRiskLevel === 'high' || fireRiskLevel === 'critical' || bailoutImpacts.length > 0,
    legalClosureImplied: false,
    concerns: dedupe(concerns),
    evidenceObservationIds: dedupe(evidenceObservationIds),
    nearestActiveFireMiles: nearestActiveFireMiles == null ? null : Number(nearestActiveFireMiles.toFixed(2)),
    perimeterIntersections,
    bailoutImpacts,
    confidenceScore: confidenceForFireResult(input.observations, evidenceObservationIds),
  };
}

export function buildNasaFirmsAreaUrl(input: { bbox?: [number, number, number, number]; dataset?: string; days?: number }): string {
  const dataset = encodeURIComponent(String(input.dataset ?? 'VIIRS_SNPP_NRT'));
  const bbox = input.bbox ?? [-125, 32, -114, 42];
  const area = bbox.map((value) => Number(value).toFixed(4)).join(',');
  const days = Math.max(1, Math.min(10, Number(input.days ?? 1)));
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{{NASA_FIRMS_MAP_KEY}}/${dataset}/${area}/${days}`;
}

function fireRiskFromDetection(observation: SourceObservation, distanceMiles: number | null, now: Date): FireRiskLevel {
  const payload = observation.normalizedPayload as any;
  const confidence = String(payload?.confidence ?? '').toLowerCase();
  const frp = toNumber(payload?.frp) ?? 0;
  const ageHours = observation.observedAt ? Math.max(0, (now.getTime() - Date.parse(observation.observedAt)) / 3_600_000) : 24;
  if (distanceMiles != null && distanceMiles <= 3 && ageHours <= 24) return 'critical';
  if (distanceMiles != null && distanceMiles <= 10 && (confidence === 'h' || confidence === 'high' || frp >= 20 || ageHours <= 12)) return 'high';
  if (distanceMiles != null && distanceMiles <= 25) return 'moderate';
  return 'low';
}

function parseFirmsRows(rawPayload: unknown): Array<Record<string, any>> {
  if (Array.isArray(rawPayload)) return rawPayload.filter(isRecord);
  if (isRecord(rawPayload)) {
    if (Array.isArray(rawPayload.items)) return rawPayload.items.filter(isRecord);
    if (Array.isArray(rawPayload.features)) return rawPayload.features.map((feature) => isRecord(feature) ? { ...(feature.properties ?? {}), geometry: feature.geometry } : {}).filter(isRecord);
  }
  if (typeof rawPayload === 'string') return csvRows(rawPayload);
  return [];
}

function csvRows(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function splitCsvLine(line: string): string[] {
  const output: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      output.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  output.push(current);
  return output.map((value) => value.trim().replace(/^"|"$/g, ''));
}

function geoJsonFeatures(rawPayload: unknown): Array<Record<string, any>> {
  if (Array.isArray((rawPayload as any)?.features)) return (rawPayload as any).features.filter(isRecord);
  if (Array.isArray(rawPayload)) return rawPayload.filter(isRecord);
  return [];
}

function inciWebItems(rawPayload: unknown): Array<Record<string, any>> {
  if (Array.isArray(rawPayload)) return rawPayload.filter(isRecord);
  if (!isRecord(rawPayload)) return [];
  if (Array.isArray(rawPayload.items)) return rawPayload.items.filter(isRecord);
  if (Array.isArray(rawPayload.incidents)) return rawPayload.incidents.filter(isRecord);
  if (Array.isArray(rawPayload.features)) {
    return rawPayload.features.map((feature) => isRecord(feature) ? { ...(feature.properties ?? {}), geometry: feature.geometry } : {}).filter(isRecord);
  }
  return [];
}

function acquisitionTimestamp(row: Record<string, any>): string | null {
  const date = row.acq_date;
  const time = String(row.acq_time ?? '').padStart(4, '0');
  if (date && /^\d{4}$/.test(time)) {
    const parsed = Date.parse(`${date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return normalizeTimestamp(row.observedAt ?? row.acquiredAt);
}

function confidenceFromFirms(value: unknown): number {
  const raw = String(value ?? '').toLowerCase();
  const numeric = toNumber(value);
  if (raw === 'h' || raw === 'high') return 90;
  if (raw === 'n' || raw === 'nominal' || (numeric != null && numeric >= 70)) return 84;
  if (raw === 'l' || raw === 'low' || (numeric != null && numeric < 50)) return 68;
  return 78;
}

function confidenceBreakdown(providerDefault: number, sourceAuthority: number): SourceObservationConfidenceBreakdown {
  return {
    providerDefault,
    freshness: 82,
    sourceAuthority,
    completeness: 78,
    stalePenalty: 0,
  };
}

function pointFromObservation(observation: SourceObservation): FireCoordinate | null {
  const payload = observation.normalizedPayload as any;
  const lat = toNumber(payload?.latitude);
  const lon = toNumber(payload?.longitude);
  if (lat != null && lon != null) return { lat, lon };
  if (observation.geometry?.type === 'Point' && Array.isArray(observation.geometry.coordinates)) {
    const [lng, latitude] = observation.geometry.coordinates;
    const pointLat = toNumber(latitude);
    const pointLon = toNumber(lng);
    if (pointLat != null && pointLon != null) return { lat: pointLat, lon: pointLon };
  }
  return null;
}

function geometryIntersectsRoute(geometry: ObservationGeometry | null, route: FireCoordinate[]): boolean {
  if (!geometry || route.length === 0) return false;
  const bbox = geometryBbox(geometry);
  if (!bbox) return false;
  if (route.some((point) => point.lat >= bbox.minLat && point.lat <= bbox.maxLat && point.lon >= bbox.minLon && point.lon <= bbox.maxLon)) return true;
  for (let index = 1; index < route.length; index += 1) {
    const segmentBox = {
      minLat: Math.min(route[index - 1].lat, route[index].lat),
      maxLat: Math.max(route[index - 1].lat, route[index].lat),
      minLon: Math.min(route[index - 1].lon, route[index].lon),
      maxLon: Math.max(route[index - 1].lon, route[index].lon),
    };
    if (boxesIntersect(bbox, segmentBox)) return true;
  }
  return false;
}

function distancePointToRouteMiles(point: FireCoordinate, route: FireCoordinate[]): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return distanceMiles(point, route[0]);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    nearest = Math.min(nearest, distancePointToSegmentMiles(point, route[index - 1], route[index]));
  }
  return nearest;
}

function distancePointToSegmentMiles(point: FireCoordinate, a: FireCoordinate, b: FireCoordinate): number {
  const x = point.lon;
  const y = point.lat;
  const x1 = a.lon;
  const y1 = a.lat;
  const x2 = b.lon;
  const y2 = b.lat;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return distanceMiles(point, { lon: x1 + t * dx, lat: y1 + t * dy });
}

function geometryBbox(geometry: ObservationGeometry | null): ObservationBBox | null {
  if (!geometry) return null;
  const coords: number[][] = [];
  collectCoordinatePairs(geometry.coordinates, coords);
  if (coords.length === 0) return null;
  const lons = coords.map((pair) => pair[0]);
  const lats = coords.map((pair) => pair[1]);
  return {
    minLat: Math.min(...lats),
    minLon: Math.min(...lons),
    maxLat: Math.max(...lats),
    maxLon: Math.max(...lons),
  };
}

function collectCoordinatePairs(value: unknown, output: number[][]): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    output.push([value[0], value[1]]);
    return;
  }
  value.forEach((entry) => collectCoordinatePairs(entry, output));
}

function normalizeGeometry(value: unknown): ObservationGeometry | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (type === 'Point' || type === 'LineString' || type === 'Polygon' || type === 'MultiPolygon' || type === 'GeometryCollection') {
    return { type, coordinates: value.coordinates ?? null };
  }
  return null;
}

function normalizeBbox(value: unknown): ObservationBBox | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [minLon, minLat, maxLon, maxLat] = value.map(Number);
  if ([minLat, minLon, maxLat, maxLon].every(Number.isFinite)) return { minLat, minLon, maxLat, maxLon };
  return null;
}

function bboxAroundPoint(lat: number, lon: number, delta: number): ObservationBBox {
  return { minLat: lat - delta, minLon: lon - delta, maxLat: lat + delta, maxLon: lon + delta };
}

function boxesIntersect(a: ObservationBBox, b: ObservationBBox): boolean {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

function distanceMiles(a: FireCoordinate, b: FireCoordinate): number {
  const radius = 3958.8;
  const dLat = degToRad(b.lat - a.lat);
  const dLon = degToRad(b.lon - a.lon);
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function degToRad(value: number): number {
  return value * Math.PI / 180;
}

function confidenceForFireResult(observations: SourceObservation[], evidenceIds: string[]): number {
  const used = observations.filter((observation) => evidenceIds.includes(observation.id));
  const source = used.length ? used : observations;
  if (source.length === 0) return 0;
  return Math.round(source.reduce((sum, observation) => sum + observation.confidenceScore, 0) / source.length);
}

function maxFireRisk(values: FireRiskLevel[]): FireRiskLevel {
  const order: FireRiskLevel[] = ['unknown', 'low', 'moderate', 'high', 'critical'];
  return values.reduce((max, value) => order.indexOf(value) > order.indexOf(max) ? value : max, 'unknown');
}

function validPoint(point: FireCoordinate): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) && point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
