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
import {
  buildNasaFirmsDataAvailabilityUrl,
  buildNasaFirmsMapKeyStatusUrl,
  buildNasaFirmsRequest,
  buildNasaFirmsRuntimeConfig as buildSharedNasaFirmsRuntimeConfig,
  normalizeNasaFirmsDetections,
  parseNasaFirmsCsv,
  processNasaFirmsWildfireSignals,
  redactNasaFirmsUrl,
  validateNasaFirmsArea,
  validateNasaFirmsDayRange,
  type NasaFirmsConfig,
  type NasaFirmsRequestInput,
} from '../supabase/functions/_shared/nasaFirms';

export {
  buildNasaFirmsDataAvailabilityUrl,
  buildNasaFirmsMapKeyStatusUrl,
  normalizeNasaFirmsDetections,
  parseNasaFirmsCsv,
  processNasaFirmsWildfireSignals,
  redactNasaFirmsUrl,
  validateNasaFirmsArea,
  validateNasaFirmsDayRange,
};

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
      if (!context.serverFetch) throw new Error('NASA FIRMS live fetch requires serverFetch. Do not call this adapter directly from the client.');
      const config = input?.config ?? buildNasaFirmsRuntimeConfig();
      const request = buildNasaFirmsRequest(config, input ?? {});
      return context.serverFetch({
        url: request.url,
        timeoutMs: 10_000,
        headers: { Accept: 'text/csv, application/json' },
        signal: context.signal,
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
        signal: context.signal,
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
        signal: context.signal,
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
        instrument: row.instrument ?? row.sensor ?? null,
        sensor: row.instrument ?? row.sensor ?? null,
        frp: toNumber(row.frp),
        daynight: row.daynight ?? null,
        source: row.source_dataset ?? row.dataset ?? context.provider?.id ?? 'VIIRS_SNPP_NRT',
        sourceDataset: row.source_dataset ?? row.dataset ?? null,
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
  const currentEnvironmentalObservationIds: string[] = [];
  const perimeterIntersections: string[] = [];
  const bailoutImpacts: string[] = [];
  let fireRiskLevel: FireRiskLevel = 'unknown';
  let fireWeatherContext: FireWeatherContextLevel = 'unknown';
  let nearestActiveFireMiles: number | null = null;
  let blockingSafetyIssue = false;
  let hasCurrentEnvironmentalEvidence = false;

  for (const observation of input.observations) {
    if (observation.subjectType === 'active_fire') {
      const point = pointFromObservation(observation);
      const distance = point && route.length ? distancePointToRouteMiles(point, route) : null;
      const detection = assessFireDetection(observation, distance, now);
      if (detection.current) {
        hasCurrentEnvironmentalEvidence = true;
        currentEnvironmentalObservationIds.push(observation.id);
        if (distance != null) nearestActiveFireMiles = nearestActiveFireMiles == null ? distance : Math.min(nearestActiveFireMiles, distance);
      }
      fireRiskLevel = maxFireRisk([fireRiskLevel, detection.risk]);
      if (detection.risk === 'high' || detection.risk === 'critical') {
        evidenceObservationIds.push(observation.id);
        concerns.push(`NASA FIRMS active fire detection ${distance != null ? `${distance.toFixed(1)} mi from route` : 'near route context'} raises fire risk; detection is not a legal closure order.`);
      } else if (detection.freshnessWarning && (distance == null || distance <= 25)) {
        concerns.push(detection.freshnessWarning);
      }
    }

    if (observation.subjectType === 'fire_perimeter') {
      const current = isObservationCurrent(observation, now, 72, true);
      const intersects = current && route.length > 0 && geometryIntersectsRoute(observation.geometry, route);
      if (!current) {
        concerns.push('Stale fire perimeter data is retained as last-known context and is not treated as a current route closure or blocking condition.');
      } else if (intersects) {
        hasCurrentEnvironmentalEvidence = true;
        currentEnvironmentalObservationIds.push(observation.id);
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
      const current = isObservationCurrent(observation, now, 72, true);
      if (!current) {
        concerns.push('Stale incident context is retained as last-known information and does not establish a current route condition.');
      } else if (distance == null || distance <= 25) {
        hasCurrentEnvironmentalEvidence = true;
        currentEnvironmentalObservationIds.push(observation.id);
        evidenceObservationIds.push(observation.id);
        fireRiskLevel = maxFireRisk([fireRiskLevel, 'moderate']);
        concerns.push('InciWeb incident context nearby adds evidence but is not primary perimeter geometry.');
      }
    }

    if (observation.subjectType === 'weather_alert') {
      const payload = observation.normalizedPayload as any;
      const text = `${payload?.event ?? ''} ${payload?.headline ?? ''} ${payload?.description ?? ''}`;
      const current = isObservationCurrent(observation, now, 72, true);
      if (/red flag|fire weather/i.test(text) && current) {
        hasCurrentEnvironmentalEvidence = true;
        currentEnvironmentalObservationIds.push(observation.id);
        evidenceObservationIds.push(observation.id);
        fireWeatherContext = /warning|severe|extreme/i.test(text) ? 'critical' : 'elevated';
        fireRiskLevel = maxFireRisk([fireRiskLevel, 'high']);
        concerns.push('NWS fire weather or red flag alert raises fire_weather_context; this is not an active fire detection.');
      } else if (/red flag|fire weather/i.test(text) && !current) {
        concerns.push('Expired fire-weather alert is retained as historical context and is not labeled as current.');
      }
    }
  }

  for (const bailout of input.bailoutSegments ?? []) {
    const impacted = input.observations.some((observation) =>
      (observation.subjectType === 'fire_perimeter' &&
        isObservationCurrent(observation, now, 72, true) &&
        geometryIntersectsRoute(observation.geometry, bailout.geometry.filter(validPoint))) ||
      (observation.subjectType === 'active_fire' && pointFromObservation(observation) &&
        ['moderate', 'high', 'critical'].includes(assessFireDetection(
          observation,
          distancePointToRouteMiles(pointFromObservation(observation)!, bailout.geometry.filter(validPoint)),
          now,
        ).risk)));
    if (impacted) bailoutImpacts.push(bailout.label ?? bailout.id);
  }

  if (fireRiskLevel === 'unknown' && hasCurrentEnvironmentalEvidence) fireRiskLevel = 'low';
  if (fireWeatherContext === 'unknown' && hasCurrentEnvironmentalEvidence) fireWeatherContext = 'low';

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
    confidenceScore: confidenceForFireResult(input.observations, currentEnvironmentalObservationIds),
  };
}

export function buildNasaFirmsRuntimeConfig(env?: Record<string, string | undefined>): NasaFirmsConfig {
  return buildSharedNasaFirmsRuntimeConfig(env ?? getProcessEnv());
}

export function buildNasaFirmsAreaUrl(input: NasaFirmsRequestInput & { config?: NasaFirmsConfig }): string {
  const config = input.config ?? buildNasaFirmsRuntimeConfig();
  return buildNasaFirmsRequest(config, input).url;
}

function assessFireDetection(
  observation: SourceObservation,
  distanceMiles: number | null,
  now: Date,
): { risk: FireRiskLevel; current: boolean; freshnessWarning: string | null } {
  const payload = observation.normalizedPayload as any;
  const confidence = String(payload?.confidence ?? '').toLowerCase();
  const frp = toNumber(payload?.frp) ?? 0;
  const observedAtMs = observation.observedAt ? Date.parse(observation.observedAt) : Number.NaN;
  if (!Number.isFinite(observedAtMs)) {
    return {
      risk: 'unknown',
      current: false,
      freshnessWarning: 'Fire detection time is missing or invalid; ECS cannot present it as current.',
    };
  }
  const futureSkewMs = observedAtMs - now.getTime();
  if (futureSkewMs > 15 * 60 * 1000) {
    return {
      risk: 'unknown',
      current: false,
      freshnessWarning: 'Fire detection timestamp is in the future; ECS cannot present it as current.',
    };
  }
  if (!isObservationCurrent(observation, now, 48, false)) {
    return {
      risk: 'unknown',
      current: false,
      freshnessWarning: 'Stale fire detection is retained as last-known context and is not treated as a current route condition or closure.',
    };
  }

  const ageHours = Math.max(0, (now.getTime() - observedAtMs) / 3_600_000);
  const confidenceScore = Number.isFinite(observation.confidenceScore) ? observation.confidenceScore : 0;
  const lowConfidence = confidence === 'l' || confidence === 'low' || confidenceScore < 60;
  let risk: FireRiskLevel = 'low';
  if (distanceMiles != null && distanceMiles <= 3 && ageHours <= 24) risk = 'critical';
  else if (
    distanceMiles != null &&
    distanceMiles <= 10 &&
    (confidence === 'h' || confidence === 'high' || frp >= 20 || ageHours <= 12)
  ) risk = 'high';
  else if (distanceMiles != null && distanceMiles <= 25) risk = 'moderate';

  if (lowConfidence && (risk === 'critical' || risk === 'high')) risk = 'moderate';
  return {
    risk,
    current: true,
    freshnessWarning: lowConfidence && risk === 'moderate'
      ? 'Low-confidence satellite detection is retained as cautionary evidence and cannot independently establish critical route risk or closure.'
      : null,
  };
}

function isObservationCurrent(
  observation: SourceObservation,
  now: Date,
  maxAgeHours: number,
  allowFutureObservedAt: boolean,
): boolean {
  const nowMs = now.getTime();
  const boundaries = [observation.staleAt, observation.expiresAt, observation.validUntil]
    .map((value) => typeof value === 'string' ? Date.parse(value) : Number.NaN)
    .filter(Number.isFinite);
  if (boundaries.length > 0 && Math.min(...boundaries) <= nowMs) return false;

  const observedAtMs = observation.observedAt ? Date.parse(observation.observedAt) : Number.NaN;
  if (!Number.isFinite(observedAtMs)) return boundaries.some((boundary) => boundary > nowMs);
  if (!allowFutureObservedAt && observedAtMs - nowMs > 15 * 60 * 1000) return false;
  return nowMs - observedAtMs <= Math.max(1, maxAgeHours) * 3_600_000;
}

function parseFirmsRows(rawPayload: unknown): Array<Record<string, any>> {
  if (Array.isArray(rawPayload)) return rawPayload.filter(isRecord);
  if (isRecord(rawPayload)) {
    if (Array.isArray(rawPayload.items)) return rawPayload.items.filter(isRecord);
    if (Array.isArray(rawPayload.features)) return rawPayload.features.map((feature) => isRecord(feature) ? { ...(feature.properties ?? {}), geometry: feature.geometry } : {}).filter(isRecord);
  }
  if (typeof rawPayload === 'string') return parseNasaFirmsCsv(rawPayload);
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
  if (used.length === 0) return 0;
  return Math.round(used.reduce((sum, observation) => sum + observation.confidenceScore, 0) / used.length);
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

function getProcessEnv(): Record<string, string | undefined> {
  return typeof process !== 'undefined' ? process.env as Record<string, string | undefined> : {};
}
