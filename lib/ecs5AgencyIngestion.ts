import type { ECS5ProviderId } from './ecs5ProviderRegistry';
import type {
  ObservationBBox,
  ObservationGeometry,
  SourceObservationConfidenceBreakdown,
  SourceObservationSourceType,
} from './ecs5ObservationPipeline';
import { stableContentHash } from './ecs5ObservationPipeline';

export type AgencyDataFormat = 'json' | 'geojson' | 'arcgis_rest' | 'rss' | 'html' | 'pdf_link' | 'csv' | 'manual' | 'unknown';
export type IngestionRunStatus = 'success' | 'partial' | 'failed' | 'skipped';
export type AgencyFeedHealthStatus = 'configured' | 'missing_config' | 'unavailable' | 'degraded' | 'stale' | 'intentionally_disabled' | 'unknown';
export type NormalizedAgencyRecordType =
  | 'legal_access'
  | 'closure'
  | 'restriction'
  | 'agency_notice'
  | 'road_condition'
  | 'fire_incident'
  | 'fire_perimeter'
  | 'emergency_notice';

export interface AgencyFeed {
  id: string;
  providerId: ECS5ProviderId | string;
  name: string;
  agencyName: string;
  jurisdiction: string;
  sourceType: SourceObservationSourceType;
  endpointUrl?: string | null;
  dataFormat: AgencyDataFormat;
  updateCadence: string;
  ttlSeconds: number;
  requiresApiKey: boolean;
  enabled: boolean;
  healthStatus: AgencyFeedHealthStatus;
  lastRunAt?: string | null;
  lastSuccessfulRunAt?: string | null;
  lastError?: string | null;
  knownLimitations: string[];
  offlineCacheEligible: boolean;
}

export interface IngestionRun {
  id: string;
  feedId: string;
  startedAt: string;
  completedAt?: string | null;
  status: IngestionRunStatus;
  recordsFetched: number;
  recordsNormalized: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsRemovedOrExpired: number;
  errorSummary?: string | null;
  affectedBbox?: ObservationBBox | null;
}

export interface NormalizedAgencyObservation {
  id: string;
  feedId: string;
  providerId: ECS5ProviderId | string;
  observationId: string;
  recordType: NormalizedAgencyRecordType;
  geometry: ObservationGeometry | null;
  effectiveStartAt?: string | null;
  effectiveEndAt?: string | null;
  observedAt?: string | null;
  publishedAt?: string | null;
  ingestedAt: string;
  expiresAt?: string | null;
  contentHash: string;
  normalizedPayload: Record<string, unknown>;
  evidenceUrl?: string | null;
  confidenceScore: number;
  confidenceBreakdown: SourceObservationConfidenceBreakdown;
  knownLimitations: string[];
  historical?: boolean;
}

export interface AgencyIngestionResult {
  run: IngestionRun;
  observations: NormalizedAgencyObservation[];
  scopedConflictDetection: {
    triggered: boolean;
    affectedBbox: ObservationBBox | null;
    routeIds: string[];
    tripIds: string[];
  };
}

export interface AgencyIngestionStoreSnapshot {
  observations: NormalizedAgencyObservation[];
  runs: IngestionRun[];
  feeds: AgencyFeed[];
  conflictTriggers: Array<{ feedId: string; affectedBbox: ObservationBBox | null; routeIds: string[]; tripIds: string[] }>;
}

export const USFS_MVUM_LIMITATIONS = [
  'legal_designation_not_passability',
  'legal_does_not_mean_prudent',
  'route_condition_not_guaranteed',
  'must_verify_current_forest_orders',
] as const;

export const BLM_PLAD_LIMITATIONS = [
  'mapped_access_does_not_allow_general_use_of_non_blm_lands',
  'access_data_living_dataset',
  'current_conditions_not_guaranteed',
] as const;

export const NPS_AGENCY_LIMITATIONS = [
  'applies_to_nps_units',
  'endpoint_coverage_varies_by_park',
] as const;

export function createAgencyFeed(input: Partial<AgencyFeed> & Pick<AgencyFeed, 'id' | 'providerId' | 'name' | 'agencyName'>): AgencyFeed {
  return {
    jurisdiction: input.jurisdiction ?? 'unknown',
    sourceType: input.sourceType ?? defaultAgencySourceType(input.providerId),
    endpointUrl: input.endpointUrl ?? null,
    dataFormat: input.dataFormat ?? 'unknown',
    updateCadence: input.updateCadence ?? 'unknown',
    ttlSeconds: input.ttlSeconds ?? 86_400,
    requiresApiKey: input.requiresApiKey ?? false,
    enabled: input.enabled ?? true,
    healthStatus: input.healthStatus ?? 'unknown',
    lastRunAt: input.lastRunAt ?? null,
    lastSuccessfulRunAt: input.lastSuccessfulRunAt ?? null,
    lastError: input.lastError ?? null,
    knownLimitations: input.knownLimitations ?? defaultAgencyLimitations(input.providerId),
    offlineCacheEligible: input.offlineCacheEligible ?? true,
    ...input,
  };
}

export class AgencyIngestionMemoryStore {
  private observationsByKey = new Map<string, NormalizedAgencyObservation>();
  private runs: IngestionRun[] = [];
  private feeds = new Map<string, AgencyFeed>();
  private conflictTriggers: AgencyIngestionStoreSnapshot['conflictTriggers'] = [];

  upsertFeed(feed: AgencyFeed): void {
    this.feeds.set(feed.id, { ...feed });
  }

  ingest(feed: AgencyFeed, rawPayload: unknown, now = new Date()): AgencyIngestionResult {
    this.upsertFeed(feed);
    const run = startRun(feed, now);
    if (!feed.enabled) {
      const skipped = completeRun(run, 'skipped', 'Feed disabled.', [], [], now);
      this.runs.push(skipped);
      return resultForRun(skipped, [], false, null, [], []);
    }

    try {
      if (rawPayload instanceof Error) throw rawPayload;
      const normalized = normalizeAgencyFeedPayload(feed, rawPayload, now);
      const previousCount = this.observationsByKey.size;
      let created = 0;
      let updated = 0;
      for (const observation of normalized) {
        const key = `${observation.feedId}:${observation.observationId}`;
        const existing = this.observationsByKey.get(key);
        if (!existing) {
          this.observationsByKey.set(key, observation);
          created += 1;
        } else if (existing.contentHash !== observation.contentHash) {
          this.observationsByKey.set(key, { ...observation, id: existing.id });
          updated += 1;
        }
      }
      const expired = this.expireRecords(now);
      const affectedBbox = combineBboxes(normalized.map((observation) => observation.geometry ? geometryBbox(observation.geometry) : null));
      const completed = {
        ...run,
        completedAt: now.toISOString(),
        status: normalized.length > 0 ? 'success' as const : 'partial' as const,
        recordsFetched: countRawRecords(rawPayload),
        recordsNormalized: normalized.length,
        recordsCreated: created,
        recordsUpdated: updated,
        recordsRemovedOrExpired: expired,
        affectedBbox,
      };
      this.runs.push(completed);
      const currentFeed = {
        ...feed,
        healthStatus: normalized.length > 0 ? 'configured' as const : 'degraded' as const,
        lastRunAt: now.toISOString(),
        lastSuccessfulRunAt: normalized.length > 0 ? now.toISOString() : feed.lastSuccessfulRunAt ?? null,
        lastError: normalized.length > 0 ? null : 'No records normalized; schema may have drifted.',
      };
      this.feeds.set(feed.id, currentFeed);
      const changed = created > 0 || updated > 0 || expired > 0 || previousCount !== this.observationsByKey.size;
      if (changed) {
        this.conflictTriggers.push({ feedId: feed.id, affectedBbox, routeIds: [], tripIds: [] });
      }
      return resultForRun(completed, normalized, changed, affectedBbox, [], []);
    } catch (error: any) {
      const failed = completeRun(run, 'failed', error?.message ?? 'Agency ingestion failed.', [], [], now);
      this.runs.push(failed);
      this.feeds.set(feed.id, {
        ...feed,
        healthStatus: /schema|normalize|unsupported/i.test(String(error?.message)) ? 'degraded' : 'unavailable',
        lastRunAt: now.toISOString(),
        lastError: sanitizeError(error?.message),
      });
      return resultForRun(failed, [], false, null, [], []);
    }
  }

  addManualObservation(input: {
    feed: AgencyFeed;
    recordType: NormalizedAgencyRecordType;
    title: string;
    status?: string | null;
    geometry?: ObservationGeometry | null;
    sourceUrl?: string | null;
    documentRef?: string | null;
    createdBy: string;
    markedOfficial?: boolean;
    effectiveStartAt?: string | null;
    effectiveEndAt?: string | null;
    expiresAt?: string | null;
    notes?: string | null;
  }, now = new Date()): NormalizedAgencyObservation {
    const observation = createObservation({
      feed: input.feed,
      observationId: `manual:${stableContentHash({ title: input.title, sourceUrl: input.sourceUrl, documentRef: input.documentRef })}`,
      recordType: input.recordType,
      geometry: input.geometry ?? null,
      observedAt: now.toISOString(),
      publishedAt: now.toISOString(),
      effectiveStartAt: normalizeTimestamp(input.effectiveStartAt) ?? now.toISOString(),
      effectiveEndAt: normalizeTimestamp(input.effectiveEndAt),
      expiresAt: normalizeTimestamp(input.expiresAt ?? input.effectiveEndAt),
      evidenceUrl: input.sourceUrl ?? input.documentRef ?? null,
      payload: {
        title: input.title,
        status: input.status ?? null,
        notes: input.notes ?? null,
        createdBy: input.createdBy,
        sourceUrl: input.sourceUrl ?? null,
        documentRef: input.documentRef ?? null,
        markedOfficial: input.markedOfficial === true,
        sourceCaveat: input.markedOfficial === true
          ? 'Manual entry marked sourced by admin; verify source document before treating as official.'
          : 'Manual agency ingestion is not official API data unless explicitly marked and sourced.',
      },
      confidenceScore: input.markedOfficial === true && (input.sourceUrl || input.documentRef) ? 76 : 58,
      now,
    });
    this.observationsByKey.set(`${observation.feedId}:${observation.observationId}`, observation);
    this.upsertFeed(input.feed);
    this.conflictTriggers.push({ feedId: input.feed.id, affectedBbox: observation.geometry ? geometryBbox(observation.geometry) : null, routeIds: [], tripIds: [] });
    return observation;
  }

  expireRecords(now = new Date()): number {
    let expired = 0;
    for (const [key, observation] of this.observationsByKey) {
      if (observation.historical === true) continue;
      const endAt = observation.expiresAt ?? observation.effectiveEndAt;
      if (endAt && Date.parse(endAt) <= now.getTime()) {
        this.observationsByKey.set(key, {
          ...observation,
          historical: true,
          normalizedPayload: {
            ...observation.normalizedPayload,
            active: false,
            historicalReason: 'Observation expired and should remain evidence only.',
          },
        });
        expired += 1;
      }
    }
    return expired;
  }

  getBlockingObservations(now = new Date()): NormalizedAgencyObservation[] {
    this.expireRecords(now);
    return [...this.observationsByKey.values()].filter((observation) =>
      observation.historical !== true &&
      (observation.recordType === 'closure' || observation.recordType === 'restriction' || observation.recordType === 'emergency_notice'));
  }

  snapshot(): AgencyIngestionStoreSnapshot {
    return {
      observations: [...this.observationsByKey.values()],
      runs: [...this.runs],
      feeds: [...this.feeds.values()],
      conflictTriggers: [...this.conflictTriggers],
    };
  }
}

export function normalizeAgencyFeedPayload(feed: AgencyFeed, rawPayload: unknown, now = new Date()): NormalizedAgencyObservation[] {
  switch (feed.providerId) {
    case 'usfs_mvum':
      return normalizeUsfsMvum(feed, rawPayload, now);
    case 'blm_plad':
      return normalizeBlmPlad(feed, rawPayload, now);
    case 'nps':
      return normalizeNpsAlerts(feed, rawPayload, now);
    case 'state_dot_511':
      return normalizeStateDot511(feed, rawPayload, now);
    case 'state_fire_agency':
      return normalizeGenericAgencyFeatures(feed, rawPayload, now, 'fire_incident');
    case 'county_emergency':
      return normalizeGenericAgencyFeatures(feed, rawPayload, now, 'emergency_notice');
    case 'manual_agency_ingestion':
      return normalizeManualPayload(feed, rawPayload, now);
    default:
      return normalizeGenericAgencyFeatures(feed, rawPayload, now, 'agency_notice');
  }
}

export function normalizeUsfsMvum(feed: AgencyFeed, rawPayload: unknown, now = new Date()): NormalizedAgencyObservation[] {
  return featureRecords(rawPayload).map((feature, index) => {
    const props = propertiesOf(feature);
    const routeId = props.route_id ?? props.RouteID ?? props.ROADNO ?? props.TrailNo ?? props.name ?? `mvum-${index}`;
    return createObservation({
      feed: { ...feed, knownLimitations: [...USFS_MVUM_LIMITATIONS] },
      observationId: String(routeId),
      recordType: 'legal_access',
      geometry: normalizeGeometry(feature.geometry ?? props.geometry),
      observedAt: normalizeTimestamp(props.observedAt ?? props.last_edited_date),
      publishedAt: normalizeTimestamp(props.publishedAt ?? props.published_at),
      effectiveStartAt: normalizeTimestamp(props.open_date ?? props.season_start),
      effectiveEndAt: normalizeTimestamp(props.close_date ?? props.season_end),
      evidenceUrl: nullableString(props.evidenceUrl ?? props.url ?? feed.endpointUrl),
      payload: {
        roadTrailId: routeId,
        vehicleClassAllowance: props.vehicle_class ?? props.VehicleClass ?? props.allowed_vehicle_classes ?? props.OPEN_TO,
        seasonalAllowance: props.seasonal ?? props.Seasonal ?? props.season,
        allowedDates: props.allowed_dates ?? buildAllowedDates(props.open_date, props.close_date),
        routeDesignation: props.designation ?? props.RouteDesignation ?? props.MVUM_DESIG,
        sourceForestUnit: props.forest ?? props.FORESTNAME ?? props.unit ?? feed.jurisdiction,
        legalAccessStatus: props.status ?? 'mapped_legal_access',
        passabilityStatus: 'unknown',
        caveat: 'MVUM legal designation is separate from current passability and current closure orders.',
      },
      confidenceScore: 88,
      now,
    });
  });
}

export function normalizeBlmPlad(feed: AgencyFeed, rawPayload: unknown, now = new Date()): NormalizedAgencyObservation[] {
  return featureRecords(rawPayload).map((feature, index) => {
    const props = propertiesOf(feature);
    const id = props.access_id ?? props.ACCESS_ID ?? props.OBJECTID ?? `blm-plad-${index}`;
    return createObservation({
      feed: { ...feed, knownLimitations: [...BLM_PLAD_LIMITATIONS] },
      observationId: String(id),
      recordType: 'legal_access',
      geometry: normalizeGeometry(feature.geometry ?? props.geometry),
      observedAt: normalizeTimestamp(props.observedAt ?? props.updated),
      publishedAt: normalizeTimestamp(props.publishedAt ?? props.created),
      evidenceUrl: nullableString(props.evidenceUrl ?? props.url ?? feed.endpointUrl),
      payload: {
        accessId: id,
        accessType: props.access_type ?? props.AccessType ?? props.TYPE,
        jurisdiction: props.jurisdiction ?? props.admin_unit ?? feed.jurisdiction,
        constraints: props.constraints ?? props.notes ?? null,
        legalAccessStatus: props.status ?? 'mapped_access',
        passabilityStatus: 'unknown',
        caveat: 'BLM PLAD access data is a living dataset and does not guarantee current conditions or access across non-BLM lands.',
      },
      confidenceScore: 86,
      now,
    });
  });
}

export function normalizeNpsAlerts(feed: AgencyFeed, rawPayload: unknown, now = new Date()): NormalizedAgencyObservation[] {
  return arrayRecords((rawPayload as any)?.data ?? rawPayload).map((record, index) => {
    const text = `${record.title ?? ''} ${record.description ?? ''} ${record.category ?? ''}`;
    const recordType: NormalizedAgencyRecordType = /closure|closed|road closed/i.test(text)
      ? 'closure'
      : /restriction|limited|permit/i.test(text)
        ? 'restriction'
        : 'agency_notice';
    return createObservation({
      feed: { ...feed, knownLimitations: [...NPS_AGENCY_LIMITATIONS] },
      observationId: String(record.id ?? record.url ?? `nps-alert-${index}`),
      recordType,
      geometry: normalizeGeometry(record.geometry),
      observedAt: normalizeTimestamp(record.lastIndexedDate ?? record.updatedAt),
      publishedAt: normalizeTimestamp(record.lastIndexedDate ?? record.createdAt),
      effectiveStartAt: normalizeTimestamp(record.effectiveStartAt),
      effectiveEndAt: normalizeTimestamp(record.expirationDate ?? record.effectiveEndAt),
      expiresAt: normalizeTimestamp(record.expirationDate),
      evidenceUrl: nullableString(record.url ?? feed.endpointUrl),
      payload: {
        title: record.title ?? null,
        category: record.category ?? null,
        parkCode: record.parkCode ?? null,
        description: record.description ?? null,
        status: recordType === 'closure' ? 'closure_warning' : 'notice',
        legalClosureSignal: recordType === 'closure',
      },
      confidenceScore: recordType === 'closure' ? 90 : 82,
      now,
    });
  });
}

export function normalizeStateDot511(feed: AgencyFeed, rawPayload: unknown, now = new Date()): NormalizedAgencyObservation[] {
  return arrayRecords((rawPayload as any)?.events ?? (rawPayload as any)?.items ?? rawPayload).map((record, index) => {
    const text = `${record.type ?? ''} ${record.event_type ?? ''} ${record.description ?? ''} ${record.status ?? ''}`;
    const recordType: NormalizedAgencyRecordType = /closure|closed|blocked/i.test(text)
      ? 'closure'
      : /restriction|chain|detour|construction/i.test(text)
        ? 'restriction'
        : 'road_condition';
    return createObservation({
      feed,
      observationId: String(record.id ?? record.eventId ?? `state-dot-${index}`),
      recordType,
      geometry: normalizeGeometry(record.geometry) ?? pointGeometry(record.latitude, record.longitude),
      observedAt: normalizeTimestamp(record.updatedAt ?? record.lastUpdated),
      publishedAt: normalizeTimestamp(record.createdAt ?? record.startTime),
      effectiveStartAt: normalizeTimestamp(record.startTime),
      effectiveEndAt: normalizeTimestamp(record.endTime),
      expiresAt: normalizeTimestamp(record.endTime),
      evidenceUrl: nullableString(record.url ?? feed.endpointUrl),
      payload: {
        title: record.title ?? record.type ?? null,
        roadName: record.roadName ?? record.route ?? null,
        description: record.description ?? null,
        status: record.status ?? (recordType === 'closure' ? 'closed' : 'active'),
        detour: record.detour ?? null,
        jurisdiction: feed.jurisdiction,
        backcountryLegalityAuthority: false,
      },
      confidenceScore: recordType === 'closure' ? 88 : 78,
      now,
    });
  });
}

export function normalizeManualPayload(feed: AgencyFeed, rawPayload: unknown, now = new Date()): NormalizedAgencyObservation[] {
  return arrayRecords(rawPayload).map((record, index) => createObservation({
    feed,
    observationId: String(record.id ?? record.sourceUrl ?? `manual-${index}`),
    recordType: normalizeRecordType(record.recordType ?? record.type),
    geometry: normalizeGeometry(record.geometry),
    observedAt: normalizeTimestamp(record.observedAt) ?? now.toISOString(),
    publishedAt: normalizeTimestamp(record.publishedAt),
    effectiveStartAt: normalizeTimestamp(record.effectiveStartAt),
    effectiveEndAt: normalizeTimestamp(record.effectiveEndAt),
    expiresAt: normalizeTimestamp(record.expiresAt ?? record.effectiveEndAt),
    evidenceUrl: nullableString(record.sourceUrl ?? record.documentRef),
    payload: {
      ...sanitizePayload(record),
      sourceCaveat: record.markedOfficial === true
        ? 'Manual record marked sourced by admin; verify source document.'
        : 'Manual ingestion fills gaps and must not silently act as official agency data.',
    },
    confidenceScore: record.markedOfficial === true ? 76 : 58,
    now,
  }));
}

export function normalizeGenericAgencyFeatures(
  feed: AgencyFeed,
  rawPayload: unknown,
  now = new Date(),
  fallbackType: NormalizedAgencyRecordType,
): NormalizedAgencyObservation[] {
  return featureRecords(rawPayload).map((feature, index) => {
    const props = propertiesOf(feature);
    return createObservation({
      feed,
      observationId: String(props.id ?? props.OBJECTID ?? props.GlobalID ?? `agency-${index}`),
      recordType: normalizeRecordType(props.recordType ?? props.type ?? fallbackType),
      geometry: normalizeGeometry(feature.geometry ?? props.geometry),
      observedAt: normalizeTimestamp(props.observedAt ?? props.updatedAt ?? props.updated),
      publishedAt: normalizeTimestamp(props.publishedAt ?? props.createdAt),
      effectiveStartAt: normalizeTimestamp(props.effectiveStartAt ?? props.startTime),
      effectiveEndAt: normalizeTimestamp(props.effectiveEndAt ?? props.endTime),
      expiresAt: normalizeTimestamp(props.expiresAt ?? props.endTime),
      evidenceUrl: nullableString(props.evidenceUrl ?? props.url ?? feed.endpointUrl),
      payload: sanitizePayload(props),
      confidenceScore: feed.sourceType === 'official_api' || feed.sourceType === 'official_gis' ? 82 : 68,
      now,
    });
  });
}

export function createObservation(input: {
  feed: AgencyFeed;
  observationId: string;
  recordType: NormalizedAgencyRecordType;
  geometry: ObservationGeometry | null;
  effectiveStartAt?: string | null;
  effectiveEndAt?: string | null;
  observedAt?: string | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  evidenceUrl?: string | null;
  payload: Record<string, unknown>;
  confidenceScore: number;
  now: Date;
}): NormalizedAgencyObservation {
  const ingestedAt = input.now.toISOString();
  const payload = sanitizePayload(input.payload);
  const contentHash = stableContentHash({
    providerId: input.feed.providerId,
    observationId: input.observationId,
    recordType: input.recordType,
    geometry: input.geometry,
    payload,
    effectiveStartAt: input.effectiveStartAt ?? null,
    effectiveEndAt: input.effectiveEndAt ?? null,
  });
  return {
    id: `${input.feed.id}:${input.observationId}`,
    feedId: input.feed.id,
    providerId: input.feed.providerId,
    observationId: input.observationId,
    recordType: input.recordType,
    geometry: input.geometry,
    effectiveStartAt: input.effectiveStartAt ?? null,
    effectiveEndAt: input.effectiveEndAt ?? null,
    observedAt: input.observedAt ?? null,
    publishedAt: input.publishedAt ?? null,
    ingestedAt,
    expiresAt: input.expiresAt ?? defaultExpiry(input.feed, ingestedAt),
    contentHash,
    normalizedPayload: payload,
    evidenceUrl: input.evidenceUrl ?? null,
    confidenceScore: clamp(input.confidenceScore, 0, 100),
    confidenceBreakdown: {
      providerDefault: clamp(input.confidenceScore, 0, 100),
      freshness: 84,
      sourceAuthority: clamp(input.confidenceScore, 0, 100),
      completeness: input.geometry ? 82 : 66,
      stalePenalty: 0,
    },
    knownLimitations: [...input.feed.knownLimitations],
  };
}

function startRun(feed: AgencyFeed, now: Date): IngestionRun {
  return {
    id: `${feed.id}:run:${now.getTime()}`,
    feedId: feed.id,
    startedAt: now.toISOString(),
    completedAt: null,
    status: 'partial',
    recordsFetched: 0,
    recordsNormalized: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsRemovedOrExpired: 0,
    errorSummary: null,
    affectedBbox: null,
  };
}

function completeRun(
  run: IngestionRun,
  status: IngestionRunStatus,
  errorSummary: string | null,
  fetched: unknown[],
  normalized: unknown[],
  now: Date,
): IngestionRun {
  return {
    ...run,
    completedAt: now.toISOString(),
    status,
    recordsFetched: fetched.length,
    recordsNormalized: normalized.length,
    errorSummary,
  };
}

function resultForRun(
  run: IngestionRun,
  observations: NormalizedAgencyObservation[],
  triggered: boolean,
  affectedBbox: ObservationBBox | null,
  routeIds: string[],
  tripIds: string[],
): AgencyIngestionResult {
  return {
    run,
    observations,
    scopedConflictDetection: { triggered, affectedBbox, routeIds, tripIds },
  };
}

function featureRecords(rawPayload: unknown): Array<Record<string, any>> {
  if (Array.isArray((rawPayload as any)?.features)) return (rawPayload as any).features.filter(isRecord);
  if (Array.isArray(rawPayload)) return rawPayload.filter(isRecord);
  if (isRecord(rawPayload) && ('properties' in rawPayload || 'geometry' in rawPayload)) return [rawPayload];
  if (isRecord(rawPayload) && Array.isArray(rawPayload.items)) return rawPayload.items.filter(isRecord);
  if (isRecord(rawPayload) && Array.isArray(rawPayload.data)) return rawPayload.data.filter(isRecord);
  return [];
}

function arrayRecords(value: unknown): Array<Record<string, any>> {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.items)) return value.items.filter(isRecord);
  if (isRecord(value)) return [value];
  return [];
}

function propertiesOf(feature: Record<string, any>): Record<string, any> {
  return isRecord(feature.properties) ? feature.properties : feature;
}

function normalizeRecordType(value: unknown): NormalizedAgencyRecordType {
  const raw = String(value ?? '').toLowerCase();
  if (raw.includes('legal')) return 'legal_access';
  if (raw.includes('closure') || raw.includes('closed')) return 'closure';
  if (raw.includes('restriction')) return 'restriction';
  if (raw.includes('road')) return 'road_condition';
  if (raw.includes('perimeter')) return 'fire_perimeter';
  if (raw.includes('fire')) return 'fire_incident';
  if (raw.includes('emergency') || raw.includes('evacuation')) return 'emergency_notice';
  return 'agency_notice';
}

function defaultAgencySourceType(providerId: string): SourceObservationSourceType {
  if (providerId === 'usfs_mvum' || providerId === 'blm_plad') return 'official_gis';
  if (providerId === 'state_dot_511' || providerId === 'state_fire_agency') return 'state_agency';
  if (providerId === 'county_emergency') return 'local_agency';
  if (providerId === 'manual_agency_ingestion') return 'manual_admin';
  return 'official_api';
}

function defaultAgencyLimitations(providerId: string): string[] {
  if (providerId === 'usfs_mvum') return [...USFS_MVUM_LIMITATIONS];
  if (providerId === 'blm_plad') return [...BLM_PLAD_LIMITATIONS];
  if (providerId === 'nps') return [...NPS_AGENCY_LIMITATIONS];
  return [];
}

function normalizeGeometry(value: unknown): ObservationGeometry | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (type === 'Point' || type === 'LineString' || type === 'Polygon' || type === 'MultiPolygon' || type === 'GeometryCollection') {
    return { type, coordinates: value.coordinates ?? null };
  }
  return null;
}

function pointGeometry(lat: unknown, lon: unknown): ObservationGeometry | null {
  const latitude = toNumber(lat);
  const longitude = toNumber(lon);
  return latitude != null && longitude != null ? { type: 'Point', coordinates: [longitude, latitude] } : null;
}

function geometryBbox(geometry: ObservationGeometry | null): ObservationBBox | null {
  if (!geometry) return null;
  const coords: number[][] = [];
  collectPairs(geometry.coordinates, coords);
  if (coords.length === 0) return null;
  const lons = coords.map((pair) => pair[0]);
  const lats = coords.map((pair) => pair[1]);
  return { minLat: Math.min(...lats), minLon: Math.min(...lons), maxLat: Math.max(...lats), maxLon: Math.max(...lons) };
}

function collectPairs(value: unknown, output: number[][]): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    output.push([value[0], value[1]]);
    return;
  }
  value.forEach((entry) => collectPairs(entry, output));
}

function combineBboxes(bboxes: Array<ObservationBBox | null>): ObservationBBox | null {
  const valid = bboxes.filter(Boolean) as ObservationBBox[];
  if (valid.length === 0) return null;
  return {
    minLat: Math.min(...valid.map((box) => box.minLat)),
    minLon: Math.min(...valid.map((box) => box.minLon)),
    maxLat: Math.max(...valid.map((box) => box.maxLat)),
    maxLon: Math.max(...valid.map((box) => box.maxLon)),
  };
}

function buildAllowedDates(start: unknown, end: unknown): string | null {
  if (!start && !end) return null;
  return [start ? `start:${start}` : null, end ? `end:${end}` : null].filter(Boolean).join(';');
}

function defaultExpiry(feed: AgencyFeed, ingestedAt: string): string | null {
  return feed.ttlSeconds > 0 ? new Date(Date.parse(ingestedAt) + feed.ttlSeconds * 1000).toISOString() : null;
}

function countRawRecords(rawPayload: unknown): number {
  return featureRecords(rawPayload).length || arrayRecords(rawPayload).length || 0;
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/api[_-]?key|token|secret|password/i.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

function sanitizeError(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 240);
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
