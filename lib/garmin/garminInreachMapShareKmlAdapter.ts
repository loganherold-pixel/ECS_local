import type { CreateEventInput } from '../expeditionEventStore';
import {
  supportsGarminMapShareKmlIngestion,
  type GarminInreachIntegrationConfig,
} from './garminInreachConfig';
import { stableHashGarminIdentifier } from './garminInreachAdapter';
import type {
  GarminInreachDomainEvent,
  GarminInreachDomainEventBase,
} from './garminInreachEventNormalizer';

export const GARMIN_MAPSHARE_SOURCE = 'garmin_mapshare_kml' as const;
const GARMIN_MAPSHARE_DEMO_URL = 'demo://garmin-mapshare/synthetic.kml';
const STALE_WARNING = 'Garmin MapShare feed has not produced a recent location update.';

export type GarminMapShareParseWarningCode =
  | 'missing_timestamp'
  | 'invalid_coordinates'
  | 'unsupported_placemark'
  | 'empty_feed'
  | 'malformed_xml';

export interface GarminMapShareParsedPlacemark {
  label: string | null;
  message: string | null;
  sourceTimestamp: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  rawPlacemarkHash: string;
  warnings: GarminMapShareParseWarningCode[];
}

export interface GarminMapShareFeedConfig {
  url: string;
  id?: string | null;
  label?: string | null;
  displayName?: string | null;
  expeditionId?: string | null;
  teamMemberId?: string | null;
  vehicleId?: string | null;
  deviceId?: string | null;
  enabled?: boolean;
  pollIntervalSeconds?: number | null;
  staleAfterMinutes?: number | null;
  demo?: boolean;
}

export interface GarminMapShareLocationTimelineEvent {
  id: string;
  source: typeof GARMIN_MAPSHARE_SOURCE;
  kind: 'location_update';
  sourceFeedId: string;
  sourceHash: string;
  feedUrl: string;
  feedLabel: string;
  latitude: number;
  longitude: number;
  elevationMeters?: number | null;
  sourceTimestamp: string | null;
  occurredAt: string;
  polledAt: string;
  ingestedAt: string;
  sourceSchemaVersion: 'kml';
  demo: boolean;
  association: {
    expeditionId?: string | null;
    teamMemberId?: string | null;
    vehicleId?: string | null;
    deviceId?: string | null;
  };
  expeditionEvent: CreateEventInput;
  metadata: {
    waypointName?: string | null;
    waypointDescription?: string | null;
    stale: boolean;
    ageMs: number | null;
    parseWarnings: GarminMapShareParseWarningCode[];
    dataQualityWarnings: string[];
  };
}

export interface GarminMapShareFieldMessageEvent {
  id: string;
  source: typeof GARMIN_MAPSHARE_SOURCE;
  kind: 'field_message';
  sourceFeedId: string;
  sourceHash: string;
  feedLabel: string;
  messageText: string;
  occurredAt: string;
  ingestedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  demo: boolean;
}

export type GarminMapShareNormalizedEvent =
  | GarminMapShareLocationTimelineEvent
  | GarminMapShareFieldMessageEvent
  | GarminMapShareStaleWarning;

export interface GarminMapShareStaleWarning {
  id: string;
  source: typeof GARMIN_MAPSHARE_SOURCE;
  kind: 'data_quality_warning';
  sourceFeedId: string;
  feedLabel: string;
  message: string;
  occurredAt: string;
  ingestedAt: string;
  stale: true;
  demo: boolean;
}

export interface GarminMapShareFeedResult {
  feed: GarminMapShareFeedConfig;
  ok: boolean;
  status:
    | 'parsed'
    | 'empty'
    | 'invalid_url'
    | 'fetch_failed'
    | 'parse_failed'
    | 'disabled';
  polledAt: string;
  lastFetchedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  lastSourceEventAt: string | null;
  lastError: string | null;
  sourceLatestTimestamp: string | null;
  etag?: string | null;
  lastModified?: string | null;
  stale: boolean;
  warning: string | null;
  failureCount: number;
  duplicateCount: number;
  parseWarnings: GarminMapShareParseWarningCode[];
  events: GarminMapShareLocationTimelineEvent[];
  fieldMessages: GarminMapShareFieldMessageEvent[];
  staleWarnings: GarminMapShareStaleWarning[];
  normalizedEvents: GarminMapShareNormalizedEvent[];
}

export interface GarminMapSharePollResult {
  enabled: boolean;
  mode: GarminInreachIntegrationConfig['mode'];
  polledAt: string;
  nextPollAfterMs: number;
  staleAfterMs: number;
  feedResults: GarminMapShareFeedResult[];
  events: GarminMapShareLocationTimelineEvent[];
  fieldMessages: GarminMapShareFieldMessageEvent[];
  staleWarnings: GarminMapShareStaleWarning[];
  normalizedEvents: GarminMapShareNormalizedEvent[];
  warnings: string[];
}

export interface GarminMapSharePollOptions {
  config: GarminInreachIntegrationConfig;
  feeds?: GarminMapShareFeedConfig[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const seenSourceHashes = new Set<string>();
const feedFailureCounts = new Map<string, number>();

export function resetGarminMapShareKmlDedupeForTests(): void {
  seenSourceHashes.clear();
  feedFailureCounts.clear();
}

export function getConfiguredGarminMapShareFeeds(
  config: GarminInreachIntegrationConfig,
  defaults: Partial<Omit<GarminMapShareFeedConfig, 'url'>> = {},
): GarminMapShareFeedConfig[] {
  const feeds = config.kmlFeeds.map((url, index) => ({
    ...defaults,
    id: defaults.id ?? `garmin-mapshare-feed-${index + 1}`,
    url,
    label: defaults.label ?? defaults.displayName ?? `Garmin MapShare Feed ${index + 1}`,
    displayName: defaults.displayName ?? defaults.label ?? `Garmin MapShare Feed ${index + 1}`,
    enabled: defaults.enabled ?? true,
  }));

  if (supportsGarminMapShareKmlIngestion(config) && config.demoKmlEnabled) {
    feeds.push({
      ...defaults,
      id: 'garmin-mapshare-demo',
      url: GARMIN_MAPSHARE_DEMO_URL,
      label: 'Demo Garmin MapShare Feed',
      displayName: 'Demo Garmin MapShare Feed',
      enabled: true,
      demo: true,
    });
  }

  return feeds;
}

export function shouldPollGarminMapShare(config: GarminInreachIntegrationConfig): boolean {
  return supportsGarminMapShareKmlIngestion(config) &&
    (config.kmlFeeds.length > 0 || config.demoKmlEnabled);
}

export async function pollGarminMapShareKmlFeeds(
  options: GarminMapSharePollOptions,
): Promise<GarminMapSharePollResult> {
  const polledAt = (options.now?.() ?? new Date()).toISOString();
  const feeds = options.feeds ?? getConfiguredGarminMapShareFeeds(options.config);
  const enabled = supportsGarminMapShareKmlIngestion(options.config);

  if (!enabled) {
    return {
      enabled: false,
      mode: options.config.mode,
      polledAt,
      nextPollAfterMs: options.config.mapSharePollIntervalMs,
      staleAfterMs: options.config.mapShareStaleAfterMs,
      feedResults: feeds.map((feed) => disabledFeedResult(feed, polledAt)),
      events: [],
      fieldMessages: [],
      staleWarnings: [],
      normalizedEvents: [],
      warnings: [],
    };
  }

  const feedResults: GarminMapShareFeedResult[] = [];
  for (const feed of feeds) {
    if (feed.enabled === false) {
      feedResults.push(disabledFeedResult(feed, polledAt));
      continue;
    }
    feedResults.push(await pollSingleFeed(feed, options, polledAt));
  }

  return {
    enabled: true,
    mode: options.config.mode,
    polledAt,
    nextPollAfterMs: options.config.mapSharePollIntervalMs,
    staleAfterMs: options.config.mapShareStaleAfterMs,
    feedResults,
    events: feedResults.flatMap((result) => result.events),
    fieldMessages: feedResults.flatMap((result) => result.fieldMessages),
    staleWarnings: feedResults.flatMap((result) => result.staleWarnings),
    normalizedEvents: feedResults.flatMap((result) => result.normalizedEvents),
    warnings: feedResults.map((result) => result.warning).filter((warning): warning is string => !!warning),
  };
}

export function parseGarminMapShareKml(input: {
  kml: string;
}): { placemarks: GarminMapShareParsedPlacemark[]; warnings: GarminMapShareParseWarningCode[] } {
  const trimmed = String(input.kml ?? '').trim();
  if (!trimmed) return { placemarks: [], warnings: ['empty_feed'] };
  if (!hasKmlRoot(trimmed)) return { placemarks: [], warnings: ['malformed_xml'] };

  const placemarkXmls = extractAllTagBlocks(trimmed, 'Placemark');
  if (placemarkXmls.length === 0) return { placemarks: [], warnings: ['empty_feed'] };

  const placemarks: GarminMapShareParsedPlacemark[] = [];
  const warnings: GarminMapShareParseWarningCode[] = [];

  for (const placemarkXml of placemarkXmls) {
    const pointBlock = extractTagContent(placemarkXml, 'Point');
    const coordinatesRaw = pointBlock ? extractTagContent(pointBlock, 'coordinates') : null;
    if (!coordinatesRaw) {
      warnings.push('unsupported_placemark');
      continue;
    }

    const coordinates = parsePointCoordinates(coordinatesRaw);
    if (!coordinates) {
      warnings.push('invalid_coordinates');
      continue;
    }

    const sourceTimestamp = normalizeTimestamp(extractTagContent(placemarkXml, 'when'));
    const recordWarnings: GarminMapShareParseWarningCode[] = [];
    if (!sourceTimestamp) recordWarnings.push('missing_timestamp');

    const label = sanitizeKmlText(extractTagContent(placemarkXml, 'name'));
    const message = sanitizeKmlText(extractTagContent(placemarkXml, 'description'));
    const rawPlacemarkHash = stableHashGarminIdentifier([
      label ?? '',
      message ?? '',
      sourceTimestamp ?? '',
      coordinates.latitude,
      coordinates.longitude,
      coordinates.altitude ?? '',
    ].join('|'));

    placemarks.push({
      label,
      message,
      sourceTimestamp,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      altitude: coordinates.altitude,
      rawPlacemarkHash,
      warnings: recordWarnings,
    });
    warnings.push(...recordWarnings);
  }

  return { placemarks, warnings: uniqueWarnings(warnings) };
}

export function parseGarminMapShareKmlToLocationEvents(input: {
  kml: string;
  feed: GarminMapShareFeedConfig;
  polledAt: string;
  staleAfterMs: number;
  dedupe?: boolean;
}): GarminMapShareFeedResult {
  const parsed = parseGarminMapShareKml({ kml: input.kml });
  if (parsed.warnings.includes('malformed_xml')) {
    return failedParseResult(input.feed, input.polledAt, 'Garmin MapShare KML feed could not be parsed.', parsed.warnings);
  }

  if (parsed.placemarks.length === 0) {
    return {
      ...baseFeedResult(input.feed, input.polledAt),
      ok: true,
      status: 'empty',
      warning: 'Garmin MapShare KML feed was empty.',
      parseWarnings: parsed.warnings.length > 0 ? parsed.warnings : ['empty_feed'],
    };
  }

  const feedId = getFeedId(input.feed);
  const events: GarminMapShareLocationTimelineEvent[] = [];
  const fieldMessages: GarminMapShareFieldMessageEvent[] = [];
  let duplicateCount = 0;

  for (const placemark of parsed.placemarks) {
    const sourceHash = computeGarminMapShareSourceHash({
      feedId,
      sourceTimestamp: placemark.sourceTimestamp,
      latitude: placemark.latitude,
      longitude: placemark.longitude,
      altitude: placemark.altitude,
      label: placemark.label,
      message: placemark.message,
    });

    if (input.dedupe === true) {
      if (seenSourceHashes.has(sourceHash)) {
        duplicateCount += 1;
        continue;
      }
      seenSourceHashes.add(sourceHash);
    }

    const event = placemarkToLocationEvent({
      placemark,
      feed: input.feed,
      polledAt: input.polledAt,
      staleAfterMs: input.staleAfterMs,
      sourceHash,
    });
    events.push(event);

    if (placemark.message) {
      fieldMessages.push({
        id: `${event.id}:message`,
        source: GARMIN_MAPSHARE_SOURCE,
        kind: 'field_message',
        sourceFeedId: event.sourceFeedId,
        sourceHash,
        feedLabel: event.feedLabel,
        messageText: placemark.message,
        occurredAt: event.occurredAt,
        ingestedAt: event.ingestedAt,
        latitude: event.latitude,
        longitude: event.longitude,
        demo: event.demo,
      });
    }
  }

  const latest = latestSourceTimestamp(events);
  const stale = isStaleTimestamp(latest, input.polledAt, input.staleAfterMs);
  const staleWarnings = stale ? [buildStaleWarning(input.feed, input.polledAt)] : [];
  const warning = stale ? STALE_WARNING : null;
  const normalizedEvents = [...events, ...fieldMessages, ...staleWarnings];

  return {
    ...baseFeedResult(input.feed, input.polledAt),
    ok: true,
    status: 'parsed',
    lastSuccessfulFetchAt: input.polledAt,
    lastSourceEventAt: latest,
    sourceLatestTimestamp: latest,
    stale,
    warning,
    duplicateCount,
    parseWarnings: parsed.warnings,
    events: events.map((event) => ({
      ...event,
      metadata: {
        ...event.metadata,
        stale,
        ageMs: latest ? Date.parse(input.polledAt) - Date.parse(latest) : null,
        dataQualityWarnings: [
          ...event.metadata.dataQualityWarnings,
          ...(stale ? [STALE_WARNING] : []),
        ],
      },
    })),
    fieldMessages,
    staleWarnings,
    normalizedEvents,
  };
}

export function computeGarminMapShareSourceHash(input: {
  feedId: string;
  sourceTimestamp?: string | null;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  label?: string | null;
  message?: string | null;
}): string {
  return stableHashGarminIdentifier([
    input.feedId,
    input.sourceTimestamp ?? '',
    roundCoordinate(input.latitude),
    roundCoordinate(input.longitude),
    input.altitude ?? '',
    input.label ?? '',
    input.message ?? '',
  ].join('|'));
}

export function mapGarminMapShareEventsToDomainEvents(
  events: GarminMapShareLocationTimelineEvent[],
): GarminInreachDomainEvent[] {
  const domainEvents: GarminInreachDomainEvent[] = [];

  for (const event of events) {
    const base = mapShareBaseDomainEvent(event);
    domainEvents.push({
      ...base,
      kind: 'location_update',
      coordinates: {
        latitude: event.latitude,
        longitude: event.longitude,
        accuracyMeters: null,
      },
      locationSource: GARMIN_MAPSHARE_SOURCE,
    });

    if (event.metadata.waypointDescription) {
      domainEvents.push({
        ...base,
        id: `${base.id}:message`,
        kind: 'field_message',
        garminMessageType: 'mapshare_kml_message',
        messageText: event.metadata.waypointDescription,
        messageSource: GARMIN_MAPSHARE_SOURCE,
        userFacingSummary: event.metadata.waypointDescription,
        metadata: {
          ...base.metadata,
          idempotencyKey: `${base.metadata.idempotencyKey}:message`,
        },
      });
    }
  }

  return domainEvents;
}

async function pollSingleFeed(
  feed: GarminMapShareFeedConfig,
  options: GarminMapSharePollOptions,
  polledAt: string,
): Promise<GarminMapShareFeedResult> {
  if (isDemoFeed(feed)) {
    if (!options.config.demoKmlEnabled) {
      return disabledFeedResult(feed, polledAt);
    }
    return parseGarminMapShareKmlToLocationEvents({
      kml: buildSyntheticDemoKml(polledAt),
      feed: { ...feed, demo: true },
      polledAt,
      staleAfterMs: feedStaleAfterMs(feed, options.config),
      dedupe: true,
    });
  }

  if (!isAllowedFeedUrl(feed.url)) {
    return {
      ...baseFeedResult(feed, polledAt),
      ok: true,
      status: 'invalid_url',
      warning: 'Garmin MapShare feed URL must be an http(s) KML URL provided by the user or admin.',
      lastError: 'Garmin MapShare feed URL must be an http(s) KML URL provided by the user or admin.',
    };
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(feed.url, {
      method: 'GET',
      headers: { Accept: 'application/vnd.google-earth.kml+xml, application/xml, text/xml, */*' },
    });
    if (!response.ok) {
      return failedFetchResult(feed, polledAt, `Garmin MapShare KML feed returned HTTP ${response.status}.`);
    }
    const kml = await response.text();
    const parsed = parseGarminMapShareKmlToLocationEvents({
      kml,
      feed,
      polledAt,
      staleAfterMs: feedStaleAfterMs(feed, options.config),
      dedupe: true,
    });
    return {
      ...parsed,
      etag: getHeader(response, 'etag'),
      lastModified: getHeader(response, 'last-modified'),
      failureCount: 0,
    };
  } catch (error) {
    return failedFetchResult(
      feed,
      polledAt,
      error instanceof Error && error.message ? `Garmin MapShare KML feed could not be reached: ${error.message}` : 'Garmin MapShare KML feed could not be reached.',
    );
  }
}

function placemarkToLocationEvent(input: {
  placemark: GarminMapShareParsedPlacemark;
  feed: GarminMapShareFeedConfig;
  polledAt: string;
  staleAfterMs: number;
  sourceHash: string;
}): GarminMapShareLocationTimelineEvent {
  const sourceTimestamp = input.placemark.sourceTimestamp;
  const occurredAt = sourceTimestamp ?? input.polledAt;
  const stale = isStaleTimestamp(sourceTimestamp, input.polledAt, input.staleAfterMs);
  const ageMs = sourceTimestamp ? Date.parse(input.polledAt) - Date.parse(sourceTimestamp) : null;
  const feedId = getFeedId(input.feed);
  const feedLabel = getFeedLabel(input.feed);
  const dataQualityWarnings = input.placemark.warnings.map((warning) => dataQualityWarningText(warning));

  return {
    id: `garmin-mapshare-${input.sourceHash}`,
    source: GARMIN_MAPSHARE_SOURCE,
    kind: 'location_update',
    sourceFeedId: feedId,
    sourceHash: input.sourceHash,
    feedUrl: input.feed.url,
    feedLabel,
    latitude: input.placemark.latitude,
    longitude: input.placemark.longitude,
    elevationMeters: input.placemark.altitude,
    sourceTimestamp,
    occurredAt,
    polledAt: input.polledAt,
    ingestedAt: input.polledAt,
    sourceSchemaVersion: 'kml',
    demo: input.feed.demo === true,
    association: {
      expeditionId: input.feed.expeditionId ?? null,
      teamMemberId: input.feed.teamMemberId ?? null,
      vehicleId: input.feed.vehicleId ?? null,
      deviceId: input.feed.deviceId ?? null,
    },
    expeditionEvent: {
      expedition_id: input.feed.expeditionId ?? 'expedition-unassigned',
      created_by: GARMIN_MAPSHARE_SOURCE,
      event_type: stale ? 'COMMS' : 'CHECKPOINT',
      severity: stale ? 'MED' : 'LOW',
      title: stale ? 'Garmin MapShare feed stale' : 'Garmin MapShare location',
      details: [
        `${feedLabel} reported a read-only MapShare KML location.`,
        input.placemark.message ? `Message: ${input.placemark.message}.` : '',
        sourceTimestamp ? `Source timestamp: ${sourceTimestamp}.` : 'Source timestamp unavailable.',
        `Polled at: ${input.polledAt}.`,
      ].filter(Boolean).join(' '),
      lat: input.placemark.latitude,
      lon: input.placemark.longitude,
      attachments: [{
        source: GARMIN_MAPSHARE_SOURCE,
        sourceType: 'mapshare_kml',
        sourceFeedId: feedId,
        sourceHash: input.sourceHash,
        sourceTimestamp,
        polledAt: input.polledAt,
        stale,
        demo: input.feed.demo === true,
      }],
    },
    metadata: {
      waypointName: input.placemark.label,
      waypointDescription: input.placemark.message,
      stale,
      ageMs,
      parseWarnings: input.placemark.warnings,
      dataQualityWarnings,
    },
  };
}

function mapShareBaseDomainEvent(event: GarminMapShareLocationTimelineEvent): GarminInreachDomainEventBase {
  return {
    id: event.id,
    kind: 'garmin_unknown_event',
    source: GARMIN_MAPSHARE_SOURCE,
    sourceSchemaVersion: event.sourceSchemaVersion,
    rawMessageCode: null,
    garminMessageType: 'mapshare_kml_location',
    garminTimestamp: event.occurredAt,
    ingestedAt: event.ingestedAt,
    deviceRef: {
      maskedIdentifier: event.association.deviceId ? 'Garmin MapShare device' : 'Garmin MapShare feed',
      identifierHash: stableHashGarminIdentifier(event.association.deviceId ?? event.sourceFeedId),
    },
    dispatchEvent: {
      id: `${event.id}:dispatch`,
      type: 'team_ping',
      severity: event.metadata.stale ? 'watch' : 'info',
      title: event.metadata.stale ? 'Garmin MapShare feed stale' : 'Garmin MapShare location',
      message: event.metadata.waypointDescription || 'Read-only Garmin MapShare location received.',
      details: event.expeditionEvent.details,
      source: 'team_member',
      createdAt: event.occurredAt,
      updatedAt: event.ingestedAt,
      status: 'received',
      priority: event.metadata.stale ? 'high' : 'normal',
      location: {
        latitude: event.latitude,
        longitude: event.longitude,
        timestamp: event.occurredAt,
        source: 'last_known_gps',
      },
      syncState: 'received',
      requiresMapDrilldown: true,
      dedupeKey: event.sourceHash,
    },
    userFacingSummary: event.metadata.waypointDescription || 'Garmin MapShare location received.',
    metadata: {
      idempotencyKey: event.sourceHash,
      fullImeiSuppressed: true,
      automaticIncidentMutation: false,
      automaticReplySent: false,
    },
  };
}

function baseFeedResult(feed: GarminMapShareFeedConfig, polledAt: string): GarminMapShareFeedResult {
  return {
    feed,
    ok: true,
    status: 'empty',
    polledAt,
    lastFetchedAt: polledAt,
    lastSuccessfulFetchAt: null,
    lastSourceEventAt: null,
    lastError: null,
    sourceLatestTimestamp: null,
    stale: false,
    warning: null,
    failureCount: feedFailureCounts.get(getFeedId(feed)) ?? 0,
    duplicateCount: 0,
    parseWarnings: [],
    events: [],
    fieldMessages: [],
    staleWarnings: [],
    normalizedEvents: [],
  };
}

function disabledFeedResult(feed: GarminMapShareFeedConfig, polledAt: string): GarminMapShareFeedResult {
  return {
    ...baseFeedResult(feed, polledAt),
    status: 'disabled',
    lastFetchedAt: null,
  };
}

function failedParseResult(
  feed: GarminMapShareFeedConfig,
  polledAt: string,
  warning: string,
  parseWarnings: GarminMapShareParseWarningCode[],
): GarminMapShareFeedResult {
  return {
    ...baseFeedResult(feed, polledAt),
    ok: true,
    status: 'parse_failed',
    warning,
    lastError: warning,
    parseWarnings,
  };
}

function failedFetchResult(feed: GarminMapShareFeedConfig, polledAt: string, warning: string): GarminMapShareFeedResult {
  const feedId = getFeedId(feed);
  const nextCount = (feedFailureCounts.get(feedId) ?? 0) + 1;
  feedFailureCounts.set(feedId, nextCount);
  return {
    ...baseFeedResult(feed, polledAt),
    ok: true,
    status: 'fetch_failed',
    warning,
    lastError: warning,
    failureCount: nextCount,
  };
}

function buildStaleWarning(feed: GarminMapShareFeedConfig, polledAt: string): GarminMapShareStaleWarning {
  const feedId = getFeedId(feed);
  return {
    id: `garmin-mapshare-stale-${stableHashGarminIdentifier(`${feedId}:${polledAt}`)}`,
    source: GARMIN_MAPSHARE_SOURCE,
    kind: 'data_quality_warning',
    sourceFeedId: feedId,
    feedLabel: getFeedLabel(feed),
    message: STALE_WARNING,
    occurredAt: polledAt,
    ingestedAt: polledAt,
    stale: true,
    demo: feed.demo === true,
  };
}

function latestSourceTimestamp(events: GarminMapShareLocationTimelineEvent[]): string | null {
  const timestamps = events
    .map((event) => event.sourceTimestamp)
    .filter((timestamp): timestamp is string => !!timestamp)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return timestamps[0] ?? null;
}

function isStaleTimestamp(sourceTimestamp: string | null, polledAt: string, staleAfterMs: number): boolean {
  if (!sourceTimestamp) return true;
  const polledMs = Date.parse(polledAt);
  const sourceMs = Date.parse(sourceTimestamp);
  if (!Number.isFinite(polledMs) || !Number.isFinite(sourceMs)) return true;
  return polledMs - sourceMs > staleAfterMs;
}

function feedStaleAfterMs(feed: GarminMapShareFeedConfig, config: GarminInreachIntegrationConfig): number {
  if (typeof feed.staleAfterMinutes === 'number' && Number.isFinite(feed.staleAfterMinutes) && feed.staleAfterMinutes > 0) {
    return Math.round(feed.staleAfterMinutes * 60_000);
  }
  return config.mapShareStaleAfterMs;
}

function getFeedId(feed: GarminMapShareFeedConfig): string {
  return feed.id || stableHashGarminIdentifier(feed.url);
}

function getFeedLabel(feed: GarminMapShareFeedConfig): string {
  return feed.displayName || feed.label || 'Garmin MapShare Feed';
}

function isAllowedFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password &&
      !/explore\.garmin\.com\/Account|login|signin/i.test(parsed.href);
  } catch {
    return false;
  }
}

function isDemoFeed(feed: GarminMapShareFeedConfig): boolean {
  return feed.demo === true || feed.url === GARMIN_MAPSHARE_DEMO_URL;
}

function buildSyntheticDemoKml(polledAt: string): string {
  const offset = Math.floor(Date.parse(polledAt) / 300_000) % 6;
  const lat = 37.8651 + offset * 0.0012;
  const lon = -119.5383 - offset * 0.0011;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Demo Garmin MapShare Feed</name>
    <Placemark>
      <name>Demo inReach Position</name>
      <description>Demo synthetic MapShare point for ECS UI testing.</description>
      <TimeStamp><when>${polledAt}</when></TimeStamp>
      <Point><coordinates>${lon.toFixed(5)},${lat.toFixed(5)},1220</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
}

function hasKmlRoot(kml: string): boolean {
  return /<(?:[\w-]+:)?kml\b/i.test(kml) && /<\/(?:[\w-]+:)?kml>/i.test(kml);
}

function extractAllTagBlocks(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractTagContent(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() || null;
}

function parsePointCoordinates(value: string): { latitude: number; longitude: number; altitude: number | null } | null {
  const firstTuple = value.trim().split(/\s+/)[0];
  const parts = firstTuple.split(',');
  if (parts.length < 2) return null;
  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  const altitude = parts.length > 2 && parts[2] !== '' ? Number(parts[2]) : null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    latitude,
    longitude,
    altitude: altitude != null && Number.isFinite(altitude) ? altitude : null,
  };
}

function normalizeTimestamp(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function sanitizeKmlText(value: string | null): string | null {
  if (!value) return null;
  const stripped = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim();
  return stripped || null;
}

function uniqueWarnings(warnings: GarminMapShareParseWarningCode[]): GarminMapShareParseWarningCode[] {
  return Array.from(new Set(warnings));
}

function dataQualityWarningText(warning: GarminMapShareParseWarningCode): string {
  switch (warning) {
    case 'missing_timestamp':
      return 'Garmin MapShare placemark did not include a source timestamp.';
    case 'invalid_coordinates':
      return 'Garmin MapShare placemark contained invalid coordinates.';
    case 'unsupported_placemark':
      return 'Garmin MapShare placemark used an unsupported geometry and was ignored.';
    case 'empty_feed':
      return 'Garmin MapShare KML feed did not include location placemarks.';
    case 'malformed_xml':
    default:
      return 'Garmin MapShare KML feed could not be parsed as valid KML.';
  }
}

function roundCoordinate(value: number): string {
  return Number(value).toFixed(6);
}

function getHeader(response: Response, key: string): string | null {
  try {
    return response.headers.get(key);
  } catch {
    return null;
  }
}
