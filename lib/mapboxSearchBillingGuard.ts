export type MapboxSearchBillingFlow =
  | 'trip_builder_smart_resupply'
  | 'trip_builder_itinerary_search'
  | 'trip_builder_route_context_places'
  | 'navigate_destination_search'
  | string;

export type MapboxSearchBillingOperation =
  | 'searchbox_suggest'
  | 'searchbox_retrieve'
  | 'forward_geocode_fallback'
  | 'coordinate_reuse';

export type MapboxSearchBillingOutcome =
  | 'success'
  | 'empty'
  | 'error'
  | 'skipped';

export type MapboxSearchBillingContext = {
  flow: MapboxSearchBillingFlow;
  surface?: string | null;
  operatorAction?: string | null;
  requestSignature?: string | null;
};

export type MapboxSearchBillingEvent = MapboxSearchBillingContext & {
  operation: MapboxSearchBillingOperation;
  outcome: MapboxSearchBillingOutcome;
  sessionToken?: string | null;
  requestSignature?: string | null;
  resultCount?: number | null;
  suggestionId?: string | null;
  reason?: string | null;
  capturedAt?: string | null;
};

export type MapboxSearchBillingRisk = {
  severity: 'fail' | 'watch';
  flow: string;
  message: string;
  whyItMatters: string;
  remediation: string;
};

export type MapboxSearchBillingFlowSummary = {
  flow: string;
  surface: string | null;
  operationCount: number;
  searchBoxSessionCount: number;
  suggestCount: number;
  retrieveCount: number;
  fallbackCount: number;
  duplicateSuggestCount: number;
};

export type MapboxSearchBillingReadiness = {
  status: 'pass' | 'watch' | 'fail';
  flowSummaries: MapboxSearchBillingFlowSummary[];
  risks: MapboxSearchBillingRisk[];
};

export type MapboxSearchBillingThresholds = {
  maxSearchBoxSessionsPerFlow?: number;
  maxDuplicateSuggestsPerSignature?: number;
  maxRetrievesPerFlow?: number;
};

type BillingSink = (event: MapboxSearchBillingEvent) => void;

let billingSink: BillingSink | null = null;

function finiteCount(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function flowFor(event: Partial<MapboxSearchBillingEvent>): string {
  return String(event.flow ?? 'unlabeled_mapbox_search').trim() || 'unlabeled_mapbox_search';
}

function searchBoxSessionKey(event: MapboxSearchBillingEvent): string | null {
  if (event.operation !== 'searchbox_suggest' && event.operation !== 'searchbox_retrieve') return null;
  const token = String(event.sessionToken ?? '').trim();
  return token || 'missing_session_token';
}

function signatureFor(event: MapboxSearchBillingEvent): string {
  return String(event.requestSignature ?? event.suggestionId ?? 'unsigned_request').trim() || 'unsigned_request';
}

function normalizeEvent(event: MapboxSearchBillingEvent): MapboxSearchBillingEvent {
  return {
    ...event,
    flow: flowFor(event),
    surface: event.surface ?? null,
    operatorAction: event.operatorAction ?? null,
    sessionToken: event.sessionToken ?? null,
    requestSignature: event.requestSignature ?? null,
    resultCount: finiteCount(event.resultCount),
    suggestionId: event.suggestionId ?? null,
    reason: event.reason ?? null,
    capturedAt: event.capturedAt ?? new Date().toISOString(),
  };
}

export function setMapboxSearchBillingEventSink(sink: BillingSink): void {
  billingSink = sink;
}

export function clearMapboxSearchBillingEventSink(): void {
  billingSink = null;
}

export function recordMapboxSearchBillingEvent(event: MapboxSearchBillingEvent): void {
  if (!billingSink) return;
  billingSink(normalizeEvent(event));
}

export function buildMapboxSearchRequestSignature(args: {
  query?: string | null;
  proximity?: { lat?: number | null; lng?: number | null } | null;
  bbox?: { west: number; south: number; east: number; north: number } | null;
  limit?: number | null;
}): string {
  const query = String(args.query ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 48);
  const proximity = args.proximity &&
    Number.isFinite(args.proximity.lat) &&
    Number.isFinite(args.proximity.lng)
    ? `${Number(args.proximity.lat).toFixed(3)},${Number(args.proximity.lng).toFixed(3)}`
    : 'no-proximity';
  const bbox = args.bbox
    ? `${args.bbox.west.toFixed(2)},${args.bbox.south.toFixed(2)},${args.bbox.east.toFixed(2)},${args.bbox.north.toFixed(2)}`
    : 'no-bbox';
  return [query || 'empty-query', proximity, bbox, `limit:${args.limit ?? 'default'}`].join('|');
}

export function analyzeMapboxSearchBillingEvents(
  inputEvents: MapboxSearchBillingEvent[],
  thresholds: MapboxSearchBillingThresholds = {},
): MapboxSearchBillingReadiness {
  const events = inputEvents.map(normalizeEvent);
  const maxSearchBoxSessionsPerFlow = thresholds.maxSearchBoxSessionsPerFlow ?? 1;
  const maxDuplicateSuggestsPerSignature = thresholds.maxDuplicateSuggestsPerSignature ?? 1;
  const maxRetrievesPerFlow = thresholds.maxRetrievesPerFlow ?? 8;
  const byFlow = new Map<string, MapboxSearchBillingEvent[]>();
  const risks: MapboxSearchBillingRisk[] = [];

  events.forEach((event) => {
    const flow = flowFor(event);
    byFlow.set(flow, [...(byFlow.get(flow) ?? []), event]);
  });

  if (events.length === 0) {
    risks.push({
      severity: 'fail',
      flow: 'unlabeled_mapbox_search',
      message: 'No Mapbox Search Box billing events were captured.',
      whyItMatters: 'A shipping gate cannot detect new billable sessions without instrumentation.',
      remediation: 'Pass a billingContext into every searchRoadDestinations and resolveRoadDestination call path.',
    });
  }

  const flowSummaries = Array.from(byFlow.entries()).map(([flow, flowEvents]) => {
    const searchBoxSessions = new Set(flowEvents.map(searchBoxSessionKey).filter((token): token is string => !!token));
    const suggestEvents = flowEvents.filter((event) => event.operation === 'searchbox_suggest');
    const retrieveEvents = flowEvents.filter((event) => event.operation === 'searchbox_retrieve');
    const fallbackEvents = flowEvents.filter((event) => event.operation === 'forward_geocode_fallback');
    const duplicateSuggestCount = Array.from(
      suggestEvents.reduce((counts, event) => {
        const key = `${event.sessionToken ?? 'missing'}:${signatureFor(event)}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()).values(),
    ).reduce((count, seen) => count + Math.max(0, seen - maxDuplicateSuggestsPerSignature), 0);

    if (flow === 'unlabeled_mapbox_search') {
      risks.push({
        severity: 'fail',
        flow,
        message: 'Mapbox Search Box usage lacks a billing flow label.',
        whyItMatters: 'Unlabeled Search Box events cannot be tied back to Trip Builder, Navigate, or another operator surface before shipping.',
        remediation: 'Pass billingContext.flow from the calling feature before invoking searchRoadDestinations or resolveRoadDestination.',
      });
    }

    if (searchBoxSessions.size > maxSearchBoxSessionsPerFlow) {
      risks.push({
        severity: 'fail',
        flow,
        message: `${flow} opened ${searchBoxSessions.size} Search Box sessions in one operator flow.`,
        whyItMatters: 'Mapbox Search Box billing is session-sensitive; extra tokens can turn one operator action into another billable session.',
        remediation: 'Reuse the existing road-search session token until the operator selects a destination or explicitly starts a new search flow.',
      });
    }

    if (duplicateSuggestCount > 0) {
      risks.push({
        severity: 'watch',
        flow,
        message: `${flow} made ${duplicateSuggestCount} duplicate suggest call(s) for the same session and request signature.`,
        whyItMatters: 'Repeated suggest calls from re-renders, fallback loops, or unstable route anchors can inflate Search Box usage before selection.',
        remediation: 'Coalesce identical suggest signatures, debounce source updates, or reuse cached suggestions for the active session token.',
      });
    }

    if (fallbackEvents.length > 0 && retrieveEvents.length > 0) {
      const quotaFallback = fallbackEvents.some((event) => /quota|rate|limit/i.test(String(event.reason ?? '')));
      risks.push({
        severity: quotaFallback ? 'fail' : 'watch',
        flow,
        message: `${flow} performed Search Box retrieve after quota fallback.`,
        whyItMatters: 'Fallback geocoding should avoid additional Search Box calls when quota is constrained or coordinates are already available.',
        remediation: 'Resolve fallback suggestions directly from their coordinates and skip Search Box retrieve unless a fresh Search Box suggestion is selected.',
      });
    }

    if (retrieveEvents.length > maxRetrievesPerFlow) {
      risks.push({
        severity: 'watch',
        flow,
        message: `${flow} resolved ${retrieveEvents.length} Search Box suggestions in one operator flow.`,
        whyItMatters: 'Bulk retrieve loops can turn broad searches into expensive selected-place lookups.',
        remediation: 'Cap resolved suggestions and defer retrieve until a candidate is actually needed for display or route planning.',
      });
    }

    return {
      flow,
      surface: flowEvents.find((event) => event.surface)?.surface ?? null,
      operationCount: flowEvents.length,
      searchBoxSessionCount: searchBoxSessions.size,
      suggestCount: suggestEvents.length,
      retrieveCount: retrieveEvents.length,
      fallbackCount: fallbackEvents.length,
      duplicateSuggestCount,
    };
  }).sort((left, right) => left.flow.localeCompare(right.flow));

  const status: MapboxSearchBillingReadiness['status'] =
    risks.some((risk) => risk.severity === 'fail') ? 'fail' :
    risks.length > 0 ? 'watch' :
    'pass';

  return {
    status,
    flowSummaries,
    risks,
  };
}

export function formatMapboxSearchBillingReadinessReport(readiness: MapboxSearchBillingReadiness): string {
  const lines = [`Mapbox Search Box billing readiness: ${readiness.status.toUpperCase()}`];
  if (readiness.flowSummaries.length > 0) {
    lines.push('Flows:');
    readiness.flowSummaries.forEach((summary) => {
      lines.push(
        `- ${summary.flow}: sessions=${summary.searchBoxSessionCount}, suggest=${summary.suggestCount}, retrieve=${summary.retrieveCount}, fallback=${summary.fallbackCount}, duplicateSuggest=${summary.duplicateSuggestCount}`,
      );
    });
  }
  if (readiness.risks.length > 0) {
    lines.push('Risks:');
    readiness.risks.forEach((risk) => {
      lines.push(`- [${risk.severity.toUpperCase()}] ${risk.flow}: ${risk.message}`);
      lines.push(`  Why: ${risk.whyItMatters}`);
      lines.push(`  Remediation: ${risk.remediation}`);
    });
  }
  return lines.join('\n');
}
