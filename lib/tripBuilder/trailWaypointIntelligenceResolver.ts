import type {
  GeoPoint,
  ItineraryDataSource,
  ItineraryPhase,
  ItineraryRoute,
  ItineraryWaypoint,
  TrailheadStartCandidate,
  TripBuilderConfidence,
  TripBuilderRouteContextInput,
  TripBuilderVehicleProfile,
  WaypointType,
} from './tripBuilderTypes';
import {
  scoreTrailWaypointCandidates,
  type ScoredTrailWaypointCandidate,
} from './trailWaypointScoring';
import { resolveBailoutRouteConfidence } from './bailoutRouteConfidenceResolver';

export type TrailWaypointRecord =
  | ItineraryWaypoint
  | {
      id?: string | null;
      type?: string | null;
      waypointType?: string | null;
      category?: string | null;
      ecsWaypointType?: string | null;
      title?: string | null;
      name?: string | null;
      label?: string | null;
      description?: string | null;
      notes?: string[] | string | null;
      coordinate?: unknown;
      location?: unknown;
      point?: unknown;
      latitude?: number | null;
      longitude?: number | null;
      lat?: number | null;
      lng?: number | null;
      lon?: number | null;
      routeMileMarker?: number | null;
      mileMarker?: number | null;
      phase?: string | null;
      source?: string | ItineraryDataSource | null;
      provider?: string | null;
      confidence?: TripBuilderConfidence | number | { value?: number | null; reasons?: string[] } | null;
      confidenceScore?: number | null;
      reliability?: TripBuilderConfidence | number | null;
      score?: number | null;
      isUserAdded?: boolean | null;
      userAdded?: boolean | null;
      isEcsSuggested?: boolean | null;
      ecsSuggested?: boolean | null;
      providerMetadata?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
      warnings?: unknown[] | null;
    };

export type ResolveTrailWaypointsArgs = {
  trailRoute?: ItineraryRoute | null;
  trailheadStart?: ItineraryWaypoint | TrailheadStartCandidate | GeoPoint | null;
  trailEnd?: ItineraryWaypoint | null;
  routeContext?: TripBuilderRouteContextInput | null;
  userPreferences?: Record<string, unknown> | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  knownRoads?: unknown[] | null;
  mapboxData?: unknown;
  supabaseRouteData?: unknown;
  waypointRecords?: TrailWaypointRecord[] | unknown[] | null;
  routeId?: string | null;
  generatedAt?: string;
};

export type ResolvedTrailWaypoints = {
  trailWaypoints: ItineraryWaypoint[];
  dataUsed: ItineraryDataSource[];
  warnings: string[];
  metadata: {
    sourceRecordCount: number;
    normalizedWaypointCount: number;
    scoredWaypointCount: number;
    bailoutConfidenceCount: number;
    missingTrailGeometry: boolean;
    providerHooks: string[];
  };
};

const TRAIL_INTELLIGENCE_TYPES = new Set<WaypointType>([
  'bailout',
  'camp_potential',
  'scenic_stop',
  'hazard',
  'turnaround',
  'trail_end',
  'exit',
  'user_added',
]);

const PHASES = new Set<ItineraryPhase>([
  'approach',
  'pre_trail_resupply',
  'trailhead',
  'trail_navigation',
  'trail_exit',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
}

function confidenceNumber(value: unknown): number | null {
  if (isRecord(value)) return confidenceNumber(value.value);
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return numeric > 1 ? Math.min(1, numeric / 100) : Math.max(0, numeric);
}

function normalizeConfidence(value: unknown, fallback: TripBuilderConfidence): TripBuilderConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
  const numeric = confidenceNumber(value);
  if (numeric == null) return fallback;
  if (numeric >= 0.78) return 'high';
  if (numeric >= 0.5) return 'medium';
  if (numeric > 0) return 'low';
  return fallback;
}

function validPoint(latitude: number | null, longitude: number | null): GeoPoint | null {
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function normalizeCoordinate(value: unknown): GeoPoint | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const longitude = finiteNumber(value[0]);
    const latitude = finiteNumber(value[1]);
    return validPoint(latitude, longitude);
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.center)) return normalizeCoordinate(value.center);
  if (value.type === 'Point' && Array.isArray(value.coordinates)) return normalizeCoordinate(value.coordinates);

  const nested = value.coordinate ?? value.location ?? value.point;
  if (nested && nested !== value) {
    const nestedPoint = normalizeCoordinate(nested);
    if (nestedPoint) return nestedPoint;
  }

  return validPoint(
    finiteNumber(value.latitude ?? value.lat),
    finiteNumber(value.longitude ?? value.lng ?? value.lon),
  );
}

function source(label: string, state: ItineraryDataSource['state'], extras: Partial<ItineraryDataSource> = {}): ItineraryDataSource {
  return {
    label,
    state,
    ...extras,
  };
}

function waypointType(value: unknown, record: Record<string, unknown>): WaypointType | null {
  const token = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const searchable = [
    token,
    record.title,
    record.name,
    record.label,
    record.description,
    isRecord(record.metadata) ? record.metadata.type : null,
    isRecord(record.providerMetadata) ? record.providerMetadata.category : null,
  ].map((item) => String(item ?? '').toLowerCase()).join(' ');

  if (token === 'camp' || token === 'campsite' || token === 'camp_candidate' || token === 'campground') return 'camp_potential';
  if (token === 'overlook' || token === 'viewpoint' || token === 'scenic' || token === 'scenic_point') return 'scenic_stop';
  if (token === 'finish' || token === 'end') return 'trail_end';
  if (token === 'turn_around' || token === 'turnaround_point') return 'turnaround';
  if (token === 'road_access' || token === 'alternate_route' || token === 'escape' || token === 'rendezvous') return 'bailout';
  if (token === 'route_context_camp') return 'camp_potential';
  if (token === 'route_context_bailout') return 'bailout';
  if (TRAIL_INTELLIGENCE_TYPES.has(token as WaypointType)) return token as WaypointType;

  if (/\b(camp|campsite|campground)\b/.test(searchable)) return 'camp_potential';
  if (/\b(scenic|overlook|viewpoint|vista)\b/.test(searchable)) return 'scenic_stop';
  if (/\b(hazard|washout|rockfall|closure|obstacle)\b/.test(searchable)) return 'hazard';
  if (/\b(turnaround|turn around)\b/.test(searchable)) return 'turnaround';
  if (/\b(bailout|escape|rendezvous|road access|alternate route)\b/.test(searchable)) return 'bailout';
  return null;
}

function waypointPhase(type: WaypointType, explicitPhase: unknown): ItineraryPhase {
  const phase = String(explicitPhase ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (PHASES.has(phase as ItineraryPhase)) return phase as ItineraryPhase;
  if (type === 'exit') return 'trail_exit';
  return 'trail_navigation';
}

function waypointTitle(record: Record<string, unknown>, fallback: string): string {
  const value = record.title ?? record.name ?? record.label ?? fallback;
  const text = String(value ?? '').trim();
  return text || fallback;
}

function waypointDescription(record: Record<string, unknown>): string | null {
  const description = String(record.description ?? '').trim();
  if (description) return description;
  if (typeof record.notes === 'string') return record.notes;
  if (Array.isArray(record.notes)) return record.notes.map(String).filter(Boolean).join(' ');
  return null;
}

function waypointNotes(record: Record<string, unknown>): string[] | undefined {
  const notes = Array.isArray(record.notes)
    ? record.notes.map(String).filter(Boolean)
    : typeof record.notes === 'string' && record.notes.trim()
      ? [record.notes.trim()]
      : [];
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.map((warning) => {
        if (typeof warning === 'string') return warning;
        if (isRecord(warning)) return String(warning.message ?? warning.code ?? '').trim();
        return '';
      }).filter(Boolean)
    : [];
  const combined = [...notes, ...warnings];
  return combined.length > 0 ? combined : undefined;
}

function isUserAddedWaypoint(record: Record<string, unknown>): boolean {
  if (record.isUserAdded === true || record.userAdded === true) return true;
  const sourceText = String(record.source ?? record.provider ?? '').toLowerCase();
  return /\b(user|operator|manual)\b/.test(sourceText.replace(/[_-]+/g, ' '));
}

function isEcsSuggestedWaypoint(record: Record<string, unknown>, sourceKind: string): boolean {
  if (record.isEcsSuggested === true || record.ecsSuggested === true) return true;
  if (isUserAddedWaypoint(record)) return false;
  const sourceText = `${sourceKind} ${String(record.source ?? record.provider ?? '')}`.toLowerCase();
  const normalizedSourceText = sourceText.replace(/[_-]+/g, ' ');
  return /\b(ecs|route context|scoring|suggested)\b/.test(normalizedSourceText);
}

function dataSource(record: Record<string, unknown>, sourceKind: string, isUserAdded: boolean): ItineraryDataSource {
  if (isRecord(record.source) && typeof record.source.label === 'string' && typeof record.source.state === 'string') {
    return record.source as ItineraryDataSource;
  }
  const provider = String(record.provider ?? (isRecord(record.providerMetadata) ? record.providerMetadata.providerId : '') ?? '').trim() || null;
  const sourceValue = String(record.source ?? sourceKind).trim() || sourceKind;
  return source('trail_waypoint_intelligence', isUserAdded ? 'manual' : 'cached', {
    source: sourceValue,
    provider,
    confidence: confidenceNumber(record.confidence ?? record.score ?? record.reliability),
  });
}

function confidenceScore(record: Record<string, unknown>): number | null {
  return confidenceNumber(record.confidenceScore ?? record.score ?? record.confidence ?? record.reliability);
}

function routeHasTrailGeometry(trailRoute?: ItineraryRoute | null): boolean {
  return (trailRoute?.geometry?.length ?? 0) >= 2 || (trailRoute?.segments?.some((segment) => (segment.geometry?.length ?? 0) >= 2) ?? false);
}

function routeContextCampEndpointRecords(
  routeContext: TripBuilderRouteContextInput,
): Array<{ record: Record<string, unknown>; sourceKind: string }> {
  const plan = routeContext.campEndpointPlan;
  if (!plan || !Array.isArray(plan.endpointCandidates)) return [];
  const selectedIds = new Set((plan.selectedEndpointIds ?? []).filter(Boolean));
  // Recommendations remain visible in CampOps, but only an explicit selection may alter a trip plan.
  if (selectedIds.size === 0) return [];
  return plan.endpointCandidates
    .filter((item) => {
      const candidateId = item.candidate?.id;
      if (!candidateId) return false;
      return selectedIds.has(candidateId);
    })
    .map((item) => {
      const candidate = item.candidate;
      const enrichment = item.enrichment;
      const routeEndpoint = item.routeEndpoint;
      const score = confidenceNumber(candidate.score ?? enrichment?.dataConfidence);
      const warnings = [
        ...(plan.warnings ?? []),
        ...(enrichment?.dataLimitations ?? []),
      ].filter(Boolean);
      return {
        record: {
          id: candidate.id,
          type: 'route_context_camp',
          title: candidate.name ?? 'Camp Endpoint candidate',
          description: candidate.description ?? 'CampOps candidate endpoint; verify exact overnight occupancy before use.',
          coordinate: candidate.location,
          routeMileMarker: routeEndpoint.routeMileMarker,
          source: source('campops_route_endpoint_plan', 'cached', {
            source: candidate.source ?? 'route_endpoint_candidate',
            confidence: score,
          }),
          score,
          confidence: score == null
            ? {
                value: null,
                reasons: ['CampOps route endpoint confidence was unavailable.'],
              }
            : {
                value: score,
                reasons: [
                  `CampOps endpoint role: ${item.role}.`,
                  `Route side: ${routeEndpoint.routeSide}.`,
                ],
              },
          isEcsSuggested: true,
          warnings,
          metadata: {
            campEndpointRole: item.role,
            routeSide: routeEndpoint.routeSide,
            routeMileMarker: routeEndpoint.routeMileMarker,
            distanceFromRouteMiles: routeEndpoint.distanceFromRouteMiles,
            detourMiles: routeEndpoint.detourMiles,
            exactness: routeEndpoint.exactness,
            windowId: routeEndpoint.windowId,
            nearestSegmentIndex: routeEndpoint.nearestSegmentIndex,
            selectedByCampOps: true,
            dataUsed: {
              source: candidate.source,
              sourceConfidence: candidate.sourceConfidence,
              legalStatus: enrichment?.legalStatus,
              legalConfidence: enrichment?.legalConfidence,
              dataConfidence: enrichment?.dataConfidence,
              dataLimitations: enrichment?.dataLimitations ?? [],
            },
          },
          providerMetadata: {
            providerId: 'campops_route_endpoint_plan',
            category: 'camp_endpoint',
            role: item.role,
            routeSide: routeEndpoint.routeSide,
          },
        } as Record<string, unknown>,
        sourceKind: 'campops_route_endpoint_candidate',
      };
    });
}

function routeContextRecords(routeContext?: TripBuilderRouteContextInput | null): Array<{ record: Record<string, unknown>; sourceKind: string }> {
  if (!routeContext) return [];
  const direct = Array.isArray(routeContext.trailWaypoints)
    ? routeContext.trailWaypoints
        .filter(isRecord)
        .map((record) => ({ record, sourceKind: 'route_context_trail_waypoint' }))
    : [];
  const camps = (routeContext.campCandidates ?? []).map((candidate) => ({
    record: {
      ...candidate,
      type: 'route_context_camp',
      title: candidate.name ?? 'Camp candidate',
      source: candidate.source ?? 'route_context_engine',
    } as Record<string, unknown>,
    sourceKind: 'route_context_camp_candidate',
  }));
  const campEndpoints = routeContextCampEndpointRecords(routeContext);
  const bailouts = (routeContext.bailoutCandidates ?? []).map((candidate) => ({
    record: {
      ...candidate,
      type: 'route_context_bailout',
      title: candidate.label ?? candidate.name ?? 'Bailout candidate',
      source: candidate.source ?? 'route_context_engine',
    } as Record<string, unknown>,
    sourceKind: 'route_context_bailout_candidate',
  }));
  return [...direct, ...camps, ...campEndpoints, ...bailouts];
}

function explicitRecords(records?: ResolveTrailWaypointsArgs['waypointRecords']): Array<{ record: Record<string, unknown>; sourceKind: string }> {
  return (records ?? [])
    .filter(isRecord)
    .map((record) => ({ record, sourceKind: 'suggested_route_waypoint' }));
}

function waypointKey(waypoint: ItineraryWaypoint): string {
  const coordinate = waypoint.coordinate;
  const coordinateKey = coordinate
    ? `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`
    : 'no-coordinate';
  return `${waypoint.type}:${waypoint.title.toLowerCase()}:${coordinateKey}`;
}

function normalizeRecord(args: {
  record: Record<string, unknown>;
  sourceKind: string;
  routeId: string;
  index: number;
}): ItineraryWaypoint | null {
  const type = waypointType(
    args.record.waypointType ?? args.record.type ?? args.record.category ?? args.record.ecsWaypointType,
    args.record,
  );
  if (!type) return null;

  const coordinate = normalizeCoordinate(args.record.coordinate ?? args.record.location ?? args.record.point ?? args.record);
  if (!coordinate) return null;

  const isUserAdded = isUserAddedWaypoint(args.record);
  const isEcsSuggested = isEcsSuggestedWaypoint(args.record, args.sourceKind);
  const sourceValue = dataSource(args.record, args.sourceKind, isUserAdded);
  const score = confidenceScore(args.record);
  const metadata = isRecord(args.record.metadata) ? args.record.metadata : {};

  return {
    id: String(args.record.id ?? `${args.routeId}-trail-waypoint-${args.index + 1}`),
    type,
    phase: waypointPhase(type, args.record.phase),
    title: waypointTitle(args.record, `Trail waypoint ${args.index + 1}`),
    description: waypointDescription(args.record),
    coordinate,
    sequence: args.index + 1,
    routeMileMarker: finiteNumber(args.record.routeMileMarker ?? args.record.mileMarker),
    source: sourceValue,
    confidence: normalizeConfidence(args.record.confidence ?? args.record.reliability ?? score, score != null ? 'medium' : 'unknown'),
    confidenceScore: score,
    isUserAdded,
    isEcsSuggested,
    dataUsed: [sourceValue],
    notes: waypointNotes(args.record),
    metadata: {
      ...metadata,
      waypointSourceKind: args.sourceKind,
      confidenceScore: score,
      isUserAdded,
      isEcsSuggested,
      providerMetadata: isRecord(args.record.providerMetadata) ? args.record.providerMetadata : null,
      // Future providers can attach normalized source records here without implying confirmation.
      providerHooks: ['supabase_route_records', 'mapbox_trail_geometry', 'osm_features', 'ecs_scoring_rules', 'user_added_points', 'offline_prep_pack'],
    },
  };
}

function dedupeWaypoints(waypoints: ItineraryWaypoint[]): ItineraryWaypoint[] {
  const seen = new Set<string>();
  const unique: ItineraryWaypoint[] = [];
  waypoints.forEach((waypoint) => {
    const key = waypointKey(waypoint);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({
      ...waypoint,
      sequence: unique.length + 1,
    });
  });
  return unique;
}

function dedupeDataSources(sources: ItineraryDataSource[]): ItineraryDataSource[] {
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = `${item.label}:${item.state}:${item.source ?? ''}:${item.provider ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function waypointScoringMetadata(score: ScoredTrailWaypointCandidate): Record<string, unknown> {
  return {
    waypointType: score.waypointType,
    confidenceScore: score.confidenceScore,
    usefulnessScore: score.usefulnessScore,
    safetyScore: score.safetyScore,
    sourceScore: score.sourceScore,
    priorityScore: score.priorityScore,
    proximityToRoute: score.proximityToRoute,
    distanceFromTrailhead: score.distanceFromTrailhead,
    vehicleSuitability: score.vehicleSuitability,
    warnings: score.warnings,
    metadata: score.metadata,
  };
}

export function resolveTrailWaypoints({
  trailRoute = null,
  trailheadStart = null,
  trailEnd = null,
  routeContext = null,
  userPreferences = null,
  vehicleProfile = null,
  knownRoads = null,
  mapboxData = null,
  supabaseRouteData = null,
  waypointRecords = null,
  routeId = 'suggested-route',
}: ResolveTrailWaypointsArgs): ResolvedTrailWaypoints {
  const records = [
    ...explicitRecords(waypointRecords),
    ...routeContextRecords(routeContext),
  ];
  const providerHooks = [
    'supabase_route_records',
    'mapbox_trail_geometry',
    'osm_features',
    'ecs_scoring_rules',
    'user_added_points',
    'offline_prep_pack',
  ];

  if (!routeHasTrailGeometry(trailRoute)) {
    return {
      trailWaypoints: [],
      dataUsed: [source('trail_waypoint_intelligence', 'missing', {
        notes: ['Trail waypoint intelligence requires true trail geometry; no waypoints were inferred.'],
      })],
      warnings: ['Trail route geometry is unavailable, so trail waypoint intelligence returned no waypoints.'],
      metadata: {
        sourceRecordCount: records.length,
        normalizedWaypointCount: 0,
        scoredWaypointCount: 0,
        bailoutConfidenceCount: 0,
        missingTrailGeometry: true,
        providerHooks,
      },
    };
  }

  const normalized = dedupeWaypoints(
    records
      .map((item, index) => normalizeRecord({
        ...item,
        routeId: String(routeId ?? 'suggested-route'),
        index,
      }))
      .filter((waypoint): waypoint is ItineraryWaypoint => waypoint != null),
  );
  const scored = scoreTrailWaypointCandidates({
    candidates: normalized,
    trailRoute,
    trailheadStart,
    trailEnd,
    vehicleProfile,
    userPreferences,
    routeContext,
  });
  const scoringById = new Map(scored.map((score) => [score.waypointId, score]));
  const bailoutConfidenceById = new Map(scored
    .filter((score) => score.waypointType === 'bailout' || score.waypointType === 'turnaround')
    .map((score) => [
      score.waypointId,
      resolveBailoutRouteConfidence({
        bailoutWaypoint: score.waypoint,
        trailRoute,
        knownRoads,
        mapboxData,
        supabaseRouteData,
        routeContext,
      }),
    ]));
  const scoredWaypoints = normalized.map((waypoint) => {
    const score = scoringById.get(waypoint.id);
    const bailoutConfidence = bailoutConfidenceById.get(waypoint.id);
    if (!score && !bailoutConfidence) return waypoint;
    return {
      ...waypoint,
      metadata: {
        ...(isRecord(waypoint.metadata) ? waypoint.metadata : {}),
        ...(score ? { trailWaypointScoring: waypointScoringMetadata(score) } : {}),
        ...(bailoutConfidence ? { bailoutRouteConfidence: bailoutConfidence } : {}),
      },
    };
  });
  const dataUsed = normalized.length > 0
    ? dedupeDataSources([
        ...normalized.flatMap((waypoint) => waypoint.dataUsed ?? [waypoint.source]),
        ...Array.from(bailoutConfidenceById.values()).flatMap((confidence) => confidence.dataUsed),
      ])
    : [source('trail_waypoint_intelligence', 'missing', {
        notes: ['No real trail waypoint source records were available; no waypoints were generated.'],
      })];

  return {
    trailWaypoints: scoredWaypoints,
    dataUsed,
    warnings: [],
    metadata: {
      sourceRecordCount: records.length,
      normalizedWaypointCount: normalized.length,
      scoredWaypointCount: scored.length,
      bailoutConfidenceCount: bailoutConfidenceById.size,
      missingTrailGeometry: false,
      providerHooks,
    },
  };
}
