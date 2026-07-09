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

export const MAPBOX_SEARCH_BILLING_ECS_FLOWS = [
  'navigate_destination_search',
  'trip_builder_itinerary_search',
  'trip_builder_route_context_places',
  'trip_builder_smart_resupply',
] as const;

export type MapboxSearchBillingFlowMetadata = {
  flow: string;
  surface: string;
  label: string;
  expectedActivity: string;
};

export const MAPBOX_SEARCH_BILLING_FLOW_METADATA: Record<string, MapboxSearchBillingFlowMetadata> = {
  navigate_destination_search: {
    flow: 'navigate_destination_search',
    surface: 'Navigate',
    label: 'Navigate destination search',
    expectedActivity: 'Interactive destination suggestions and selected-place retrieve before route preview.',
  },
  trip_builder_itinerary_search: {
    flow: 'trip_builder_itinerary_search',
    surface: 'Trip Builder',
    label: 'Trip Builder itinerary insert search',
    expectedActivity: 'Operator-added itinerary stop suggestions and selected-place retrieve.',
  },
  trip_builder_route_context_places: {
    flow: 'trip_builder_route_context_places',
    surface: 'Trip Builder',
    label: 'Trip Builder route-context places',
    expectedActivity: 'Route-context provider place search and retrieve for fuel, grocery, camp, bailout, or service context.',
  },
  trip_builder_smart_resupply: {
    flow: 'trip_builder_smart_resupply',
    surface: 'Trip Builder',
    label: 'Trip Builder Smart Resupply',
    expectedActivity: 'Approach-anchor fuel and supply Search Box suggests plus bounded candidate retrieves.',
  },
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

export type MapboxSearchBillingCostRates = {
  currency?: string;
  searchBoxSessionUnitCost?: number | null;
  forwardGeocodeRequestUnitCost?: number | null;
};

export type MapboxSearchBillingFlowBudget = {
  maxSearchBoxSessionUnits?: number;
  maxSearchBoxRequestCount?: number;
  maxForwardGeocodeRequestUnits?: number;
};

export type MapboxSearchBillingCostReportOptions = {
  generatedAt?: string;
  invoicePeriod?: string | null;
  expectedFlows?: string[];
  flowBudgets?: Record<string, MapboxSearchBillingFlowBudget>;
  rates?: MapboxSearchBillingCostRates | null;
};

export type MapboxSearchBillingFlowCostSummary = {
  flow: string;
  surface: string;
  label: string;
  expectedActivity: string;
  operationCount: number;
  searchBoxRequestCount: number;
  searchBoxSuggestRequestCount: number;
  searchBoxRetrieveRequestCount: number;
  searchBoxSessionUnits: number;
  missingSessionTokenSearchBoxRequestCount: number;
  forwardGeocodeRequestUnits: number;
  coordinateReuseCount: number;
  duplicateSuggestCount: number;
  successCount: number;
  emptyCount: number;
  errorCount: number;
  estimatedSearchBoxCost: number | null;
  estimatedForwardGeocodeCost: number | null;
  estimatedTotalCost: number | null;
  notes: string[];
};

export type MapboxSearchBillingCostReport = {
  status: 'pass' | 'watch' | 'fail';
  generatedAt: string;
  invoicePeriod: string | null;
  pricing: {
    currency: string;
    searchBoxSessionUnitCost: number | null;
    forwardGeocodeRequestUnitCost: number | null;
    estimateStatus: 'priced' | 'unit_counts_only';
    note: string;
  };
  flowSummaries: MapboxSearchBillingFlowCostSummary[];
  totals: {
    operationCount: number;
    searchBoxRequestCount: number;
    searchBoxSuggestRequestCount: number;
    searchBoxRetrieveRequestCount: number;
    searchBoxSessionUnits: number;
    missingSessionTokenSearchBoxRequestCount: number;
    forwardGeocodeRequestUnits: number;
    coordinateReuseCount: number;
    estimatedSearchBoxCost: number | null;
    estimatedForwardGeocodeCost: number | null;
    estimatedTotalCost: number | null;
  };
  risks: MapboxSearchBillingRisk[];
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

function searchBoxSessionToken(event: MapboxSearchBillingEvent): string | null {
  if (event.operation !== 'searchbox_suggest' && event.operation !== 'searchbox_retrieve') return null;
  const token = String(event.sessionToken ?? '').trim();
  return token && token !== 'missing_session_token' ? token : null;
}

function isSearchBoxOperation(event: MapboxSearchBillingEvent): boolean {
  return event.operation === 'searchbox_suggest' || event.operation === 'searchbox_retrieve';
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

function roundCost(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function pricedCost(units: number, unitCost: number | null | undefined): number | null {
  if (!Number.isFinite(unitCost)) return null;
  return roundCost(units * Number(unitCost));
}

function sumNullableCost(values: Array<number | null>): number | null {
  if (values.some((value) => value == null)) return null;
  const numericValues = values.filter((value): value is number => value != null);
  return roundCost(numericValues.reduce((sum, value) => sum + value, 0));
}

function costCurrency(rates: MapboxSearchBillingCostRates | null | undefined): string {
  const currency = String(rates?.currency ?? 'USD').trim().toUpperCase();
  return currency || 'USD';
}

function metadataForFlow(flow: string, fallbackSurface: string | null): MapboxSearchBillingFlowMetadata {
  return MAPBOX_SEARCH_BILLING_FLOW_METADATA[flow] ?? {
    flow,
    surface: fallbackSurface ?? 'Unlabeled',
    label: flow,
    expectedActivity: 'No ECS billing metadata is registered for this flow.',
  };
}

function duplicateSuggestCountForEvents(
  suggestEvents: MapboxSearchBillingEvent[],
  maxDuplicateSuggestsPerSignature = 1,
): number {
  return Array.from(
    suggestEvents.reduce((counts, event) => {
      const key = `${event.sessionToken ?? 'missing'}:${signatureFor(event)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()).values(),
  ).reduce((count, seen) => count + Math.max(0, seen - maxDuplicateSuggestsPerSignature), 0);
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

export function buildMapboxSearchBillingCostReport(
  inputEvents: MapboxSearchBillingEvent[],
  options: MapboxSearchBillingCostReportOptions = {},
): MapboxSearchBillingCostReport {
  const events = inputEvents.map(normalizeEvent);
  const expectedFlows = new Set(options.expectedFlows ?? [...MAPBOX_SEARCH_BILLING_ECS_FLOWS]);
  const flowBudgets = options.flowBudgets ?? {};
  const rates = options.rates ?? null;
  const currency = costCurrency(rates);
  const searchBoxSessionUnitCost = Number.isFinite(rates?.searchBoxSessionUnitCost)
    ? Number(rates?.searchBoxSessionUnitCost)
    : null;
  const forwardGeocodeRequestUnitCost = Number.isFinite(rates?.forwardGeocodeRequestUnitCost)
    ? Number(rates?.forwardGeocodeRequestUnitCost)
    : null;
  const pricingConfigured =
    searchBoxSessionUnitCost != null &&
    forwardGeocodeRequestUnitCost != null;
  const risks: MapboxSearchBillingRisk[] = [];
  const byFlow = new Map<string, MapboxSearchBillingEvent[]>();

  events.forEach((event) => {
    const flow = flowFor(event);
    byFlow.set(flow, [...(byFlow.get(flow) ?? []), event]);
  });

  if (events.length === 0) {
    risks.push({
      severity: 'fail',
      flow: 'unlabeled_mapbox_search',
      message: 'No Mapbox Search billing events were supplied for the invoice-period report.',
      whyItMatters: 'A monthly billing report with no events cannot be reconciled against the Mapbox invoice.',
      remediation: 'Export sanitized billing events from the current Navigate and Trip Builder search runs, then rerun the report with --events=<file>.',
    });
  }

  const flowSummaries = Array.from(byFlow.entries()).map(([flow, flowEvents]) => {
    const searchBoxEvents = flowEvents.filter(isSearchBoxOperation);
    const suggestEvents = flowEvents.filter((event) => event.operation === 'searchbox_suggest');
    const retrieveEvents = flowEvents.filter((event) => event.operation === 'searchbox_retrieve');
    const fallbackEvents = flowEvents.filter((event) => event.operation === 'forward_geocode_fallback');
    const coordinateReuseEvents = flowEvents.filter((event) => event.operation === 'coordinate_reuse');
    const sessionTokens = new Set(searchBoxEvents.map(searchBoxSessionToken).filter((token): token is string => !!token));
    const missingSessionTokenSearchBoxRequestCount = searchBoxEvents.filter((event) => !searchBoxSessionToken(event)).length;
    const searchBoxSessionUnits = sessionTokens.size + missingSessionTokenSearchBoxRequestCount;
    const duplicateSuggestCount = duplicateSuggestCountForEvents(suggestEvents);
    const metadata = metadataForFlow(flow, flowEvents.find((event) => event.surface)?.surface ?? null);
    const estimatedSearchBoxCost = pricedCost(searchBoxSessionUnits, searchBoxSessionUnitCost);
    const estimatedForwardGeocodeCost = pricedCost(fallbackEvents.length, forwardGeocodeRequestUnitCost);
    const estimatedTotalCost = sumNullableCost([estimatedSearchBoxCost, estimatedForwardGeocodeCost]);
    const notes: string[] = [];

    if (flow === 'unlabeled_mapbox_search') {
      risks.push({
        severity: 'fail',
        flow,
        message: 'Mapbox Search activity lacks a billing flow label.',
        whyItMatters: 'Unlabeled usage cannot be attributed to Navigate, Trip Builder, or another ECS surface during invoice review.',
        remediation: 'Pass billingContext.flow from the calling feature before invoking searchRoadDestinations or resolveRoadDestination.',
      });
    } else if (!expectedFlows.has(flow)) {
      risks.push({
        severity: 'fail',
        flow,
        message: `Unexpected Mapbox search billing flow: ${flow}.`,
        whyItMatters: 'New or misspelled flow labels can hide billable activity outside the reviewed ECS search surfaces.',
        remediation: 'Register the flow in MAPBOX_SEARCH_BILLING_FLOW_METADATA or correct the caller billingContext.flow label.',
      });
    }

    if (missingSessionTokenSearchBoxRequestCount > 0) {
      risks.push({
        severity: 'fail',
        flow,
        message: `${flow} has ${missingSessionTokenSearchBoxRequestCount} Search Box request(s) missing a Search Box session token.`,
        whyItMatters: 'Missing session tokens can make invoice reconciliation ambiguous and may prevent intended session grouping.',
        remediation: 'Reuse createRoadSearchSessionToken output across suggest and retrieve calls for the operator flow.',
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

    if (fallbackEvents.length > 0) {
      notes.push('Forward geocode fallback is reported separately from Search Box sessions.');
    }
    if (coordinateReuseEvents.length > 0) {
      notes.push('Coordinate reuse is counted as zero additional Mapbox search cost.');
    }
    if (!pricingConfigured) {
      notes.push('Dollar estimate omitted because unit prices were not configured for this run.');
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

    const budget = flowBudgets[flow];
    if (budget?.maxSearchBoxSessionUnits != null && searchBoxSessionUnits > budget.maxSearchBoxSessionUnits) {
      risks.push({
        severity: 'watch',
        flow,
        message: `${flow} exceeded the configured Search Box session budget (${searchBoxSessionUnits}/${budget.maxSearchBoxSessionUnits}).`,
        whyItMatters: 'A flow-level spike can explain invoice movement before it becomes a surprise monthly charge.',
        remediation: 'Review recent operator search loops, debounce behavior, and route-anchor churn for this flow.',
      });
    }
    if (budget?.maxSearchBoxRequestCount != null && searchBoxEvents.length > budget.maxSearchBoxRequestCount) {
      risks.push({
        severity: 'watch',
        flow,
        message: `${flow} exceeded the configured Search Box request budget (${searchBoxEvents.length}/${budget.maxSearchBoxRequestCount}).`,
        whyItMatters: 'Request spikes within a session can still indicate unstable UI loops or over-eager background enrichment.',
        remediation: 'Inspect suggest/retrieve counts for the flow and cap background lookup loops where needed.',
      });
    }
    if (budget?.maxForwardGeocodeRequestUnits != null && fallbackEvents.length > budget.maxForwardGeocodeRequestUnits) {
      risks.push({
        severity: 'watch',
        flow,
        message: `${flow} exceeded the configured forward-geocode fallback budget (${fallbackEvents.length}/${budget.maxForwardGeocodeRequestUnits}).`,
        whyItMatters: 'Fallback geocoding is tracked separately from Search Box sessions and can still affect Mapbox billing.',
        remediation: 'Check Search Box empty/error rates before allowing broad fallback geocoding for this flow.',
      });
    }

    return {
      flow,
      surface: metadata.surface,
      label: metadata.label,
      expectedActivity: metadata.expectedActivity,
      operationCount: flowEvents.length,
      searchBoxRequestCount: searchBoxEvents.length,
      searchBoxSuggestRequestCount: suggestEvents.length,
      searchBoxRetrieveRequestCount: retrieveEvents.length,
      searchBoxSessionUnits,
      missingSessionTokenSearchBoxRequestCount,
      forwardGeocodeRequestUnits: fallbackEvents.length,
      coordinateReuseCount: coordinateReuseEvents.length,
      duplicateSuggestCount,
      successCount: flowEvents.filter((event) => event.outcome === 'success').length,
      emptyCount: flowEvents.filter((event) => event.outcome === 'empty').length,
      errorCount: flowEvents.filter((event) => event.outcome === 'error').length,
      estimatedSearchBoxCost,
      estimatedForwardGeocodeCost,
      estimatedTotalCost,
      notes,
    };
  }).sort((left, right) => left.flow.localeCompare(right.flow));

  const totals = flowSummaries.reduce<MapboxSearchBillingCostReport['totals']>(
    (acc, summary) => ({
      operationCount: acc.operationCount + summary.operationCount,
      searchBoxRequestCount: acc.searchBoxRequestCount + summary.searchBoxRequestCount,
      searchBoxSuggestRequestCount: acc.searchBoxSuggestRequestCount + summary.searchBoxSuggestRequestCount,
      searchBoxRetrieveRequestCount: acc.searchBoxRetrieveRequestCount + summary.searchBoxRetrieveRequestCount,
      searchBoxSessionUnits: acc.searchBoxSessionUnits + summary.searchBoxSessionUnits,
      missingSessionTokenSearchBoxRequestCount:
        acc.missingSessionTokenSearchBoxRequestCount + summary.missingSessionTokenSearchBoxRequestCount,
      forwardGeocodeRequestUnits: acc.forwardGeocodeRequestUnits + summary.forwardGeocodeRequestUnits,
      coordinateReuseCount: acc.coordinateReuseCount + summary.coordinateReuseCount,
      estimatedSearchBoxCost: sumNullableCost([acc.estimatedSearchBoxCost, summary.estimatedSearchBoxCost]),
      estimatedForwardGeocodeCost: sumNullableCost([acc.estimatedForwardGeocodeCost, summary.estimatedForwardGeocodeCost]),
      estimatedTotalCost: sumNullableCost([acc.estimatedTotalCost, summary.estimatedTotalCost]),
    }),
    {
      operationCount: 0,
      searchBoxRequestCount: 0,
      searchBoxSuggestRequestCount: 0,
      searchBoxRetrieveRequestCount: 0,
      searchBoxSessionUnits: 0,
      missingSessionTokenSearchBoxRequestCount: 0,
      forwardGeocodeRequestUnits: 0,
      coordinateReuseCount: 0,
      estimatedSearchBoxCost: pricingConfigured ? 0 : null,
      estimatedForwardGeocodeCost: pricingConfigured ? 0 : null,
      estimatedTotalCost: pricingConfigured ? 0 : null,
    },
  );

  const status: MapboxSearchBillingCostReport['status'] =
    risks.some((risk) => risk.severity === 'fail') ? 'fail' :
    risks.length > 0 ? 'watch' :
    'pass';

  return {
    status,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    invoicePeriod: options.invoicePeriod ?? null,
    pricing: {
      currency,
      searchBoxSessionUnitCost,
      forwardGeocodeRequestUnitCost,
      estimateStatus: pricingConfigured ? 'priced' : 'unit_counts_only',
      note: pricingConfigured
        ? 'Estimated cost uses caller-supplied unit prices; verify against the Mapbox invoice and contract terms.'
        : 'Dollar costs are not estimated because unit prices were not supplied; use unit counts for invoice reconciliation.',
    },
    flowSummaries,
    totals,
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

function formatEstimatedCost(currency: string, value: number | null): string {
  return value == null ? 'unit-counts-only' : `${currency} ${value.toFixed(4)}`;
}

export function formatMapboxSearchBillingCostReport(report: MapboxSearchBillingCostReport): string {
  const lines = [`Mapbox Search billing cost report: ${report.status.toUpperCase()}`];
  if (report.invoicePeriod) lines.push(`Invoice period: ${report.invoicePeriod}`);
  lines.push(`Pricing: ${report.pricing.note}`);
  lines.push(
    `Totals: searchBoxSessions=${report.totals.searchBoxSessionUnits}, searchBoxRequests=${report.totals.searchBoxRequestCount}, forwardGeocodeFallbacks=${report.totals.forwardGeocodeRequestUnits}, coordinateReuse=${report.totals.coordinateReuseCount}`,
  );
  lines.push(`Estimated total: ${formatEstimatedCost(report.pricing.currency, report.totals.estimatedTotalCost)}`);

  if (report.flowSummaries.length > 0) {
    lines.push('Flows:');
    report.flowSummaries.forEach((summary) => {
      lines.push(
        `- ${summary.flow} (${summary.surface}): sessions=${summary.searchBoxSessionUnits}, suggest=${summary.searchBoxSuggestRequestCount}, retrieve=${summary.searchBoxRetrieveRequestCount}, forwardGeocode=${summary.forwardGeocodeRequestUnits}, coordinateReuse=${summary.coordinateReuseCount}, estimated=${formatEstimatedCost(report.pricing.currency, summary.estimatedTotalCost)}`,
      );
      lines.push(`  Expected: ${summary.expectedActivity}`);
      summary.notes.forEach((note) => lines.push(`  Note: ${note}`));
    });
  }

  if (report.risks.length > 0) {
    lines.push('Risks:');
    report.risks.forEach((risk) => {
      lines.push(`- [${risk.severity.toUpperCase()}] ${risk.flow}: ${risk.message}`);
      lines.push(`  Why: ${risk.whyItMatters}`);
      lines.push(`  Remediation: ${risk.remediation}`);
    });
  }

  return lines.join('\n');
}
