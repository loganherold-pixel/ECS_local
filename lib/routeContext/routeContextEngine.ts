import {
  isRouteContextEngineEnabled,
  resolveRouteContextFeatureFlags,
  type RouteContextFeatureFlagOverrides,
} from './routeContextConfig';
import {
  createRouteContextProviderRegistry,
  type RoutingProviderAdapter,
  type RouteContextProviderRegistry,
  type RouteContextProviderRegistryInput,
} from './routeContextAdapters';
import type {
  BailoutCandidate,
  Confidence,
  CampCandidate,
  RouteContext,
  RouteContextCoordinate,
  RouteConfidenceTimelineOverlay,
  RouteContextProviderMetadata,
  RouteContextWarning,
  RouteGeometry,
  SupplyCandidate,
  SupplyApproachChain,
  SupplyMode,
  SupplyPlan,
  TrailheadAnchor,
} from './routeContextTypes';
import { UNKNOWN_CONFIDENCE, clampConfidence } from './routeContextTypes';
import {
  boundingBoxFromCoordinates,
  buildRouteGeometrySegments,
  totalRouteDistanceMeters,
} from './routeContextGeometry';
import {
  getTrailRouteCoordinates,
  normalizeRouteContextCoordinate,
  resolveTrailheadAnchor,
} from './trailheadResolver';
import type {
  RouteContextProviderBundle,
  RouteContextTrailInput,
} from './routeContextProviders';
import { buildSupplyAwareRouteGeometry } from './routeContextSupplyRoutes';
import { findCampCandidates } from './routeContextCampCandidates';
import { findBailoutCandidates } from './routeContextBailoutCandidates';
import { buildRouteConfidenceTimeline } from './routeConfidenceTimeline';

export type GenerateRouteContextInput = {
  trail: RouteContextTrailInput;
  selectedSupplyMode?: SupplyMode | null;
  selectedRefuelCandidateId?: string | null;
  selectedResupplyCandidateId?: string | null;
  selectedSupplyCandidateIds?: string[] | null;
  providers?: RouteContextProviderBundle | null;
  providerRegistry?: RouteContextProviderRegistry | RouteContextProviderRegistryInput | null;
  featureFlags?: RouteContextFeatureFlagOverrides;
  routeConfidenceTimelineOverlays?: RouteConfidenceTimelineOverlay[] | null;
  tripDate?: string | null;
  campPreferences?: Record<string, unknown> | null;
  now?: string;
  ttlMs?: number | null;
};

function nowIso(input?: string): string {
  return input ?? new Date().toISOString();
}

function routeContextId(trailId: string, tripId?: string | null): string {
  return ['route-context', trailId, tripId].filter(Boolean).join(':');
}

function warning(
  code: RouteContextWarning['code'],
  message: string,
  severity: RouteContextWarning['severity'] = 'watch',
  source?: string | null,
): RouteContextWarning {
  return { code, message, severity, source };
}

function confidence(value: number, reasons: string[]): Confidence {
  return { value: clampConfidence(value), reasons };
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function routeGeometrySupplyPlanWarnings(routeGeometry?: RouteGeometry | null): RouteContextWarning[] {
  const rawWarnings = routeGeometry?.providerMetadata?.supplyPlanWarnings;
  if (!Array.isArray(rawWarnings)) return [];
  return rawWarnings.filter((item): item is RouteContextWarning => (
    item &&
    typeof item === 'object' &&
    typeof (item as RouteContextWarning).code === 'string' &&
    typeof (item as RouteContextWarning).message === 'string'
  ));
}

function addUniqueWarning(warnings: RouteContextWarning[], item: RouteContextWarning): void {
  if (warnings.some((existing) => existing.code === item.code && existing.message === item.message)) return;
  warnings.push(item);
}

function providerBundleFromInput(input: GenerateRouteContextInput): RouteContextProviderBundle {
  if (input.providers) return input.providers;
  if (!input.providerRegistry) return {};
  if ('toProviderBundle' in input.providerRegistry && typeof input.providerRegistry.toProviderBundle === 'function') {
    return input.providerRegistry.toProviderBundle();
  }
  return createRouteContextProviderRegistry(input.providerRegistry).toProviderBundle();
}

function providerRegistryFromInput(
  registry?: RouteContextProviderRegistry | RouteContextProviderRegistryInput | null,
): RouteContextProviderRegistry | null {
  if (!registry) return null;
  if ('getCapabilities' in registry && typeof registry.getCapabilities === 'function') {
    return registry;
  }
  return createRouteContextProviderRegistry(registry);
}

function routingAdapterFromInput(input: GenerateRouteContextInput): RoutingProviderAdapter | null {
  return providerRegistryFromInput(input.providerRegistry)?.routing ?? null;
}

export function buildFallbackRouteGeometry(
  trail: RouteContextTrailInput,
  anchor: TrailheadAnchor,
): RouteGeometry | null {
  const coordinates = getTrailRouteCoordinates(trail);
  const endpointPoints: RouteContextCoordinate[] = [
    normalizeRouteContextCoordinate(trail.startCoordinate),
    normalizeRouteContextCoordinate(trail.endpointCoordinate),
  ].filter((point): point is NonNullable<typeof point> => point != null)
    .map(({ lat, lng, label }) => ({ lat, lng, label }));
  const points: RouteContextCoordinate[] = coordinates.length >= 2 ? coordinates : endpointPoints;
  if (points.length < 2) return null;

  const segments = buildRouteGeometrySegments(points);
  const distance = totalRouteDistanceMeters(points);
  return {
    origin: trail.origin ?? null,
    destination: points[points.length - 1],
    waypoints: points.slice(1, -1),
    coordinates: points,
    distanceMeters: Math.round(distance),
    durationSeconds: null,
    bbox: boundingBoxFromCoordinates(points),
    corridor: null,
    segments,
    providerMetadata: {
      source: 'ecs_fallback_route_geometry',
      anchorSource: anchor.source,
    },
  };
}

function selectBestCandidate(
  candidates: SupplyCandidate[],
  category: SupplyCandidate['category'],
  selectedCandidateId?: string | null,
): SupplyCandidate | null {
  if (selectedCandidateId) {
    const selected = candidates.find((candidate) => (
      candidate.category === category &&
      (candidate.id === selectedCandidateId || candidate.providerPlaceId === selectedCandidateId)
    ));
    if (selected) return selected;
  }
  return candidates
    .filter((candidate) => candidate.category === category)
    .sort((left, right) => right.score - left.score || right.confidence.value - left.confidence.value)[0] ?? null;
}

function supplyCandidateCoordinate(candidate: SupplyCandidate | null | undefined): RouteContextCoordinate | null {
  if (!candidate || !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return null;
  return { lat: candidate.lat, lng: candidate.lng, label: candidate.name };
}

function buildSupplyApproachChain(args: {
  selected: SupplyCandidate[];
  origin?: RouteContextCoordinate | null;
  trailheadAnchor?: TrailheadAnchor | null;
  routeEndpoint?: RouteContextCoordinate | null;
  trailheadAnchoredSupplyChain?: boolean | null;
}): SupplyApproachChain | null {
  if (args.selected.length === 0 && !args.origin && !args.trailheadAnchor) return null;
  const stops: SupplyApproachChain['orderedStops'] = [];
  const push = (stop: SupplyApproachChain['orderedStops'][number] | null) => {
    if (!stop) return;
    stops.push({ ...stop, sequence: stops.length + 1 });
  };
  push(args.origin
    ? { role: 'origin', sequence: 0, coordinate: args.origin }
    : null);
  args.selected.forEach((candidate) => {
    push({
      role: candidate.category === 'gas' ? 'refuel' : 'resupply',
      candidateId: candidate.id,
      category: candidate.category,
      coordinate: supplyCandidateCoordinate(candidate),
      sequence: 0,
    });
  });
  push(args.trailheadAnchor
    ? {
        role: 'trailhead',
        sequence: 0,
        coordinate: { lat: args.trailheadAnchor.lat, lng: args.trailheadAnchor.lng, label: args.trailheadAnchor.label ?? 'Trailhead' },
      }
    : null);
  if (args.routeEndpoint) {
    push({
      role: 'route_endpoint',
      sequence: 0,
      coordinate: args.routeEndpoint,
    });
  }
  return {
    enabled: args.trailheadAnchoredSupplyChain === true,
    orderedStops: stops,
    anchorStrategy: args.trailheadAnchoredSupplyChain === true ? 'trailhead_anchored' : 'legacy_independent',
  };
}

export function buildSupplyPlan(
  mode: SupplyMode,
  candidates: SupplyCandidate[],
  selectedCandidateIds?: string[] | null,
): SupplyPlan | null {
  if (mode === 'none') {
    return {
      mode,
      orderedStops: [],
      approachChain: null,
      score: 1,
      confidence: confidence(1, ['No supply planning requested.']),
      warnings: [],
    };
  }

  const selectedGasId = selectedCandidateIds?.find((id) => (
    candidates.some((candidate) => candidate.category === 'gas' && (candidate.id === id || candidate.providerPlaceId === id))
  )) ?? null;
  const selectedGroceryId = selectedCandidateIds?.find((id) => (
    candidates.some((candidate) => candidate.category === 'grocery' && (candidate.id === id || candidate.providerPlaceId === id))
  )) ?? null;
  const gasCandidate = mode === 'gas' || mode === 'gas_and_grocery'
    ? selectBestCandidate(candidates, 'gas', selectedGasId)
    : null;
  const groceryCandidate = mode === 'grocery' || mode === 'gas_and_grocery'
    ? selectBestCandidate(candidates, 'grocery', selectedGroceryId)
    : null;
  const warnings: RouteContextWarning[] = [];
  if ((mode === 'gas' || mode === 'gas_and_grocery') && !gasCandidate) {
    warnings.push(warning('no_supply_candidates_found', 'No gas candidate was available for the selected route context.', 'watch'));
  }
  if ((mode === 'grocery' || mode === 'gas_and_grocery') && !groceryCandidate) {
    warnings.push(warning('no_supply_candidates_found', 'No grocery candidate was available for the selected route context.', 'watch'));
  }
  if (mode === 'gas_and_grocery' && gasCandidate && !groceryCandidate) {
    warnings.push(warning('no_resupply_near_refuel', 'No grocery/resupply candidate was available near the selected refuel stop.', 'watch'));
  }

  const orderedStops = [gasCandidate, groceryCandidate]
    .filter((candidate): candidate is SupplyCandidate => candidate != null)
    .map((candidate, index) => ({
      candidateId: candidate.id,
      category: candidate.category,
      sequence: index + 1,
    }));
  if (orderedStops.length === 0) return null;

  const selected = [gasCandidate, groceryCandidate].filter((candidate): candidate is SupplyCandidate => candidate != null);
  selected.forEach((candidate) => {
    candidate.warnings
      .filter((item) => (
        item.code === 'no_resupply_near_refuel' ||
        item.code === 'rural_resupply_fallback_used' ||
        item.code === 'resupply_far_from_refuel' ||
        item.code === 'supply_chain_rural_fallback' ||
        item.code === 'supply_chain_partial'
      ))
      .forEach((item) => {
        addUniqueWarning(warnings, item);
      });
  });
  const averageScore = selected.reduce((sum, candidate) => sum + candidate.score, 0) / selected.length;
  const averageConfidence = selected.reduce((sum, candidate) => sum + candidate.confidence.value, 0) / selected.length;
  return {
    mode,
    gasCandidate,
    groceryCandidate,
    orderedStops,
    approachChain: null,
    score: clampConfidence(averageScore),
    confidence: confidence(averageConfidence, ['Supply plan is based on provider-normalized candidate scores.']),
    warnings,
  };
}

function buildSupplyPlanForSelectedRoute(
  mode: SupplyMode,
  candidates: SupplyCandidate[],
  selectedCandidateIds: string[],
  options: {
    origin?: RouteContextCoordinate | null;
    trailheadAnchor?: TrailheadAnchor | null;
    routeEndpoint?: RouteContextCoordinate | null;
    trailheadAnchoredSupplyChain?: boolean | null;
    routeGeometry?: RouteGeometry | null;
  } = {},
): SupplyPlan | null {
  const basePlan = buildSupplyPlan(mode, candidates, selectedCandidateIds);
  if (!basePlan || selectedCandidateIds.length === 0) return basePlan;
  const selected = selectedCandidateIds
    .map((id) => candidates.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is SupplyCandidate => candidate != null);
  if (selected.length === 0) return basePlan;
  const averageScore = selected.reduce((sum, candidate) => sum + candidate.score, 0) / selected.length;
  const averageConfidence = selected.reduce((sum, candidate) => sum + candidate.confidence.value, 0) / selected.length;
  const routeGeometryScore = finiteNumber(options.routeGeometry?.providerMetadata?.supplyPlanScore);
  const routeWarnings = routeGeometrySupplyPlanWarnings(options.routeGeometry);
  const warnings = [...basePlan.warnings];
  routeWarnings.forEach((item) => addUniqueWarning(warnings, item));
  return {
    ...basePlan,
    gasCandidate: selected.find((candidate) => candidate.category === 'gas') ?? basePlan.gasCandidate ?? null,
    groceryCandidate: selected.find((candidate) => candidate.category === 'grocery') ?? basePlan.groceryCandidate ?? null,
    orderedStops: selected.map((candidate, index) => ({
      candidateId: candidate.id,
      category: candidate.category,
      sequence: index + 1,
    })),
    approachChain: buildSupplyApproachChain({
      selected,
      origin: options.origin ?? null,
      trailheadAnchor: options.trailheadAnchor ?? null,
      routeEndpoint: options.routeEndpoint ?? null,
      trailheadAnchoredSupplyChain: options.trailheadAnchoredSupplyChain,
    }),
    score: clampConfidence(routeGeometryScore ?? averageScore),
    confidence: confidence(
      routeGeometryScore == null ? averageConfidence : Math.min(averageConfidence, Math.max(0.45, routeGeometryScore + 0.08)),
      [routeGeometryScore == null
        ? 'Supply plan follows provider-normalized candidate scores.'
        : options.trailheadAnchoredSupplyChain
          ? 'Supply plan score evaluates the trailhead-anchored approach chain sequence.'
          : 'Supply plan score evaluates the selected supply-aware route sequence.'],
    ),
    warnings,
  };
}

export function createIdleRouteContext(
  trail: RouteContextTrailInput,
  now = nowIso(),
): RouteContext {
  return {
    id: routeContextId(trail.id, trail.tripId),
    trailId: trail.id,
    tripId: trail.tripId ?? null,
    userId: trail.userId ?? null,
    origin: trail.origin ?? null,
    trailheadAnchor: {
      lat: 0,
      lng: 0,
      label: null,
      source: 'unknown',
      confidence: UNKNOWN_CONFIDENCE,
      warnings: [],
    },
    selectedSupplyMode: null,
    supplyCandidates: [],
    selectedSupplyPlan: null,
    routeGeometry: null,
    campCandidates: [],
    bailoutCandidates: [],
    routeConfidenceTimeline: null,
    confidence: UNKNOWN_CONFIDENCE,
    status: 'idle',
    warnings: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
    providerMetadata: {
      featureEnabled: false,
    },
  };
}

function expiresAt(now: string, ttlMs?: number | null): string | null {
  if (!ttlMs || ttlMs <= 0) return null;
  const start = Date.parse(now);
  if (!Number.isFinite(start)) return null;
  return new Date(start + ttlMs).toISOString();
}

function overallConfidence(parts: Confidence[]): Confidence {
  const values = parts.filter((part) => part.reasons.length > 0);
  if (values.length === 0) return UNKNOWN_CONFIDENCE;
  const average = values.reduce((sum, part) => sum + part.value, 0) / values.length;
  return confidence(average, values.flatMap((part) => part.reasons).slice(0, 8));
}

function selectedSupplyCandidateIdsFromInput(input: GenerateRouteContextInput): string[] {
  const ids = [
    input.selectedRefuelCandidateId,
    input.selectedResupplyCandidateId,
    ...(input.selectedSupplyCandidateIds ?? []),
  ];
  return Array.from(new Set(
    ids
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  ));
}

export async function generateRouteContext(input: GenerateRouteContextInput): Promise<RouteContext> {
  const now = nowIso(input.now);
  if (!isRouteContextEngineEnabled(input.featureFlags)) {
    return createIdleRouteContext(input.trail, now);
  }

  const flags = resolveRouteContextFeatureFlags(input.featureFlags);
  const trailheadAnchoredSupplyChain = flags['ecs.routeContextEngine.trailheadAnchoredSupplyChain'];
  const anchor = resolveTrailheadAnchor(input.trail);
  const warnings: RouteContextWarning[] = [...anchor.warnings];
  if (!input.trail.origin) {
    warnings.push(warning('missing_origin', 'Origin is unavailable; route context will be trailhead-first.', 'info'));
  }

  const providers = providerBundleFromInput(input);
  const selectedSupplyMode = input.selectedSupplyMode ?? 'none';
  const selectedSupplyCandidateIds = selectedSupplyCandidateIdsFromInput(input);
  let supplyCandidates: SupplyCandidate[] = [];
  if (selectedSupplyMode !== 'none') {
    if (anchor.source === 'unknown') {
      warnings.push(warning('no_supply_candidates_found', 'Supply candidate search was skipped because trailhead anchor is unknown.', 'watch'));
    } else if (providers.supplyProvider) {
      try {
        supplyCandidates = await providers.supplyProvider.findSupplyCandidates({
          trailId: input.trail.id,
          trailheadAnchor: anchor,
          mode: selectedSupplyMode,
          origin: input.trail.origin ?? null,
          trailheadAnchoredSupplyChain,
          selectedRefuelCandidateId: input.selectedRefuelCandidateId ?? null,
          selectedResupplyCandidateId: input.selectedResupplyCandidateId ?? null,
          selectedSupplyCandidateIds,
        });
      } catch {
        warnings.push(warning('provider_unavailable', 'Supply provider was unavailable.', 'watch', providers.supplyProvider.id));
      }
    } else {
      warnings.push(warning('provider_unavailable', 'No supply provider is configured for route context generation.', 'info'));
    }
    if (supplyCandidates.length === 0) {
      warnings.push(warning('no_supply_candidates_found', 'No supply candidates were found for this route context.', 'watch'));
    }
  }

  let selectedSupplyPlan = buildSupplyPlan(selectedSupplyMode, supplyCandidates, selectedSupplyCandidateIds);
  let routeGeometry: RouteGeometry | null = null;
  const routingAdapter = routingAdapterFromInput(input);
  const routeCoordinates = getTrailRouteCoordinates(input.trail);
  const routeEndpoint = routeCoordinates.length >= 2
    ? routeCoordinates[routeCoordinates.length - 1]
    : normalizeRouteContextCoordinate(input.trail.endpointCoordinate);
  const hasExistingTrailGeometry = routeCoordinates.length >= 2 || routeEndpoint != null;
  const routingAdapterAvailable = routingAdapter?.isAvailable() === true;
  const hasAdapterRegistry = input.providerRegistry != null;
  const shouldBuildSupplyAwareGeometry = (
    selectedSupplyMode !== 'none' &&
    (routingAdapterAvailable || hasAdapterRegistry || providers.geometryProvider == null)
  ) || (
    !input.trail.origin &&
    selectedSupplyMode !== 'none'
  ) || (
    !hasExistingTrailGeometry &&
    (routingAdapterAvailable || hasAdapterRegistry || providers.geometryProvider == null)
  );
  try {
    if (shouldBuildSupplyAwareGeometry) {
      const routeResult = await buildSupplyAwareRouteGeometry({
        trailId: input.trail.id,
        origin: input.trail.origin ?? null,
        trailheadAnchor: anchor,
        selectedSupplyMode,
        supplyCandidates,
        routingAdapter,
        trailheadAnchoredSupplyChain,
        selectedSupplyCandidateIds,
        trailRouteCoordinates: routeCoordinates,
        trailEndpoint: routeEndpoint,
      });
      routeGeometry = routeResult.routeGeometry;
      routeResult.warnings.forEach((item) => {
        if (!warnings.some((existing) => existing.code === item.code && existing.message === item.message)) {
          warnings.push(item);
        }
      });
      selectedSupplyPlan = buildSupplyPlanForSelectedRoute(
        selectedSupplyMode,
        supplyCandidates,
        routeResult.selectedCandidateIds,
        {
          origin: input.trail.origin ?? null,
          trailheadAnchor: anchor,
          routeEndpoint,
          trailheadAnchoredSupplyChain,
          routeGeometry,
        },
      );
    }
  } catch {
    warnings.push(warning('provider_unavailable', 'Supply-aware route geometry generation failed; falling back to trail geometry.', 'watch'));
  }

  if (!routeGeometry && providers.geometryProvider) {
    try {
      routeGeometry = await providers.geometryProvider.buildRouteGeometry({
        trailId: input.trail.id,
        origin: input.trail.origin ?? null,
        trailheadAnchor: anchor,
        destination: normalizeRouteContextCoordinate(input.trail.endpointCoordinate),
        routeCoordinates,
      });
    } catch {
      warnings.push(warning('provider_unavailable', 'Route geometry provider was unavailable.', 'watch', providers.geometryProvider.id));
    }
  }
  routeGeometry = routeGeometry ?? buildFallbackRouteGeometry(input.trail, anchor);
  if (!routeGeometry) {
    warnings.push(warning('missing_trail_geometry', 'Trail geometry is unavailable for route context generation.', 'caution'));
  } else if (!routeGeometry.durationSeconds || !routeGeometry.coordinates || routeGeometry.coordinates.length < 2) {
    warnings.push(warning('partial_route_geometry', 'Route geometry is partial and should be treated as planning context only.', 'info'));
  }

  if (selectedSupplyPlan?.warnings.length) {
    selectedSupplyPlan.warnings.forEach((item) => {
      if (!warnings.some((existing) => existing.code === item.code && existing.message === item.message)) {
        warnings.push(item);
      }
    });
  }
  const campProvider = providers.campProvider ?? null;
  const bailoutProvider = providers.bailoutProvider ?? null;
  let campCandidates: CampCandidate[] = [];
  if (flags['ecs.routeContextEngine.enableCampCandidates']) {
    if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
      const result = await findCampCandidates({
        routeGeometry,
        trailheadAnchor: anchor,
        tripDate: input.tripDate ?? null,
        preferences: input.campPreferences ?? null,
      });
      result.warnings.forEach((item) => warnings.push(item));
    } else if (campProvider) {
      try {
        const providerCandidates = await campProvider.findCampCandidates({
          trailId: input.trail.id,
          trailheadAnchor: anchor,
          routeGeometry,
          tripDate: input.tripDate ?? null,
          preferences: input.campPreferences ?? null,
        });
        const result = await findCampCandidates({
          routeGeometry,
          trailheadAnchor: anchor,
          tripDate: input.tripDate ?? null,
          preferences: input.campPreferences ?? null,
          candidates: providerCandidates,
        });
        campCandidates = result.candidates;
        result.warnings.forEach((item) => warnings.push(item));
      } catch {
        warnings.push(warning('provider_unavailable', 'Camp candidate provider was unavailable.', 'watch', campProvider.id));
      }
    } else {
      warnings.push(warning('provider_unavailable', 'No camp candidate provider is configured for route context generation.', 'info'));
    }
  }
  let bailoutCandidates: BailoutCandidate[] = [];
  if (flags['ecs.routeContextEngine.enableBailoutCandidates']) {
    if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
      const result = await findBailoutCandidates({
        routeGeometry,
        trailGeometry: routeCoordinates,
        trailheadAnchor: anchor,
      });
      result.warnings.forEach((item) => warnings.push(item));
    } else if (bailoutProvider) {
      try {
        const providerCandidates = await bailoutProvider.findBailoutCandidates({
          trailId: input.trail.id,
          trailheadAnchor: anchor,
          routeGeometry,
          trailGeometry: routeCoordinates,
        });
        const result = await findBailoutCandidates({
          routeGeometry,
          trailGeometry: routeCoordinates,
          trailheadAnchor: anchor,
          routingAdapter,
          candidates: providerCandidates,
        });
        bailoutCandidates = result.candidates;
        result.warnings.forEach((item) => warnings.push(item));
      } catch {
        warnings.push(warning('provider_unavailable', 'Bailout candidate provider was unavailable.', 'watch', bailoutProvider.id));
      }
    } else {
      warnings.push(warning('provider_unavailable', 'No bailout candidate provider is configured for route context generation.', 'info'));
    }
  }

  const routeConfidenceTimeline =
    flags['ecs.routeContextEngine.routeConfidenceTimeline'] && routeGeometry
      ? buildRouteConfidenceTimeline({
          routeId: input.trail.id,
          routeGeometry,
          overlays: input.routeConfidenceTimelineOverlays ?? [],
          generatedAt: now,
        })
      : null;

  const contextConfidence = overallConfidence([
    anchor.confidence,
    routeGeometry ? confidence(0.68, ['Route geometry is available for background planning.']) : UNKNOWN_CONFIDENCE,
    selectedSupplyPlan?.confidence ?? (selectedSupplyMode === 'none' ? confidence(1, ['Supply planning not requested.']) : UNKNOWN_CONFIDENCE),
  ]);
  const status = !routeGeometry || warnings.some((item) => (
    item.code === 'provider_unavailable' ||
    item.code === 'no_supply_candidates_found' ||
    item.code === 'partial_route_geometry'
  ))
    ? 'partial'
    : 'ready';
  const providerMetadata: RouteContextProviderMetadata = {
    featureEnabled: true,
    debugLogging: flags['ecs.routeContextEngine.debugLogging'],
    trailheadAnchoredSupplyChain,
    providers: {
      supply: providers.supplyProvider?.id ?? null,
      geometry: providers.geometryProvider?.id ?? null,
      camp: providers.campProvider?.id ?? null,
      bailout: providers.bailoutProvider?.id ?? null,
      capabilities: input.providerRegistry && 'getCapabilities' in input.providerRegistry && typeof input.providerRegistry.getCapabilities === 'function'
        ? input.providerRegistry.getCapabilities()
        : input.providerRegistry
          ? createRouteContextProviderRegistry(input.providerRegistry).getCapabilities()
          : [],
    },
  };

  return {
    id: routeContextId(input.trail.id, input.trail.tripId),
    trailId: input.trail.id,
    tripId: input.trail.tripId ?? null,
    userId: input.trail.userId ?? null,
    origin: input.trail.origin ?? null,
    trailheadAnchor: anchor,
    selectedSupplyMode,
    supplyCandidates,
    selectedSupplyPlan,
    routeGeometry,
    campCandidates,
    bailoutCandidates,
    routeConfidenceTimeline,
    confidence: contextConfidence,
    status,
    warnings,
    createdAt: now,
    updatedAt: now,
    expiresAt: expiresAt(now, input.ttlMs),
    providerMetadata,
  };
}
