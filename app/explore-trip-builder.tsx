import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';

import { parseGeoFile, getPrimaryRouteCoordinates } from '../lib/gpxParser';
import { normalizeCanonicalRouteGeometry } from '../lib/routeGeometryLifecycle';
import { classifyExploreRouteAuthority } from '../lib/exploreRouteAuthority';
import Header from '../components/Header';
import { ExplorePlanningTabs } from '../components/discover/ExplorePlanningTabs';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import TopoBackground from '../components/TopoBackground';
import { ECS, TACTICAL } from '../lib/theme';
import MapRenderer, { type CameraCommand } from '../components/navigate/MapRenderer';
import {
  DEFAULT_MAP_STYLE,
  getMapboxToken,
  getMapboxTokenSync,
} from '../lib/mapConfig';
import { loadOpportunitiesWithCompatibility, type ExpeditionOpportunity } from '../lib/discoverEngine';
import { buildProfileFromSpecs } from '../lib/rigCompatibilityEngine';
import { extractExploreRouteCampMarkers } from '../lib/exploreRouteCampHandoff';
import {
  buildExploreRouteReadinessAssessment,
  getExploreRouteReadinessSummary,
} from '../lib/readiness/exploreRouteReadiness';
import { getShellBottomClearance } from '../lib/shellLayout';
import { hapticMicro } from '../lib/haptics';
import { recordBadgeIdentitySafeSignal } from '../lib/expedition/expeditionBadgeStore';
import {
  buildTripItineraryFromSuggestedRoute,
  buildTripPlan,
  clearTripBuilderRouteHandoff,
  createMapboxRouteContextProviderRegistry,
  filterBailoutPlanCandidates,
  acceptTripItineraryEditItem,
  addUserItineraryStop,
  addUserTrailWaypoint,
  applyTripItineraryEditSession,
  buildApproachResupplySearchAnchors,
  createTripItineraryEditSession,
  dismissTripItineraryEditItem,
  getTripItineraryReview,
  getTripItinerarySummary,
  getTripConfidenceSummary,
  isUsableRouteContext,
  loadTripBuilderRouteHandoff,
  reorderTripItineraryStop,
  rankApproachResupplyOptions,
  resolvePreTrailStops,
  routeContextRoutePoints,
  routeContextSupplyCandidatesToResupplyPoints,
  routeContextTrailheadCoordinate,
  routeContextToTripBuilderItineraryContext,
  routeWithRouteContext,
  type ApproachResupplyCandidate,
  type CampCandidate,
  type GroupType,
  type TimeWindow,
  type PreTrailStopCandidate,
  type PreTrailStopCandidateInput,
  type TripBuilderCoordinate,
  type TripBuilderInput,
  type TripBuilderRouteContextInput,
  type TripBuilderVehicleProfile,
  type TripPlan,
  type TripBuilderRouteInput,
  type TripPlanStop,
  type TripPlanReferencePoint,
  type TripPriority,
  type TripType,
  type ResupplyCategory,
  type ResupplyStatus,
  type ExitPoint,
  type ResupplyCategoryPlan,
  type ResupplyPoint,
  type SmartResupplyPlan,
  type SelectedPreTrailOption,
  type SuggestedRoute,
  type TripBuilderConfidence,
  type TripItineraryEditItemStatus,
  type TripItineraryEditSession,
  type TripItinerary,
  type TripItineraryReviewAvailability,
  type TripItineraryReviewModel,
  type TripItinerarySummaryPhaseStatus,
  type TripItinerarySummaryViewModel,
  type TripConfidenceCategory,
  type TripConfidenceReasonTone,
  type TripConfidenceSectionStatus,
  type TripConfidenceSummaryViewModel,
} from '../lib/tripBuilder';
import {
  getOfflinePrepRouteCoordinates,
  saveOfflinePrepPackHandoff,
} from '../lib/offlinePrepPack';
import {
  loadExplorePlanningRouteContext,
  upsertExplorePlanningRoute,
} from '../lib/explore/explorePlanningRouteContextStore';
import { activeTripModeStore } from '../lib/activeTripMode';
import { loadoutItemStore, loadoutStore } from '../lib/loadoutStore';
import {
  createRoadSearchSessionToken,
  fetchRoadRoute,
  type RoadNavDestination,
  resolveRoadDestination,
  searchRoadDestinations,
  type RoadNavSearchSuggestion,
} from '../lib/mapboxRoadNavigation';
import type { GPSPosition } from '../lib/useGPSLocation';
import { useThrottledGPS } from '../lib/useThrottledGPS';
import {
  routeContextOrchestrator,
  type RouteContext,
  type SupplyCandidate,
  type SupplyMode,
} from '../lib/routeContext';
import { fsReadFileFromPickerUri } from '../lib/fsCompat';

let lastTripBuilderPlanState: {
  selectedRouteId: string | null;
  plan: TripPlan | null;
  visible: boolean;
  itinerarySaved: boolean;
  itineraryEditSession: TripItineraryEditSession | null;
} = {
  selectedRouteId: null,
  plan: null,
  visible: false,
  itinerarySaved: false,
  itineraryEditSession: null,
};

const TRIP_TYPE_OPTIONS: { value: TripType; label: string }[] = [
  { value: 'day_trip', label: 'Day Trip' },
  { value: 'overnight_camping', label: 'Overnight' },
  { value: 'weekend_overland', label: 'Weekend' },
  { value: 'multi_day_expedition', label: 'Multi-Day' },
  { value: 'scenic_exploration', label: 'Scenic' },
  { value: 'technical_trail_run', label: 'Technical' },
];

const DEFAULT_TRIP_BUILDER_TRIP_TYPE: TripType = 'day_trip';
const DEFAULT_TRIP_BUILDER_GROUP_TYPE: GroupType = 'solo';
const DEFAULT_TRIP_BUILDER_PRIORITIES: TripPriority[] = ['low_risk'];

function routeContextSupplyModeForTripBuilder(
  preference: TripBuilderInput['smartResupplyPreference'],
): SupplyMode {
  if (preference === 'fuel_only') return 'gas';
  if (preference === 'fuel_supplies') return 'gas_and_grocery';
  return 'none';
}

const TRIP_BUILDER_ROUTE_CONTEXT_FEATURE_FLAGS = {
  'ecs.routeContextEngine.enabled': true,
  'ecs.routeContextEngine.prefetchOnTrailSelect': true,
  'ecs.routeContextEngine.trailheadAnchoredSupplyChain': true,
  'ecs.routeContextEngine.enableCampCandidates': true,
  'ecs.routeContextEngine.enableBailoutCandidates': true,
  'ecs.routeContextEngine.debugLogging': false,
} as const;

const GROUP_OPTIONS: { value: GroupType; label: string }[] = [
  { value: 'solo', label: 'Solo' },
  { value: 'two_vehicle', label: '2 Vehicle' },
  { value: 'small_group', label: 'Small Group' },
  { value: 'convoy', label: 'Convoy' },
];

const PRIORITY_OPTIONS: { value: TripPriority; label: string; icon: string }[] = [
  { value: 'camping', label: 'Camping', icon: 'bonfire-outline' },
  { value: 'scenic_stops', label: 'Scenic', icon: 'camera-outline' },
  { value: 'technical_terrain', label: 'Technical', icon: 'trail-sign-outline' },
  { value: 'low_risk', label: 'Low Risk', icon: 'shield-checkmark-outline' },
  { value: 'remote_travel', label: 'Remote', icon: 'radio-outline' },
  { value: 'fuel_efficiency', label: 'Fuel', icon: 'speedometer-outline' },
  { value: 'family_friendly', label: 'Family', icon: 'people-outline' },
  { value: 'photography_overlooks', label: 'Photos', icon: 'aperture-outline' },
];

type TripPlanMapScope = 'itinerary' | 'camps' | 'exits' | 'resupply';

type TripMapCoordinate = {
  latitude: number;
  longitude: number;
};

type TripPlanMapMarker = TripMapCoordinate & {
  id: string;
  title: string;
  subtitle?: string;
  type: string;
  color: string;
  mapChar: string;
  connectToRouteLine?: boolean;
};

type TripPlanMapModel = {
  points: TripMapCoordinate[];
  markers: TripPlanMapMarker[];
  title: string;
  subtitle: string;
  focusMarker: TripPlanMapMarker | null;
  cameraCommand: CameraCommand | null;
};

type ItineraryInsertState = {
  index: number;
  query: string;
};

type SmartResupplyPreference = 'fuel_only' | 'fuel_supplies' | 'no';

type BailoutPlanPreference = 'yes' | 'no';
type CampPlanPreference = 'skip' | 'pins';

type RouteImportState = {
  status: 'idle' | 'loading' | 'error' | 'success';
  message: string | null;
};

type SmartResupplyPoi = {
  id: string;
  title: string;
  subtitle: string | null;
  category: 'fuel' | 'food_supplies';
  coordinate: TripMapCoordinate;
  distanceFromRouteStartMiles: number | null;
  distanceFromTrailheadMiles: number | null;
  distanceFromApproachRouteMiles: number | null;
  routeDeviationMiles: number | null;
  remainingApproachMilesToTrailhead: number | null;
  approachProgressRatio: number | null;
  approachScore: number | null;
  beforeTrailEntry: boolean | null;
  fallbackState: 'approach_route' | 'trailhead_only';
  warnings: string[];
  diesel: boolean;
  groceries: boolean;
  sourceType: string;
  suggestion: RoadNavSearchSuggestion;
};

type SmartResupplySearchKind = 'fuel' | 'supplies';
type SmartResupplySearchBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type BailoutPlanPoint = {
  id: string;
  title: string;
  subtitle: string | null;
  coordinate: TripMapCoordinate;
  source: 'ecs_suggested' | 'mapbox_search' | 'operator_drop';
  distanceFromRouteStartMiles: number | null;
};

type CampPlanPin = {
  id: string;
  title: string;
  coordinate: TripMapCoordinate;
  note: string | null;
};

type PreparedTripRoutePreview = {
  routeId: string;
  start: TripMapCoordinate | null;
  end: TripMapCoordinate | null;
  routePoints: TripMapCoordinate[];
};

type ResupplyOverride = 'unknown' | 'provided' | 'not_required';

const ITINERARY_STANDARD_COLOR = '#66BB6A';
const ITINERARY_ALTERNATE_COLOR = TACTICAL.amber;
const ITINERARY_BAILOUT_COLOR = '#EF5350';
const ITINERARY_BAILOUT_SOURCE = 'user_itinerary_bailout';
const ITINERARY_STANDARD_SOURCE = 'user_itinerary_standard';
const ITINERARY_BAILOUT_NOTE = 'Marked by operator as an emergency bailout waypoint.';
const ITINERARY_BAILOUT_ORIGINAL_TYPE_PREFIX = 'Original itinerary type: ';
const ITINERARY_BAILOUT_ORIGINAL_SOURCE_PREFIX = 'Original itinerary source: ';
const TRIP_PLAN_STOP_TYPES = new Set<TripPlanStop['type']>([
  'start',
  'finish',
  'waypoint',
  'scenic_stop',
  'camp',
  'backup_camp',
  'exit',
  'resupply',
  'fuel',
  'water',
  'supply',
  'repair',
  'medical',
  'ranger_station',
  'camp_search',
  'planning_checkpoint',
  'unknown',
]);
const TRIP_BUILDER_IMPORT_SELECTABLE_EXTENSIONS = ['gpx', 'xml', 'kml', 'geojson', 'json'];
const TRIP_BUILDER_IMPORT_SUPPORTED_COPY = '.gpx, .kml, .geojson, .json, or .xml';
const SMART_RESUPPLY_OPTIONS: { value: SmartResupplyPreference; label: string; detail: string }[] = [
  { value: 'fuel_only', label: 'Fuel only', detail: 'Plan fuel margin stops only.' },
  { value: 'fuel_supplies', label: 'Fuel + groceries/supplies', detail: 'Include fuel and supply margin.' },
  { value: 'no', label: 'No', detail: 'Skip smart resupply planning.' },
];
const BAILOUT_PLAN_OPTIONS: { value: BailoutPlanPreference; label: string; detail: string }[] = [
  { value: 'yes', label: 'Yes', detail: 'Build emergency exit thinking into the plan.' },
  { value: 'no', label: 'No', detail: 'Do not request bailout planning.' },
];
const SMART_RESUPPLY_FUEL_QUERY = 'gas station fuel diesel';
const SMART_RESUPPLY_SUPPLY_QUERY = 'grocery store supermarket supplies';
const SMART_RESUPPLY_OPTION_LIMIT = 5;
const SMART_RESUPPLY_SEARCH_LIMIT = 20;
const SMART_RESUPPLY_SEARCH_RADIUS_TIERS_MILES = [8, 16, 30] as const;
const SMART_RESUPPLY_MAX_ROUTE_DEVIATION_MILES = 12;
const BAILOUT_SEARCH_QUERY = 'trailhead parking road access ranger station highway';
const BAILOUT_OPTION_LIMIT = 5;
const BAILOUT_SEARCH_LIMIT = 10;
const RESUPPLY_OVERRIDE_CATEGORIES = new Set<ResupplyCategory>(['water', 'food_supplies', 'repair', 'medical']);

function makePlanIdPart(value: string | null | undefined): string {
  return String(value ?? 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'trip';
}

function isTripPlanStopType(value: string | null | undefined): value is TripPlanStop['type'] {
  return !!value && TRIP_PLAN_STOP_TYPES.has(value as TripPlanStop['type']);
}

function renumberTripPlanStops(stops: TripPlanStop[]): TripPlanStop[] {
  return stops.map((stop, index) => ({
    ...stop,
    sequence: index + 1,
  }));
}

function updateTripPlanStops(plan: TripPlan, stops: TripPlanStop[]): TripPlan {
  return {
    ...plan,
    suggestedStops: renumberTripPlanStops(stops),
  };
}

function inferAddedStopType(suggestion: Pick<RoadNavSearchSuggestion, 'title' | 'subtitle'>): TripPlanStop['type'] {
  const text = `${suggestion.title} ${suggestion.subtitle ?? ''}`.toLowerCase();
  if (/\b(gas|fuel|diesel|shell|chevron|exxon|mobil|76|valero)\b/.test(text)) return 'fuel';
  if (/\b(water|spring|hydration)\b/.test(text)) return 'water';
  if (/\b(grocery|market|suppl|store)\b/.test(text)) return 'supply';
  if (/\b(repair|service|tire|mechanic|auto)\b/.test(text)) return 'repair';
  if (/\b(hospital|clinic|medical|urgent care|pharmacy)\b/.test(text)) return 'medical';
  return 'resupply';
}

function plannedDayForInsert(stops: TripPlanStop[], index: number): number {
  const previous = stops[Math.max(0, index - 1)];
  const next = stops[index];
  return previous?.plannedDay ?? next?.plannedDay ?? 1;
}

function buildUserItineraryStop(
  plan: TripPlan,
  suggestion: RoadNavSearchSuggestion,
  coordinate: TripMapCoordinate,
  index: number,
  currentStops: TripPlanStop[],
): TripPlanStop {
  const type = inferAddedStopType(suggestion);
  return {
    id: `${makePlanIdPart(plan.id)}-user-stop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: suggestion.title,
    sequence: index + 1,
    plannedDay: plannedDayForInsert(currentStops, index),
    coordinate,
    routeMileMarker: null,
    etaOffsetHours: null,
    source: 'user_itinerary_search',
    confidence: 'medium',
    notes: [
      suggestion.subtitle
        ? `Added by operator from Mapbox search: ${suggestion.subtitle}.`
        : 'Added by operator from Mapbox search.',
    ],
  };
}

function stopNoteIncludes(stop: TripPlanStop, pattern: RegExp): boolean {
  return (stop.notes ?? []).some((note) => pattern.test(note.toLowerCase()));
}

function isBailoutItineraryStop(stop: TripPlanStop): boolean {
  if (stop.referenceType === 'bailout') return true;
  if (stop.source === ITINERARY_BAILOUT_SOURCE) return true;
  const source = stop.source.toLowerCase();
  if (source.includes('bailout') || source.includes('emergency')) return true;
  return stop.type === 'exit' && stopNoteIncludes(stop, /\b(bailout|emergency|escape)\b/);
}

function isGuidanceConnectedTripPlanStop(stop: TripPlanStop): boolean {
  return stop.guidanceRole !== 'reference_only' && !isBailoutItineraryStop(stop);
}

function isCampReferenceStop(stop: TripPlanStop): boolean {
  return stop.guidanceRole === 'reference_only' && stop.referenceType === 'camp_candidate';
}

function isAlternateItineraryStop(stop: TripPlanStop): boolean {
  if (isBailoutItineraryStop(stop)) return false;
  const source = stop.source.toLowerCase();
  return stop.type === 'exit' || stop.type === 'backup_camp' || source.includes('alternate') || source.includes('backup');
}

function itineraryStopTone(stop: TripPlanStop): { color: string; label: 'standard' | 'alternate' | 'bailout' } {
  if (isBailoutItineraryStop(stop)) return { color: ITINERARY_BAILOUT_COLOR, label: 'bailout' };
  if (isAlternateItineraryStop(stop)) return { color: ITINERARY_ALTERNATE_COLOR, label: 'alternate' };
  return { color: ITINERARY_STANDARD_COLOR, label: 'standard' };
}

function extractOriginalBailoutType(stop: TripPlanStop): TripPlanStop['type'] {
  const typeNote = (stop.notes ?? []).find((note) => note.startsWith(ITINERARY_BAILOUT_ORIGINAL_TYPE_PREFIX));
  const rawType = typeNote
    ?.slice(ITINERARY_BAILOUT_ORIGINAL_TYPE_PREFIX.length)
    .replace(/\.$/, '')
    .trim();
  return isTripPlanStopType(rawType) ? rawType : 'waypoint';
}

function extractOriginalBailoutSource(stop: TripPlanStop): string {
  const sourceNote = (stop.notes ?? []).find((note) => note.startsWith(ITINERARY_BAILOUT_ORIGINAL_SOURCE_PREFIX));
  return sourceNote
    ?.slice(ITINERARY_BAILOUT_ORIGINAL_SOURCE_PREFIX.length)
    .replace(/\.$/, '')
    .trim() || ITINERARY_STANDARD_SOURCE;
}

function stripBailoutMetadataNotes(stop: TripPlanStop): string[] {
  return (stop.notes ?? []).filter((note) => (
    note !== ITINERARY_BAILOUT_NOTE &&
    !note.startsWith(ITINERARY_BAILOUT_ORIGINAL_TYPE_PREFIX) &&
    !note.startsWith(ITINERARY_BAILOUT_ORIGINAL_SOURCE_PREFIX)
  ));
}

function toggleItineraryStopBailout(stop: TripPlanStop): TripPlanStop {
  if (isBailoutItineraryStop(stop)) {
    const { guidanceRole, referenceType, ...rest } = stop;
    return {
      ...rest,
      type: extractOriginalBailoutType(stop),
      source: extractOriginalBailoutSource(stop),
      notes: stripBailoutMetadataNotes(stop),
    };
  }

  return {
    ...stop,
    type: 'exit',
    source: ITINERARY_BAILOUT_SOURCE,
    confidence: stop.confidence === 'unknown' ? 'medium' : stop.confidence,
    guidanceRole: 'reference_only',
    referenceType: 'bailout',
    notes: [
      ITINERARY_BAILOUT_NOTE,
      `${ITINERARY_BAILOUT_ORIGINAL_TYPE_PREFIX}${stop.type}.`,
      `${ITINERARY_BAILOUT_ORIGINAL_SOURCE_PREFIX}${stop.source}.`,
      ...stripBailoutMetadataNotes(stop),
      'This bailout point remains unconnected from the projected guidance line.',
    ],
  };
}

function campingImplied(tripType: TripType): boolean {
  return tripType === 'overnight_camping' || tripType === 'weekend_overland' || tripType === 'multi_day_expedition';
}

function timeWindowForTripType(tripType: TripType): TimeWindow {
  if (tripType === 'overnight_camping') return 'overnight';
  if (tripType === 'weekend_overland') return 'weekend';
  if (tripType === 'multi_day_expedition') return 'custom';
  return 'full_day';
}

function formatMiles(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 0 : 1)} mi` : 'Unknown';
}

function simplifyImportedRouteCoords(coords: [number, number][], maxPoints = 1200): [number, number][] {
  if (!Array.isArray(coords) || coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const simplified = coords.filter((_, index) => index === 0 || index === coords.length - 1 || index % step === 0);
  return simplified.length > maxPoints
    ? simplified.slice(0, maxPoints - 1).concat([coords[coords.length - 1]])
    : simplified;
}

function coordinatesFromImportedGeoJson(value: unknown): [number, number][] {
  const normalized = normalizeCanonicalRouteGeometry(value, {
    authority: 'trail',
  });
  return normalized.valid ? normalized.coordinates : [];
}

function validateTripBuilderImportedRoute(fileName: string, content: string): {
  ext: string;
  routeName: string;
  coordinates: [number, number][];
} {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!TRIP_BUILDER_IMPORT_SELECTABLE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type .${ext || 'unknown'}. Use ${TRIP_BUILDER_IMPORT_SUPPORTED_COPY}.`);
  }

  const routeName = fileName.replace(/\.[^.]+$/, '').trim() || 'Imported Route';
  let coordinates: [number, number][] = [];
  if (ext === 'geojson' || ext === 'json') {
    coordinates = coordinatesFromImportedGeoJson(JSON.parse(content));
  } else {
    const parsed = parseGeoFile(fileName, content);
    coordinates = getPrimaryRouteCoordinates(parsed);
  }

  const simplified = simplifyImportedRouteCoords(coordinates);
  if (simplified.length < 2) {
    throw new Error('Imported route needs at least two valid route points.');
  }
  return { ext, routeName, coordinates: simplified };
}

function importedRouteDistanceMiles(coordinates: [number, number][]): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += tripMapCoordinateDistanceMiles(
      { latitude: coordinates[index - 1][1], longitude: coordinates[index - 1][0] },
      { latitude: coordinates[index][1], longitude: coordinates[index][0] },
    );
  }
  return Math.round(total * 10) / 10;
}

function buildTripBuilderImportedRoute(fileName: string, content: string): ExpeditionOpportunity {
  const { ext, routeName, coordinates } = validateTripBuilderImportedRoute(fileName, content);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const distanceMiles = importedRouteDistanceMiles(coordinates);
  const id = `trip-builder-import-${makePlanIdPart(routeName)}-${Date.now().toString(36)}`;
  return {
    id,
    name: routeName,
    region: 'Imported route',
    regionGroup: 'great-basin',
    distanceMiles,
    terrainType: 'Imported GPX route',
    remotenessScore: 5,
    estimatedFuelRequired: Math.max(1, Math.round((distanceMiles / 14) * 10) / 10),
    suggestedCamps: distanceMiles >= 45 ? 1 : 0,
    description: `Imported from ${fileName}.`,
    highlights: ['Operator supplied route file'],
    elevationGainFt: 0,
    estimatedDays: Math.max(1, Math.ceil(distanceMiles / 75)),
    bestSeason: 'Verify locally',
    permitRequired: false,
    imageTag: 'imported-route',
    startLat: first[1],
    startLng: first[0],
    estimatedTravelHours: Math.max(0.5, Math.round((distanceMiles / 18) * 10) / 10),
    coordinate: { lat: first[1], lng: first[0] },
    destinationCoordinate: { lat: last[1], lng: last[0] },
    endpointCoordinate: { lat: last[1], lng: last[0] },
    routeGeometry: {
      type: 'LineString',
      coordinates,
    },
    trailGeometry: {
      type: 'LineString',
      coordinates,
    },
    routeMetadata: {
      source: 'trip_builder_import',
      sourceFileName: fileName,
      sourceFileType: ext,
      importedAt: new Date().toISOString(),
      routePointCount: coordinates.length,
      isTrailGeometry: true,
      geometryRole: 'trail',
    },
  };
}

function formatHours(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 0 : 1)} hr` : 'Unknown';
}

function tripTypeLabel(value: TripType): string {
  return TRIP_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function statusColor(status: string): string {
  if (status === 'good') return '#66BB6A';
  if (status === 'medium') return TACTICAL.amber;
  if (status === 'low') return '#EF5350';
  return TACTICAL.textMuted;
}

function statusLabel(status: string): string {
  return status === 'unknown' ? 'DATA UNAVAILABLE' : status.toUpperCase();
}

function formatDistance(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${value.toFixed(value >= 10 ? 0 : 1)} mi`;
}

function formatRouteMarker(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `Mile ${value.toFixed(value >= 10 ? 0 : 1)}`;
}

function campCandidateLine(candidate: CampCandidate | null | undefined): string {
  if (!candidate) return 'Data unavailable';
  const details = [
    candidate.name,
    formatRouteMarker(candidate.routeMileMarker),
    `legal ${String(candidate.legalConfidence ?? 'unknown')}`,
    `access ${String(candidate.accessConfidence ?? 'unknown')}`,
  ].filter(Boolean);
  return details.join(' | ');
}

function exitPointLine(exitPoint: ExitPoint | null | undefined): string {
  if (!exitPoint) return 'Exit data unavailable. Verify before departure.';
  const details = [
    exitPoint.name,
    formatRouteMarker(exitPoint.routeMileMarker),
    exitPoint.type ? String(exitPoint.type).replace(/_/g, ' ') : null,
  ].filter(Boolean);
  return details.join(' | ');
}

function resupplyRows(plan: SmartResupplyPlan): ResupplyCategoryPlan[] {
  return [
    plan.fuel,
    plan.water,
    plan.supplies,
    plan.repair,
    plan.medical,
    plan.exitAccess,
  ];
}

function resupplyLabel(category: ResupplyCategoryPlan['category']): string {
  switch (category) {
    case 'fuel':
      return 'Fuel';
    case 'water':
      return 'Water';
    case 'food_supplies':
      return 'Food/Supplies';
    case 'repair':
      return 'Repair';
    case 'medical':
      return 'Medical';
    case 'exit_access':
      return 'Exit Access';
    default:
      return 'Support';
  }
}

function resupplyIcon(category: ResupplyCategoryPlan['category']): string {
  switch (category) {
    case 'fuel':
      return 'speedometer-outline';
    case 'water':
      return 'water-outline';
    case 'food_supplies':
      return 'bag-outline';
    case 'repair':
      return 'construct-outline';
    case 'medical':
      return 'medkit-outline';
    case 'exit_access':
      return 'exit-outline';
    default:
      return 'help-circle-outline';
  }
}

function resupplyPointsFromPlan(plan: TripPlan | null | undefined): ResupplyPoint[] {
  if (!plan?.smartResupplyPlan) return [];
  return resupplyRows(plan.smartResupplyPlan)
    .map((entry) => entry.keyPoint)
    .filter((point): point is ResupplyPoint => !!point && !!point.location);
}

function stopRouteEndpointCoordinate(plan: TripPlan, stop: TripPlanStop): TripMapCoordinate | null {
  if (stop.type === 'start' && isValidMapCoordinate(plan.route.startCoordinate)) return plan.route.startCoordinate;
  if (stop.type === 'finish' && isValidMapCoordinate(plan.route.endCoordinate)) return plan.route.endCoordinate;
  return null;
}

function coordinateForTripPlanStop(
  plan: TripPlan,
  stop: TripPlanStop,
  routePoints: TripMapCoordinate[] = [],
  options: { snapToRoute?: boolean } = {},
): TripMapCoordinate | null {
  const endpoint = stopRouteEndpointCoordinate(plan, stop);
  if (endpoint) {
    return options.snapToRoute ? nearestCoordinateOnRouteLine(routePoints, endpoint) ?? endpoint : endpoint;
  }
  if (isValidMapCoordinate(stop.coordinate)) {
    return options.snapToRoute
      ? nearestCoordinateOnRouteLine(routePoints, stop.coordinate) ?? stop.coordinate
      : stop.coordinate;
  }
  const interpolated = interpolateTripRouteCoordinate(routePoints, stop.routeMileMarker);
  if (interpolated) return interpolated;
  if (stop.type === 'start') return routePoints[0] ?? null;
  if (stop.type === 'finish') return routePoints[routePoints.length - 1] ?? null;
  return null;
}

function exitPointFromBailoutStop(
  plan: TripPlan,
  stop: TripPlanStop,
  routePoints: TripMapCoordinate[] = [],
): ExitPoint | null {
  if (!isBailoutItineraryStop(stop)) return null;
  const location = coordinateForTripPlanStop(plan, stop, routePoints);
  return {
    id: stop.id,
    name: stop.title,
    type: 'emergency_bailout',
    location,
    routeMileMarker: stop.routeMileMarker,
    priority: 1,
    source: stop.source,
    notes: stop.notes ?? [],
  };
}

function exitPointsFromPlan(plan: TripPlan | null | undefined, routePoints: TripMapCoordinate[] = []): ExitPoint[] {
  const points: ExitPoint[] = [];
  if (plan?.primaryExitPoint) points.push(plan.primaryExitPoint);
  const smartExit = plan?.smartResupplyPlan?.exitAccess.primaryExitPoint;
  if (smartExit && !points.some((point) => point.id === smartExit.id)) points.push(smartExit);
  plan?.suggestedStops
    .map((stop) => exitPointFromBailoutStop(plan, stop, routePoints))
    .filter((point): point is ExitPoint => !!point)
    .forEach((point) => {
      const duplicate = points.some((existing) => (
        existing.id === point.id ||
        (
          existing.routeMileMarker != null &&
          point.routeMileMarker != null &&
          Math.abs(existing.routeMileMarker - point.routeMileMarker) < 0.1 &&
          existing.name.toLowerCase() === point.name.toLowerCase()
        )
      ));
      if (!duplicate) points.push(point);
    });
  return points;
}

function campReferenceStopsFromPlan(plan: TripPlan | null | undefined): TripPlanStop[] {
  return plan?.suggestedStops.filter(isCampReferenceStop) ?? [];
}

function routeWaypointsFromPlan(plan: TripPlan, routePoints: TripMapCoordinate[] = []): unknown[] {
  return plan.suggestedStops
    .flatMap((stop) => {
      const coordinate = coordinateForTripPlanStop(plan, stop, routePoints);
      if (!coordinate) return [];
      return [{
        id: stop.id,
        name: stop.title,
        title: stop.title,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        waypointType: stop.type,
        routeMileMarker: stop.routeMileMarker,
        plannedDay: stop.plannedDay,
        source: stop.source,
        guidanceRole: stop.guidanceRole,
        referenceType: stop.referenceType,
        notes: stop.notes,
      }];
    });
}

function routeForOfflinePrep(
  route: TripBuilderRouteInput,
  plan: TripPlan,
  routePoints = routePointsForTripMap(route),
): TripBuilderRouteInput {
  const existingWaypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
  const prepRouteGeometry = routePoints.length >= 2
    ? routePoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    : route.routeGeometry;
  return {
    ...route,
    routeGeometry: prepRouteGeometry,
    waypoints: [...existingWaypoints, ...routeWaypointsFromPlan(plan, routePoints)],
    routeMetadata: {
      ...(route.routeMetadata ?? {}),
      offlinePrepPrepared: true,
      offlinePrepGeometrySource: routePoints.length >= 2
        ? 'trip_builder_selected_route_preview'
        : route.routeMetadata?.offlinePrepGeometrySource ?? null,
      offlinePrepGeometryPointCount: routePoints.length,
      tripBuilderPlanId: plan.id,
      tripBuilderStopCount: plan.suggestedStops.length,
      tripBuilderCampCandidateCount: [plan.primaryCampCandidate, plan.backupCampCandidate].filter(Boolean).length + campReferenceStopsFromPlan(plan).length,
      tripBuilderExitPointCount: exitPointsFromPlan(plan, routePoints).length,
      tripBuilderBailoutPointCount: plan.suggestedStops.filter(isBailoutItineraryStop).length,
      tripBuilderResupplyPointCount: resupplyPointsFromPlan(plan).length,
      referencePoints: plan.suggestedStops
        .filter((stop) => stop.guidanceRole === 'reference_only')
        .map((stop) => ({ id: stop.id, type: stop.type, referenceType: stop.referenceType ?? null })),
    },
  };
}

function routeToCampCandidates(route: ExpeditionOpportunity | null): CampCandidate[] {
  return extractExploreRouteCampMarkers(route).map((marker) => ({
    id: marker.id,
    name: marker.title,
    location: { latitude: marker.latitude, longitude: marker.longitude },
    score: marker.score,
    legalConfidence: marker.confidence,
    accessConfidence: marker.confidence,
    source: marker.source ?? 'explore_route_camp_marker',
    notes: [marker.subtitle],
  }));
}

function RouteSelectionCard({
  route,
  selected,
  onPress,
}: {
  route: ExpeditionOpportunity;
  selected: boolean;
  onPress: () => void;
}) {
  const routeAuthority = classifyExploreRouteAuthority(route);
  return (
    <TouchableOpacity
      style={[styles.routeOption, selected && styles.routeOptionSelected]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${route.name}`}
      testID={`trip-builder-route-option-${route.id}`}
    >
      <View style={styles.routeOptionIcon}>
        <Ionicons name={selected ? 'checkmark-circle' : 'map-outline'} size={15} color={selected ? TACTICAL.amber : TACTICAL.textMuted} />
      </View>
      <View style={styles.routeOptionCopy}>
        <Text style={styles.routeOptionTitle} numberOfLines={1}>{route.name}</Text>
        <Text style={styles.routeOptionMeta} numberOfLines={1}>
          {route.region} | {formatMiles(route.distanceMiles)} | {route.estimatedDays} day{route.estimatedDays === 1 ? '' : 's'}
        </Text>
        <Text style={styles.routeOptionAuthority} numberOfLines={1}>
          {routeAuthority.label} | {routeAuthority.sourceLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
  icon,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: string;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      testID={testID}
    >
      {icon ? (
        <Ionicons name={icon as any} size={11} color={selected ? '#081014' : TACTICAL.textMuted} />
      ) : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StopRow({ stop, index }: { stop: TripPlanStop; index: number }) {
  const note = stop.notes?.[0] ?? null;
  const sequenceLabel = formatTripMapLetter(index);
  const tone = itineraryStopTone(stop);
  return (
    <View style={styles.stopRow}>
      <View style={[styles.stopIndex, { borderColor: tone.color + '48', backgroundColor: tone.color + '18' }]}>
        <Text style={[styles.stopIndexText, { color: tone.color }]}>{sequenceLabel}</Text>
      </View>
      <View style={styles.stopCopy}>
        <Text style={styles.stopTitle}>{stop.title}</Text>
        <Text style={styles.stopMeta}>
          {stop.type.replace(/_/g, ' ').toUpperCase()} | Day {stop.plannedDay}
          {stop.routeMileMarker != null ? ` | mile ${Math.round(stop.routeMileMarker)}` : ''}
        </Text>
        {note ? <Text style={styles.stopNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

function SmartResupplyOptionCard({
  option,
  selected,
  markerLabel,
  onPress,
}: {
  option: SmartResupplyPoi;
  selected: boolean;
  markerLabel: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.smartResupplyOption, selected && styles.smartResupplyOptionSelected]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${option.title}`}
      accessibilityState={{ selected }}
      testID={`trip-builder-smart-resupply-option-${option.id}`}
    >
      <View style={[styles.smartResupplyMarker, selected && styles.smartResupplyMarkerSelected]}>
        <Text style={[styles.smartResupplyMarkerText, selected && styles.smartResupplyMarkerTextSelected]}>{markerLabel}</Text>
      </View>
      <View style={styles.smartResupplyOptionCopy}>
        <Text style={styles.smartResupplyOptionTitle} numberOfLines={1}>{option.title}</Text>
        <Text style={styles.smartResupplyOptionMeta} numberOfLines={1}>
          {option.fallbackState === 'trailhead_only'
            ? option.distanceFromTrailheadMiles != null
              ? `${option.distanceFromTrailheadMiles.toFixed(1)} mi from trailhead fallback`
              : 'Trailhead fallback'
            : option.remainingApproachMilesToTrailhead != null
              ? `${option.remainingApproachMilesToTrailhead.toFixed(1)} mi before trail entry`
              : 'On approach corridor'}
          {option.routeDeviationMiles != null ? ` | ${option.routeDeviationMiles.toFixed(1)} mi off approach` : ''}
          {option.subtitle ? ` | ${option.subtitle}` : ''}
        </Text>
        <View style={styles.smartResupplyPillRow}>
          {option.diesel ? (
            <View style={[styles.smartResupplyPill, styles.smartResupplyDieselPill]}>
              <Ionicons name="speedometer-outline" size={9} color="#081014" />
              <Text style={styles.smartResupplyDieselPillText}>DIESEL</Text>
            </View>
          ) : null}
          {option.groceries ? (
            <View style={styles.smartResupplyPill}>
              <Ionicons name="bag-outline" size={9} color={TACTICAL.amber} />
              <Text style={styles.smartResupplyPillText}>FUEL + GROCERIES</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={15} color={selected ? TACTICAL.amber : TACTICAL.textMuted} />
    </TouchableOpacity>
  );
}

function BailoutPlanOptionCard({
  option,
  selected,
  onPress,
}: {
  option: BailoutPlanPoint;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.bailoutOption, selected && styles.bailoutOptionSelected]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select bailout ${option.title}`}
      accessibilityState={{ selected }}
      testID={`trip-builder-bailout-option-${option.id}`}
    >
      <View style={[styles.bailoutOptionDot, selected && styles.bailoutOptionDotSelected]}>
        <Ionicons name={option.source === 'operator_drop' ? 'pin-outline' : 'exit-outline'} size={12} color={selected ? '#081014' : ITINERARY_BAILOUT_COLOR} />
      </View>
      <View style={styles.bailoutOptionCopy}>
        <Text style={styles.bailoutOptionTitle} numberOfLines={1}>{option.title}</Text>
        <Text style={styles.bailoutOptionMeta} numberOfLines={2}>
          {option.distanceFromRouteStartMiles != null ? `${option.distanceFromRouteStartMiles.toFixed(1)} mi from route start | ` : ''}
          {option.subtitle ?? 'Emergency bailout or rendezvous candidate.'}
        </Text>
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={15} color={selected ? ITINERARY_BAILOUT_COLOR : TACTICAL.textMuted} />
    </TouchableOpacity>
  );
}

function ItineraryAddSlot({
  index,
  active,
  onPress,
}: {
  index: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.itineraryAddSlot, active && styles.itineraryAddSlotActive]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add itinerary item at position ${index + 1}`}
      testID={`trip-builder-add-itinerary-slot-${index}`}
    >
      <Ionicons name="add-circle-outline" size={13} color={TACTICAL.amber} />
      <View style={styles.itineraryAddSlotCopy}>
        <Text style={styles.itineraryAddSlotText}>Add itinerary location</Text>
        <Text style={styles.itineraryAddSlotHint} numberOfLines={1}>
          Resupply, known camp, waypoint, or address
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function EditableStopRow({
  stop,
  index,
  count,
  onMoveUp,
  onMoveDown,
  onDelete,
  onToggleBailout,
}: {
  stop: TripPlanStop;
  index: number;
  count: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onToggleBailout: () => void;
}) {
  const note = stop.notes?.[0] ?? null;
  const canMoveUp = index > 0;
  const canMoveDown = index < count - 1;
  const sequenceLabel = formatTripMapLetter(index);
  const tone = itineraryStopTone(stop);
  const bailout = isBailoutItineraryStop(stop);
  return (
    <View style={styles.editStopRow} testID={`trip-builder-edit-stop-${stop.id}`}>
      <View style={styles.editGrip}>
        <Ionicons name="reorder-three-outline" size={16} color={TACTICAL.textMuted} />
      </View>
      <View style={[styles.stopIndex, { borderColor: tone.color + '48', backgroundColor: tone.color + '18' }]}>
        <Text style={[styles.stopIndexText, { color: tone.color }]}>{sequenceLabel}</Text>
      </View>
      <View style={styles.stopCopy}>
        <Text style={styles.stopTitle}>{stop.title}</Text>
        <Text style={styles.stopMeta}>
          {stop.type.replace(/_/g, ' ').toUpperCase()} | Day {stop.plannedDay}
          {stop.routeMileMarker != null ? ` | mile ${Math.round(stop.routeMileMarker)}` : ''}
        </Text>
        {note ? <Text style={styles.stopNote}>{note}</Text> : null}
      </View>
      <View style={styles.editStopActions}>
        <TouchableOpacity
          style={[styles.editStopIconButton, bailout && styles.editStopBailoutButtonActive]}
          activeOpacity={0.82}
          onPress={onToggleBailout}
          onLongPress={onToggleBailout}
          accessibilityRole="button"
          accessibilityLabel={bailout ? `Unset ${stop.title} as bailout` : `Mark ${stop.title} as bailout`}
          accessibilityState={{ selected: bailout }}
          testID={`trip-builder-itinerary-bailout-${stop.id}`}
        >
          <Ionicons name="warning-outline" size={13} color={bailout ? '#081014' : ITINERARY_BAILOUT_COLOR} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editStopIconButton, !canMoveUp && styles.editStopIconButtonDisabled]}
          activeOpacity={canMoveUp ? 0.82 : 1}
          disabled={!canMoveUp}
          onPress={onMoveUp}
          accessibilityRole="button"
          accessibilityLabel={`Move ${stop.title} up`}
        >
          <Ionicons name="chevron-up" size={13} color={canMoveUp ? TACTICAL.amber : TACTICAL.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editStopIconButton, !canMoveDown && styles.editStopIconButtonDisabled]}
          activeOpacity={canMoveDown ? 0.82 : 1}
          disabled={!canMoveDown}
          onPress={onMoveDown}
          accessibilityRole="button"
          accessibilityLabel={`Move ${stop.title} down`}
        >
          <Ionicons name="chevron-down" size={13} color={canMoveDown ? TACTICAL.amber : TACTICAL.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editStopIconButton, styles.editStopDeleteButton]}
          activeOpacity={0.82}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${stop.title}`}
        >
          <Ionicons name="trash-outline" size={13} color="#EF9A9A" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ItinerarySearchPanel({
  value,
  loading,
  error,
  suggestions,
  onChangeText,
  onSelectSuggestion,
  onCancel,
}: {
  value: string;
  loading: boolean;
  error: string | null;
  suggestions: RoadNavSearchSuggestion[];
  onChangeText: (value: string) => void;
  onSelectSuggestion: (suggestion: RoadNavSearchSuggestion) => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.itinerarySearchPanel} testID="trip-builder-itinerary-search-panel">
      <View style={styles.itinerarySearchHeader}>
        <Ionicons name="search-outline" size={13} color={TACTICAL.amber} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search address, fuel, grocery, water..."
          placeholderTextColor={TACTICAL.textMuted}
          style={styles.itinerarySearchInput}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search itinerary location"
          testID="trip-builder-itinerary-search-input"
        />
        {loading ? <ActivityIndicator color={TACTICAL.amber} size="small" /> : null}
      </View>
      {error ? <Text style={styles.itinerarySearchError}>{error}</Text> : null}
      {suggestions.length > 0 ? (
        <View style={styles.itinerarySearchResults}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.id}
              style={styles.itinerarySearchResult}
              activeOpacity={0.82}
              onPress={() => onSelectSuggestion(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${suggestion.title} to itinerary`}
            >
              <Text style={styles.itinerarySearchResultTitle}>{suggestion.title}</Text>
              {suggestion.subtitle ? (
                <Text style={styles.itinerarySearchResultSubtitle} numberOfLines={1}>
                  {suggestion.subtitle}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <TouchableOpacity
        style={styles.itinerarySearchCancel}
        activeOpacity={0.82}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel itinerary location search"
      >
        <Text style={styles.itinerarySearchCancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

function resupplyOverrideStatus(override: ResupplyOverride | null | undefined): ResupplyStatus | null {
  if (override === 'provided' || override === 'not_required') return 'good';
  return null;
}

function resupplyOverrideLabel(override: ResupplyOverride | null | undefined): string | null {
  if (override === 'provided') return 'SUPPLIED';
  if (override === 'not_required') return 'NOT REQUIRED';
  return null;
}

function resupplyOverrideRecommendation(plan: ResupplyCategoryPlan, override: ResupplyOverride | null | undefined): string | null {
  if (override === 'provided') return `${resupplyLabel(plan.category)} supplies marked provided for this trip.`;
  if (override === 'not_required') return `${resupplyLabel(plan.category)} marked not required for this trip.`;
  return null;
}

function displayResupplyStatus(plan: ResupplyCategoryPlan, override: ResupplyOverride | null | undefined): ResupplyStatus {
  return resupplyOverrideStatus(override) ?? plan.status;
}

function displaySmartResupplyOverall(plan: SmartResupplyPlan, overrides: Partial<Record<ResupplyCategory, ResupplyOverride>>): ResupplyStatus {
  const rank: Record<ResupplyStatus, number> = { good: 0, medium: 1, unknown: 2, low: 3 };
  return resupplyRows(plan)
    .map((row) => displayResupplyStatus(row, overrides[row.category]))
    .reduce<ResupplyStatus>((worst, status) => (rank[status] > rank[worst] ? status : worst), 'good');
}

function ResupplyRow({
  plan,
  override,
  onPress,
}: {
  plan: ResupplyCategoryPlan;
  override?: ResupplyOverride;
  onPress?: () => void;
}) {
  const displayStatus = displayResupplyStatus(plan, override);
  const color = statusColor(displayStatus);
  const distance = formatDistance(plan.keyDistanceMiles);
  const detail = [
    plan.keyPoint?.name,
    distance,
  ].filter(Boolean).join(' | ');
  const Wrapper = onPress ? TouchableOpacity : View;
  const overrideLabel = resupplyOverrideLabel(override);
  const recommendation = resupplyOverrideRecommendation(plan, override) ?? plan.primaryRecommendation;
  return (
    <Wrapper
      style={[styles.resupplyRow, onPress && styles.resupplyRowTappable]}
      onPress={onPress}
      activeOpacity={onPress ? 0.82 : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${resupplyLabel(plan.category)} status ${overrideLabel ?? displayStatus}`}
      testID={`trip-builder-resupply-row-${plan.category}`}
    >
      <View style={[styles.resupplyIcon, { borderColor: color + '45', backgroundColor: color + '10' }]}>
        <Ionicons name={resupplyIcon(plan.category) as any} size={13} color={color} />
      </View>
      <View style={styles.resupplyCopy}>
        <View style={styles.resupplyTitleRow}>
          <Text style={styles.resupplyTitle}>
            {resupplyLabel(plan.category)}
            {onPress ? (
              <Text style={styles.resupplyTitleHint}> (tap this container to change its status)</Text>
            ) : null}
          </Text>
          <Text style={[styles.resupplyStatus, { color }]}>{overrideLabel ?? statusLabel(displayStatus)}</Text>
        </View>
        <Text style={styles.resupplyRecommendation}>{recommendation}</Text>
        {detail ? <Text style={styles.resupplyMeta}>{detail}</Text> : null}
        {!overrideLabel && plan.warnings[0] ? <Text style={styles.resupplyWarning}>{plan.warnings[0].message}</Text> : null}
      </View>
    </Wrapper>
  );
}

function itinerarySummaryStateLabel(state: TripItinerarySummaryViewModel['state']): string {
  switch (state) {
    case 'full_itinerary_available':
      return 'Full';
    case 'trail_geometry_missing':
      return 'Trail Data';
    case 'pre_trail_poi_missing':
      return 'POI Pending';
    case 'gps_missing':
      return 'GPS Pending';
    case 'itinerary_structure_ready':
      return 'Structure Ready';
    case 'itinerary_pending':
    default:
      return 'Pending';
  }
}

function itinerarySummaryStatusColor(status: TripItinerarySummaryPhaseStatus): string {
  switch (status) {
    case 'available':
      return '#66BB6A';
    case 'pending':
    case 'optional':
      return TACTICAL.amber;
    case 'missing':
    case 'unavailable':
    default:
      return '#EF5350';
  }
}

function ItinerarySummaryPanel({ summary }: { summary: TripItinerarySummaryViewModel }) {
  const stateColor =
    summary.state === 'full_itinerary_available'
      ? '#66BB6A'
      : summary.state === 'gps_missing' || summary.state === 'trail_geometry_missing'
        ? '#FFCC80'
        : TACTICAL.amber;
  return (
    <View style={styles.itinerarySummary} testID="trip-builder-itinerary-summary">
      <View style={styles.itinerarySummaryHeader}>
        <View style={[styles.itinerarySummaryIcon, { borderColor: stateColor + '44', backgroundColor: stateColor + '12' }]}>
          <Ionicons name="map-outline" size={13} color={stateColor} />
        </View>
        <View style={styles.itinerarySummaryTitleBlock}>
          <Text style={styles.itinerarySummaryTitle}>{summary.title}</Text>
          <Text style={styles.itinerarySummaryMessage}>{summary.message}</Text>
        </View>
        <Text style={[styles.itinerarySummaryState, { color: stateColor }]}>{itinerarySummaryStateLabel(summary.state)}</Text>
      </View>

      <View style={styles.itinerarySummaryPhaseRow}>
        {summary.phases.map((phase) => {
          const color = itinerarySummaryStatusColor(phase.status);
          return (
            <View
              key={phase.key}
              style={[styles.itinerarySummaryPhase, { borderColor: color + '30', backgroundColor: color + '08' }]}
              testID={`trip-builder-itinerary-phase-${phase.key}`}
            >
              <View style={[styles.itinerarySummaryPhaseDot, { backgroundColor: color }]} />
              <View style={styles.itinerarySummaryPhaseCopy}>
                <Text style={styles.itinerarySummaryPhaseLabel} numberOfLines={1}>{phase.label}</Text>
                <Text style={styles.itinerarySummaryPhaseDetail} numberOfLines={1}>{phase.detail}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {summary.dataNotes.slice(0, 2).map((note) => (
        <Text key={note} style={styles.itinerarySummaryNote}>{note}</Text>
      ))}
    </View>
  );
}

function itineraryReviewAvailabilityLabel(value: TripItineraryReviewAvailability): string {
  switch (value) {
    case 'available':
      return 'Available';
    case 'partial':
      return 'Partial';
    case 'pending':
      return 'Pending';
    case 'missing':
      return 'Missing';
    case 'optional':
      return 'Optional';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

function itineraryReviewAvailabilityColor(value: TripItineraryReviewAvailability): string {
  switch (value) {
    case 'available':
      return '#66BB6A';
    case 'partial':
    case 'pending':
    case 'optional':
      return TACTICAL.amber;
    case 'missing':
    case 'unavailable':
    default:
      return '#EF5350';
  }
}

function confidenceDisplay(value: TripBuilderConfidence | null | undefined): string {
  if (value === 'high') return 'High';
  if (value === 'medium') return 'Medium';
  if (value === 'low') return 'Low';
  return 'Unknown';
}

function ConfidenceChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.itineraryReviewConfidenceChip}>
      <Text style={styles.itineraryReviewConfidenceLabel}>{label}</Text>
      <Text style={styles.itineraryReviewConfidenceValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function tripConfidenceCategoryColor(category: TripConfidenceCategory): string {
  switch (category) {
    case 'high_confidence':
      return '#66BB6A';
    case 'moderate_confidence':
      return TACTICAL.amber;
    case 'low_confidence':
      return '#FF8A65';
    case 'insufficient_data':
    default:
      return '#EF5350';
  }
}

function tripConfidenceToneColor(tone: TripConfidenceReasonTone): string {
  switch (tone) {
    case 'positive':
      return '#66BB6A';
    case 'critical':
      return '#EF5350';
    case 'caution':
      return '#FF8A65';
    case 'watch':
      return TACTICAL.amber;
    case 'neutral':
    default:
      return TACTICAL.textMuted;
  }
}

function tripConfidenceSectionStatusLabel(status: TripConfidenceSectionStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'watch':
      return 'Watch';
    case 'caution':
      return 'Caution';
    case 'unavailable':
      return 'Unavailable';
    case 'stale':
      return 'Stale';
    case 'live':
      return 'Live';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function tripConfidenceSectionStatusColor(status: TripConfidenceSectionStatus): string {
  switch (status) {
    case 'ready':
    case 'live':
      return '#66BB6A';
    case 'watch':
      return TACTICAL.amber;
    case 'caution':
    case 'stale':
      return '#FF8A65';
    case 'unavailable':
      return '#EF5350';
    case 'unknown':
    default:
      return TACTICAL.textMuted;
  }
}

function TripConfidenceSummaryPanel({ summary }: { summary: TripConfidenceSummaryViewModel }) {
  const accent = tripConfidenceCategoryColor(summary.category);
  useEffect(() => {
    void recordBadgeIdentitySafeSignal({ signalId: 'trip_confidence_summary_generated', source: 'trip_builder', occurredAt: new Date().toISOString() }).catch(() => null);
  }, [summary.category, summary.route.routeId, summary.score]);

  return (
    <View style={styles.tripConfidencePanel} testID="trip-builder-trip-confidence-summary">
      <View style={styles.tripConfidenceHeader}>
        <View style={styles.tripConfidenceTitleBlock}>
          <Text style={styles.tripConfidenceEyebrow}>Trip Confidence</Text>
          <Text style={[styles.tripConfidenceHeadline, { color: accent }]}>{summary.label}</Text>
          <Text style={styles.tripConfidenceSubhead} numberOfLines={2}>{summary.headline}</Text>
        </View>
        <View style={[styles.tripConfidenceScoreBadge, { borderColor: accent + '55', backgroundColor: accent + '12' }]}>
          <Text style={[styles.tripConfidenceScoreValue, { color: accent }]}>
            {summary.score != null ? summary.score : '--'}
          </Text>
          <Text style={styles.tripConfidenceScoreLabel}>Score</Text>
        </View>
      </View>

      {summary.keyWarnings.length > 0 ? (
        <View style={styles.tripConfidenceWarnings}>
          {summary.keyWarnings.slice(0, 3).map((warning) => (
            <View key={warning} style={styles.tripConfidenceWarningChip}>
              <Text style={styles.tripConfidenceWarningText} numberOfLines={1}>{warning}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.tripConfidenceSectionList}>
        {summary.sections.map((section) => {
          const statusColor = tripConfidenceSectionStatusColor(section.status);
          return (
            <View key={section.key} style={styles.tripConfidenceSection}>
              <View style={styles.tripConfidenceSectionHeader}>
                <Text style={styles.tripConfidenceSectionTitle}>{section.title}</Text>
                <Text style={[styles.tripConfidenceSectionStatus, { color: statusColor }]}>
                  {tripConfidenceSectionStatusLabel(section.status)}
                </Text>
              </View>
              <Text style={styles.tripConfidenceSectionSummary} numberOfLines={2}>{section.summary}</Text>
              <View style={styles.tripConfidenceReasonRow}>
                {section.reasons.slice(0, 2).map((reason) => (
                  <View key={reason.id} style={[styles.tripConfidenceReasonChip, { borderColor: tripConfidenceToneColor(reason.tone) + '38' }]}>
                    <Text style={[styles.tripConfidenceReasonText, { color: tripConfidenceToneColor(reason.tone) }]} numberOfLines={1}>
                      {reason.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.tripConfidenceActionRow}>
        <Text style={styles.tripConfidenceActionLabel}>Recommended Action</Text>
        <Text style={styles.tripConfidenceActionText} numberOfLines={2}>{summary.recommendedAction.label}</Text>
      </View>
    </View>
  );
}

function itineraryEditItemStatus(
  editSession: TripItineraryEditSession | null | undefined,
  itemId: string,
): TripItineraryEditItemStatus | null {
  return editSession?.items.find((item) => item.sourceItemId === itemId || item.id === itemId)?.status ?? null;
}

function ItineraryReviewPanel({
  review,
  editing = false,
  editSession = null,
  onAcceptItem,
  onDismissItem,
  onMoveStopItem,
  onAddUserStop,
  onAddUserWaypoint,
}: {
  review: TripItineraryReviewModel;
  editing?: boolean;
  editSession?: TripItineraryEditSession | null;
  onAcceptItem?: (itemId: string) => void;
  onDismissItem?: (itemId: string) => void;
  onMoveStopItem?: (itemId: string, direction: -1 | 1) => void;
  onAddUserStop?: () => void;
  onAddUserWaypoint?: () => void;
}) {
  return (
    <View style={styles.itineraryReview} testID="trip-builder-itinerary-review">
      <View style={styles.itineraryReviewHeader}>
        <View style={styles.itineraryReviewHeaderCopy}>
          <Text style={styles.itineraryReviewTitle}>{review.title}</Text>
          <Text style={styles.itineraryReviewSubtitle}>{review.subtitle}</Text>
        </View>
      </View>

      <View style={styles.itineraryReviewConfidence} testID="trip-builder-itinerary-confidence-summary">
        <View style={styles.itineraryReviewSubheader}>
          <Text style={styles.itineraryReviewSubheaderText}>Confidence Summary</Text>
          <Text style={styles.itineraryReviewSubheaderMeta}>
            {review.confidenceSummary.routeGeometryStatus ?? 'unknown'}
          </Text>
        </View>
        <View style={styles.itineraryReviewConfidenceRow}>
          <ConfidenceChip label="Overall" value={confidenceDisplay(review.confidenceSummary.overall)} />
          <ConfidenceChip label="Geometry" value={confidenceDisplay(review.confidenceSummary.routeGeometry)} />
          <ConfidenceChip label="Trailhead" value={confidenceDisplay(review.confidenceSummary.trailhead)} />
          <ConfidenceChip label="Waypoints" value={confidenceDisplay(review.confidenceSummary.trailWaypoints)} />
        </View>
      </View>

      <View style={styles.itineraryReviewPhaseList}>
        {review.phases.map((phase, index) => {
          const color = itineraryReviewAvailabilityColor(phase.availability);
          const addAction =
            editing && phase.key === 'pre_trail_resupply'
              ? onAddUserStop
              : editing && phase.key === 'trail_waypoints'
                ? onAddUserWaypoint
                : undefined;
          return (
            <View key={phase.key} style={styles.itineraryReviewPhase} testID={`trip-builder-review-phase-${phase.key}`}>
              <View style={styles.itineraryReviewPhaseHeader}>
                <View style={[styles.itineraryReviewPhaseNumber, { borderColor: color + '40', backgroundColor: color + '10' }]}>
                  <Text style={[styles.itineraryReviewPhaseNumberText, { color }]}>{index + 1}</Text>
                </View>
                <View style={styles.itineraryReviewPhaseCopy}>
                  <Text style={styles.itineraryReviewPhaseTitle}>{phase.title}</Text>
                  <Text style={styles.itineraryReviewPhaseDescription}>{phase.description}</Text>
                </View>
                <View style={[styles.itineraryReviewAvailability, { borderColor: color + '38', backgroundColor: color + '0D' }]}>
                  <Text style={[styles.itineraryReviewAvailabilityText, { color }]}>
                    {itineraryReviewAvailabilityLabel(phase.availability)}
                  </Text>
                </View>
                {addAction ? (
                  <TouchableOpacity
                    style={styles.itineraryReviewIconButton}
                    activeOpacity={0.82}
                    onPress={addAction}
                    accessibilityRole="button"
                    accessibilityLabel={phase.key === 'pre_trail_resupply' ? 'Add user itinerary stop' : 'Add user trail waypoint'}
                    testID={phase.key === 'pre_trail_resupply' ? 'trip-builder-add-user-stop' : 'trip-builder-add-user-waypoint'}
                  >
                    <Ionicons name="add" size={12} color={TACTICAL.amber} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.itineraryReviewMetaRow}>
                <Text style={styles.itineraryReviewMetaText}>Confidence: {confidenceDisplay(phase.confidence)}</Text>
                {phase.editable ? <Text style={styles.itineraryReviewEditableText}>Editable</Text> : null}
              </View>
              {phase.recommendation ? (
                <Text style={styles.itineraryReviewRecommendation}>ECS recommends: {phase.recommendation}</Text>
              ) : null}
              {phase.items.length > 0 ? (
                <View style={styles.itineraryReviewItemList}>
                  {(editing && phase.editable ? phase.items : phase.items.slice(0, 4)).map((item) => {
                    const itemStatus = itineraryEditItemStatus(editSession, item.id);
                    const itemEditable = editing && phase.editable;
                    return (
                      <View key={item.id} style={styles.itineraryReviewItem} testID={`trip-builder-review-item-${item.id}`}>
                        <View style={styles.itineraryReviewItemHeader}>
                          <View style={styles.itineraryReviewItemCopy}>
                            <Text style={styles.itineraryReviewItemTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.itineraryReviewItemMeta} numberOfLines={1}>
                              {item.kind} | {confidenceDisplay(item.confidence)}
                              {item.isUserAdded ? ' | User added' : item.isEcsSuggested ? ' | ECS suggested' : ''}
                              {itemStatus ? ` | ${itemStatus}` : ''}
                            </Text>
                          </View>
                          {itemEditable ? (
                            <View style={styles.itineraryReviewItemActions}>
                              {phase.key === 'pre_trail_resupply' && onMoveStopItem ? (
                                <>
                                  <TouchableOpacity
                                    style={styles.itineraryReviewIconButton}
                                    activeOpacity={0.82}
                                    onPress={() => onMoveStopItem(item.id, -1)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Move ${item.title} earlier`}
                                    testID={`trip-builder-itinerary-move-up-${item.id}`}
                                  >
                                    <Ionicons name="chevron-up" size={12} color={TACTICAL.textMuted} />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.itineraryReviewIconButton}
                                    activeOpacity={0.82}
                                    onPress={() => onMoveStopItem(item.id, 1)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Move ${item.title} later`}
                                    testID={`trip-builder-itinerary-move-down-${item.id}`}
                                  >
                                    <Ionicons name="chevron-down" size={12} color={TACTICAL.textMuted} />
                                  </TouchableOpacity>
                                </>
                              ) : null}
                              {onAcceptItem ? (
                                <TouchableOpacity
                                  style={styles.itineraryReviewIconButton}
                                  activeOpacity={0.82}
                                  onPress={() => onAcceptItem(item.id)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Accept ${item.title}`}
                                  testID={`trip-builder-itinerary-accept-${item.id}`}
                                >
                                  <Ionicons name="checkmark" size={12} color="#66BB6A" />
                                </TouchableOpacity>
                              ) : null}
                              {onDismissItem ? (
                                <TouchableOpacity
                                  style={[styles.itineraryReviewIconButton, styles.itineraryReviewRemoveButton]}
                                  activeOpacity={0.82}
                                  onPress={() => onDismissItem(item.id)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove ${item.title}`}
                                  testID={`trip-builder-itinerary-remove-${item.id}`}
                                >
                                  <Ionicons name="close" size={12} color="#EF5350" />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {phase.warnings.slice(0, 2).map((warning) => (
                <Text key={warning} style={styles.itineraryReviewWarning}>{warning}</Text>
              ))}
            </View>
          );
        })}
      </View>

      {review.missingDataWarnings.length > 0 ? (
        <View style={styles.itineraryReviewWarnings} testID="trip-builder-itinerary-missing-warnings">
          <View style={styles.itineraryReviewSubheader}>
            <Text style={styles.itineraryReviewSubheaderText}>Missing Data</Text>
            <Text style={styles.itineraryReviewSubheaderMeta}>{review.missingDataWarnings.length}</Text>
          </View>
          {review.missingDataWarnings.slice(0, 4).map((warning) => (
            <Text key={warning} style={styles.itineraryReviewWarning}>{warning}</Text>
          ))}
        </View>
      ) : null}
      {editing && editSession?.dismissedSuggestions.length ? (
        <Text style={styles.itineraryReviewDismissedText} testID="trip-builder-itinerary-dismissed-count">
          {editSession.dismissedSuggestions.length} dismissed suggestion{editSession.dismissedSuggestions.length === 1 ? '' : 's'} tracked separately from provider/source records.
        </Text>
      ) : null}
    </View>
  );
}

function mapScopeTitle(scope: TripPlanMapScope, itinerarySaved = false): string {
  switch (scope) {
    case 'camps':
      return 'Camp Candidates';
    case 'exits':
      return 'Exit Access';
    case 'resupply':
      return 'Smart Resupply';
    case 'itinerary':
    default:
      return itinerarySaved ? 'Confidence-Built Itinerary' : 'Suggested Itinerary';
  }
}

function isValidMapCoordinate(coordinate: TripMapCoordinate | null | undefined): coordinate is TripMapCoordinate {
  return (
    !!coordinate &&
    typeof coordinate.latitude === 'number' &&
    typeof coordinate.longitude === 'number' &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

function finiteCoordinateNumber(value: unknown): number | null {
  const next = typeof value === 'string' ? Number(value) : value;
  return typeof next === 'number' && Number.isFinite(next) ? next : null;
}

function coordinateFromRouteValue(value: unknown): TripMapCoordinate | null {
  if (Array.isArray(value)) {
    const longitude = finiteCoordinateNumber(value[0]);
    const latitude = finiteCoordinateNumber(value[1]);
    const coordinate = latitude != null && longitude != null ? { latitude, longitude } : null;
    return isValidMapCoordinate(coordinate) ? coordinate : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const latitude = finiteCoordinateNumber(record.latitude) ?? finiteCoordinateNumber(record.lat);
  const longitude =
    finiteCoordinateNumber(record.longitude) ??
    finiteCoordinateNumber(record.lng) ??
    finiteCoordinateNumber(record.lon);
  const coordinate = latitude != null && longitude != null ? { latitude, longitude } : null;
  return isValidMapCoordinate(coordinate) ? coordinate : null;
}

function routeObjectRecord(route: TripBuilderRouteInput | null | undefined): Record<string, unknown> {
  return route && typeof route === 'object' ? (route as unknown as Record<string, unknown>) : {};
}

function routeMetadataRecord(route: TripBuilderRouteInput | null | undefined): Record<string, unknown> {
  const record = routeObjectRecord(route);
  const metadata = route?.routeMetadata ?? record.route_metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function coordinateFromNamedFields(
  route: TripBuilderRouteInput,
  names: string[],
): TripMapCoordinate | null {
  const record = routeObjectRecord(route);
  const metadata = routeMetadataRecord(route);
  for (const name of names) {
    const coordinate = coordinateFromRouteValue(record[name] ?? metadata[name]);
    if (coordinate) return coordinate;
  }
  return null;
}

function tripBuilderRoutePreviewId(route: ExpeditionOpportunity | TripBuilderRouteInput | null): string | null {
  if (!route) return null;
  return String(route.id ?? tripBuilderRouteDisplayName(route as ExpeditionOpportunity) ?? 'selected-route');
}

function routeStartCoordinateForTrip(route: TripBuilderRouteInput | null | undefined): TripMapCoordinate | null {
  if (!route) return null;
  const record = routeObjectRecord(route);
  const startLat = finiteCoordinateNumber(record.startLat);
  const startLng = finiteCoordinateNumber(record.startLng);
  const startCoordinate =
    startLat != null && startLng != null ? { latitude: startLat, longitude: startLng } : null;
  if (isValidMapCoordinate(startCoordinate)) return startCoordinate;

  const explicitStart = coordinateFromNamedFields(route, [
    'trailheadCoordinate',
    'trailhead_coordinate',
    'startCoordinate',
    'start_coordinate',
    'originCoordinate',
    'origin_coordinate',
  ]);
  if (explicitStart) return explicitStart;

  const geometryStart = getOfflinePrepRouteCoordinates(route)[0];
  if (geometryStart && isValidMapCoordinate(geometryStart)) return geometryStart;

  return coordinateFromNamedFields(route, ['coordinate']);
}

function routeEndCoordinateForTrip(route: TripBuilderRouteInput | null | undefined): TripMapCoordinate | null {
  if (!route) return null;
  const explicitEnd = coordinateFromNamedFields(route, [
    'destinationCoordinate',
    'destination_coordinate',
    'endpointCoordinate',
    'endpoint_coordinate',
    'endCoordinate',
    'end_coordinate',
    'finishCoordinate',
    'finish_coordinate',
    'finalDestinationCoordinate',
    'final_destination_coordinate',
    'roadDestinationCoordinate',
    'road_destination_coordinate',
  ]);
  if (explicitEnd) return explicitEnd;

  const geometry = getOfflinePrepRouteCoordinates(route);
  const geometryEnd = geometry.length > 1 ? geometry[geometry.length - 1] : null;
  return geometryEnd && isValidMapCoordinate(geometryEnd) ? geometryEnd : null;
}

function routePointsForTripMap(route: TripBuilderRouteInput): TripMapCoordinate[] {
  const normalized = getOfflinePrepRouteCoordinates(route)
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }))
    .filter(isValidMapCoordinate);
  if (normalized.length >= 2) return normalized;

  const start = routeStartCoordinateForTrip(route);
  const end = routeEndCoordinateForTrip(route);
  const fallback = [start, end].filter(isValidMapCoordinate);
  if (fallback.length >= 2) return fallback;
  if (normalized.length > 0) return normalized;
  return fallback;
}

function tripBuilderCoordinateFromGpsPosition(position: GPSPosition | null): TripBuilderCoordinate | null {
  if (!position) return null;
  const coordinate = {
    latitude: position.latitude,
    longitude: position.longitude,
    ...(position.accuracyM != null ? { accuracyMeters: position.accuracyM } : {}),
    ...(position.altitudeFt != null ? { elevationFeet: position.altitudeFt } : {}),
    source: {
      label: 'trip_builder_live_gps',
      state: 'live' as const,
      capturedAt: new Date(position.timestamp).toISOString(),
      confidence: position.accuracyM != null && position.accuracyM <= 30 ? 'high' as const : 'medium' as const,
    },
  };
  return isValidMapCoordinate(coordinate) ? coordinate : null;
}

function routeContextOriginFromTripCoordinate(coordinate: TripBuilderCoordinate | null): RouteContext['origin'] {
  if (!coordinate || !isValidMapCoordinate(coordinate)) return null;
  return {
    lat: Number(coordinate.latitude.toFixed(5)),
    lng: Number(coordinate.longitude.toFixed(5)),
    label: 'Current GPS location',
  };
}

function lineStringFromTripCoordinates(points: TripMapCoordinate[]): { type: 'LineString'; coordinates: [number, number][] } | null {
  const normalized = normalizeCanonicalRouteGeometry(points);
  return normalized.valid && normalized.lineString ? normalized.lineString : null;
}

function routeHasExplicitTrailGeometry(route: TripBuilderRouteInput): boolean {
  const record = routeObjectRecord(route);
  const metadata = routeMetadataRecord(route);
  return Boolean(
    record.trailGeometry ??
      record.trail_geometry ??
      metadata.trailGeometry ??
      metadata.trail_geometry,
  );
}

function routePreviewCanStandInAsTrail(route: TripBuilderRouteInput): boolean {
  if (routeHasExplicitTrailGeometry(route)) return false;
  const routeAuthority = classifyExploreRouteAuthority(route);
  if (!routeAuthority.canUseForTrailItinerary) return false;
  const normalized = normalizeCanonicalRouteGeometry(route);
  return normalized.valid && normalized.isTrailGeometry && !normalized.isPreviewOrDemo;
}

function buildLiveItinerarySuggestedRoute(args: {
  route: SuggestedRoute;
  liveApproachRoutePoints: TripMapCoordinate[];
  routeContext: TripBuilderRouteContextInput | null;
}): SuggestedRoute {
  const route = args.route;
  const metadata = routeMetadataRecord(route);
  const routeAuthority = classifyExploreRouteAuthority(route);
  const approachLine = lineStringFromTripCoordinates(args.liveApproachRoutePoints);
  const routePoints = routePointsForTripMap(route);
  const routePreviewTrailLine = routePreviewCanStandInAsTrail(route)
    ? lineStringFromTripCoordinates(routePoints)
    : null;
  const routeContextTrailhead = args.routeContext?.trailheadAnchor?.coordinate ?? null;
  const routeStart = routeContextTrailhead ?? routeStartCoordinateForTrip(route);
  const routeEnd = routeEndCoordinateForTrip(route);

  return {
    ...route,
    ...(approachLine ? { approachGeometry: approachLine, approachRoute: approachLine } : {}),
    ...(routePreviewTrailLine ? { trailGeometry: routePreviewTrailLine } : {}),
    ...(routeStart ? { trailheadStart: routeStart } : {}),
    ...(routeEnd ? { trailEnd: routeEnd } : {}),
    routeMetadata: {
      ...metadata,
      routeTypeStatus: routeAuthority.status,
      routeAuthorityLabel: routeAuthority.label,
      routeAuthorityNotice: routeAuthority.notice,
      routeAuthoritySource: routeAuthority.sourceLabel,
      hasTrueTrailGeometry: routeAuthority.hasTrueTrailGeometry,
      canUseForTrailItinerary: routeAuthority.canUseForTrailItinerary,
      ...(approachLine
        ? {
            tripBuilderApproachGeometrySource: 'mapbox_live_gps',
            approachGeometryPointCount: approachLine.coordinates.length,
          }
        : {}),
      ...(routePreviewTrailLine
        ? {
            tripBuilderTrailGeometrySource: 'operator_supplied_route_file',
            isTrailGeometry: true,
          }
        : {}),
      ...(args.routeContext
        ? {
            tripBuilderRouteContextStatus: args.routeContext.status ?? null,
            tripBuilderRouteContextConfidence: args.routeContext.confidence?.tier ?? args.routeContext.confidence?.value ?? null,
          }
        : {}),
    },
  };
}

function buildPreparedTripRoutePreview(
  route: ExpeditionOpportunity | TripBuilderRouteInput | null,
): PreparedTripRoutePreview | null {
  if (!route) return null;
  const tripRoute = route as unknown as TripBuilderRouteInput;
  const routeId = tripBuilderRoutePreviewId(route) ?? 'selected-route';
  const routePoints = routePointsForTripMap(tripRoute);
  const start = routePoints[0] ?? routeStartCoordinateForTrip(tripRoute);
  const end = routePoints.length > 1
    ? routePoints[routePoints.length - 1]
    : routeEndCoordinateForTrip(tripRoute);

  return {
    routeId,
    start: start && isValidMapCoordinate(start) ? start : null,
    end: end && isValidMapCoordinate(end) ? end : null,
    routePoints,
  };
}

function preparedRoutePreviewMatches(
  preview: PreparedTripRoutePreview | null,
  route: ExpeditionOpportunity | null,
): preview is PreparedTripRoutePreview {
  return !!preview && !!route && preview.routeId === tripBuilderRoutePreviewId(route);
}

function tripBuilderRouteDisplayName(route: ExpeditionOpportunity | null): string | null {
  if (!route) return null;
  const metadata = routeMetadataRecord(route as unknown as TripBuilderRouteInput);
  const sourceFileName = metadata.sourceFileName ?? metadata.source_file_name;
  if (typeof sourceFileName === 'string' && sourceFileName.trim()) {
    return sourceFileName.trim();
  }
  const record = routeObjectRecord(route as unknown as TripBuilderRouteInput);
  const value = record.name ?? record.title ?? record.id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatTripMapLetter(index: number): string {
  let value = Math.max(0, Math.floor(index));
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

const TRIP_MAP_EARTH_RADIUS_MI = 3958.8;

function tripMapCoordinateDistanceMiles(left: TripMapCoordinate, right: TripMapCoordinate): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return TRIP_MAP_EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sameTripCoordinate(left: TripMapCoordinate, right: TripMapCoordinate): boolean {
  return (
    Math.abs(left.latitude - right.latitude) < 0.00001 &&
    Math.abs(left.longitude - right.longitude) < 0.00001
  );
}

function smartResupplySearchBounds(
  routeStart: TripMapCoordinate,
  radiusMiles: number,
): SmartResupplySearchBounds {
  const latitudeDelta = radiusMiles / 69;
  const longitudeScale = Math.max(Math.cos((routeStart.latitude * Math.PI) / 180), 0.2);
  const longitudeDelta = radiusMiles / (69 * longitudeScale);
  return {
    west: Math.max(-180, routeStart.longitude - longitudeDelta),
    south: Math.max(-90, routeStart.latitude - latitudeDelta),
    east: Math.min(180, routeStart.longitude + longitudeDelta),
    north: Math.min(90, routeStart.latitude + latitudeDelta),
  };
}

function smartResupplySuggestionKey(suggestion: RoadNavSearchSuggestion): string {
  return [
    suggestion.mapboxId,
    suggestion.id,
    suggestion.title.toLowerCase(),
    suggestion.subtitle?.toLowerCase() ?? '',
  ].filter(Boolean).join(':');
}

function smartResupplySearchText(suggestion: RoadNavSearchSuggestion, destination: RoadNavDestination): string {
  const rawText = [suggestion.raw, destination.raw]
    .map((value) => {
      try {
        return value ? JSON.stringify(value).slice(0, 3000) : '';
      } catch {
        return '';
      }
    })
    .join(' ');
  return [
    suggestion.title,
    suggestion.subtitle,
    destination.title,
    destination.subtitle,
    rawText,
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasDieselSupport(text: string): boolean {
  return /\b(diesel|truck stop|travel center|flying j|pilot|love'?s|petro stopping|ta travel)\b/i.test(text);
}

function hasFuelAndGrocerySupport(text: string): boolean {
  return /\b(grocery|groceries|supermarket|safeway|kroger|smith'?s|king soopers|fred meyer|costco|walmart|sam'?s club|winco|albertsons|city market|marketplace)\b/i.test(text);
}

function smartResupplyPoiFromDestination(
  suggestion: RoadNavSearchSuggestion,
  destination: RoadNavDestination,
  category: SmartResupplyPoi['category'],
  fallbackAnchor: TripMapCoordinate,
): SmartResupplyPoi | null {
  const coordinate = {
    latitude: destination.coordinate.lat,
    longitude: destination.coordinate.lng,
  };
  if (!isValidMapCoordinate(coordinate)) return null;
  const text = smartResupplySearchText(suggestion, destination);
  return {
    id: String(destination.id || suggestion.id),
    title: destination.title || suggestion.title,
    subtitle: destination.subtitle ?? suggestion.subtitle ?? null,
    category,
    coordinate,
    distanceFromRouteStartMiles: Math.round(tripMapCoordinateDistanceMiles(fallbackAnchor, coordinate) * 10) / 10,
    distanceFromTrailheadMiles: Math.round(tripMapCoordinateDistanceMiles(fallbackAnchor, coordinate) * 10) / 10,
    distanceFromApproachRouteMiles: null,
    routeDeviationMiles: null,
    remainingApproachMilesToTrailhead: null,
    approachProgressRatio: null,
    approachScore: null,
    beforeTrailEntry: null,
    fallbackState: 'trailhead_only',
    warnings: [],
    diesel: category === 'fuel' && hasDieselSupport(text),
    groceries: category === 'fuel' && hasFuelAndGrocerySupport(text),
    sourceType: destination.sourceType,
    suggestion,
  };
}

function smartResupplyPointForPlan(option: SmartResupplyPoi): ResupplyPoint {
  return {
    id: `operator-${option.category}-${makePlanIdPart(option.id)}`,
    name: option.title,
    category: option.category,
    location: option.coordinate,
    routeMileMarker: 0,
    distanceFromStartMiles: option.distanceFromRouteStartMiles,
    reliability: 'medium',
    source: 'operator_selected_pre_route_resupply',
    notes: [
      option.category === 'fuel'
        ? 'Operator selected as a pre-route fuel stop ranked along the GPS-to-trailhead approach.'
        : 'Operator selected as a pre-route grocery/supply stop ranked along the GPS-to-trailhead approach.',
      option.fallbackState === 'trailhead_only'
        ? 'GPS approach route was unavailable; this stop used trailhead-only fallback ranking.'
        : null,
      option.routeDeviationMiles != null ? `${option.routeDeviationMiles.toFixed(1)} mi estimated approach-route deviation.` : null,
      option.diesel ? 'Returned place data suggests diesel support. Verify pump availability before departure.' : null,
      option.groceries ? 'Returned place data suggests fuel and groceries/supplies at the same stop.' : null,
      option.subtitle ? `Mapbox place context: ${option.subtitle}.` : null,
    ].filter((note): note is string => !!note),
  };
}

function selectedPreTrailOptionFromSmartResupply(
  option: SmartResupplyPoi,
  bucket: 'fuel' | 'grocery',
): SelectedPreTrailOption {
  return {
    id: `operator-${bucket}-${makePlanIdPart(option.id)}`,
    title: option.title,
    coordinate: option.coordinate,
    source: option.sourceType || 'operator_selected_pre_route_resupply',
    confidence: 'medium',
    notes: [
      bucket === 'fuel'
        ? 'Operator selected as a pre-trail fuel stop ranked along the approach route before trail entry.'
        : 'Operator selected as a pre-trail grocery or supply stop ranked along the approach route before trail entry.',
      option.fallbackState === 'trailhead_only'
        ? 'GPS approach route was unavailable; ECS used trailhead-only fallback ranking.'
        : null,
      option.subtitle ? `Mapbox place context: ${option.subtitle}.` : null,
    ].filter((note): note is string => !!note),
    metadata: {
      preTrailStopBucket: bucket,
      sourceType: option.sourceType,
      routeStartDistanceMiles: option.distanceFromRouteStartMiles,
      distanceFromTrailheadMiles: option.distanceFromTrailheadMiles,
      routeDeviationMiles: option.routeDeviationMiles,
      remainingApproachMilesToTrailhead: option.remainingApproachMilesToTrailhead,
      approachScore: option.approachScore,
      fallbackState: option.fallbackState,
      mapboxId: option.suggestion.mapboxId ?? null,
      operatorSelected: true,
    },
  };
}

function preTrailCandidateFromSmartResupply(
  option: SmartResupplyPoi,
  bucket: 'fuel' | 'grocery',
): PreTrailStopCandidate {
  const provider = option.sourceType === 'route_context_engine' ? 'route_context_engine' : 'mapbox_search';
  return {
    id: `candidate-${bucket}-${makePlanIdPart(option.id)}`,
    providerPlaceId: option.suggestion.mapboxId ?? null,
    title: option.title,
    name: option.title,
    category: bucket,
    type: bucket,
    waypointType: bucket,
    coordinate: option.coordinate,
    address: option.subtitle ?? null,
    distanceFromTrailheadMiles: option.distanceFromTrailheadMiles ?? option.distanceFromRouteStartMiles,
    distanceFromRouteMiles: option.distanceFromApproachRouteMiles,
    detourDistanceMeters: option.routeDeviationMiles != null ? option.routeDeviationMiles * 1609.344 : null,
    openStatus: 'unknown',
    confidence: option.sourceType === 'route_context_engine' ? 'high' : 'medium',
    score: option.sourceType === 'route_context_engine' ? 0.86 : 0.72,
    source: provider,
    provider,
    notes: [
      option.sourceType === 'route_context_engine'
        ? 'Ranked by Route Context as a pre-trail resupply candidate.'
        : 'Returned by live Mapbox lookup and ranked against the GPS-to-trailhead approach.',
      option.fallbackState === 'trailhead_only'
        ? 'GPS approach route was unavailable; this candidate used trailhead-only fallback ranking.'
        : null,
      option.subtitle ? `Place context: ${option.subtitle}.` : null,
      option.diesel ? 'Search text suggests diesel support; verify pump availability.' : null,
      option.groceries ? 'Search text suggests fuel and grocery/supply support at the same stop.' : null,
    ].filter((note): note is string => !!note),
    metadata: {
      preTrailStopBucket: bucket,
      sourceType: option.sourceType,
      mapboxId: option.suggestion.mapboxId ?? null,
      routeContextCandidateId: routeContextCandidateIdFromSmartOption(option),
      distanceFromRouteStartMiles: option.distanceFromRouteStartMiles,
      distanceFromTrailheadMiles: option.distanceFromTrailheadMiles,
      routeDeviationMiles: option.routeDeviationMiles,
      approachScore: option.approachScore,
      fallbackState: option.fallbackState,
    },
  };
}

function routeContextCandidateIdFromSmartOption(option: SmartResupplyPoi): string | null {
  const raw = option.suggestion.raw;
  if (!raw || typeof raw !== 'object') return null;
  const candidateId = (raw as { routeContextCandidateId?: unknown }).routeContextCandidateId;
  return typeof candidateId === 'string' && candidateId.trim() ? candidateId : null;
}

function routeContextSupplySelectionFromSmartOptions(
  fuel: SmartResupplyPoi | null,
  supply: SmartResupplyPoi | null,
): {
  selectedRefuelCandidateId: string | null;
  selectedResupplyCandidateId: string | null;
  selectedSupplyCandidateIds: string[];
} {
  const selectedRefuelCandidateId = fuel ? routeContextCandidateIdFromSmartOption(fuel) : null;
  const selectedResupplyCandidateId = supply ? routeContextCandidateIdFromSmartOption(supply) : null;
  const selectedSupplyCandidateIds = Array.from(new Set([
    selectedRefuelCandidateId,
    selectedResupplyCandidateId,
  ].filter((id): id is string => !!id)));
  return {
    selectedRefuelCandidateId,
    selectedResupplyCandidateId,
    selectedSupplyCandidateIds,
  };
}

function smartResupplyPoiFromRouteContextCandidate(
  candidate: SupplyCandidate,
  category: SmartResupplyPoi['category'],
  fallbackAnchor: TripMapCoordinate,
): SmartResupplyPoi | null {
  const coordinate = {
    latitude: candidate.lat,
    longitude: candidate.lng,
  };
  if (!isValidMapCoordinate(coordinate)) return null;
  const suggestion: RoadNavSearchSuggestion = {
    id: `route-context-${candidate.id}`,
    title: candidate.name,
    subtitle: candidate.address ?? null,
    sourceType: 'manual_selection',
    mapboxId: candidate.providerPlaceId ?? null,
    coordinate: {
      lat: candidate.lat,
      lng: candidate.lng,
    },
    raw: {
      source: 'route_context_engine',
      routeContextCandidateId: candidate.id,
    },
  };
  return {
    id: `route-context-${candidate.id}`,
    title: candidate.name,
    subtitle: candidate.address ?? null,
    category,
    coordinate,
    distanceFromRouteStartMiles: candidate.driveDistanceToTrailheadMeters != null
      ? Math.round((candidate.driveDistanceToTrailheadMeters / 1609.344) * 10) / 10
      : Math.round(tripMapCoordinateDistanceMiles(fallbackAnchor, coordinate) * 10) / 10,
    distanceFromTrailheadMiles: candidate.driveDistanceToTrailheadMeters != null
      ? Math.round((candidate.driveDistanceToTrailheadMeters / 1609.344) * 10) / 10
      : Math.round(tripMapCoordinateDistanceMiles(fallbackAnchor, coordinate) * 10) / 10,
    distanceFromApproachRouteMiles: candidate.detourDistanceMeters != null
      ? Math.round((candidate.detourDistanceMeters / 1609.344) * 10) / 10
      : null,
    routeDeviationMiles: candidate.detourDistanceMeters != null
      ? Math.round((candidate.detourDistanceMeters / 1609.344) * 10) / 10
      : null,
    remainingApproachMilesToTrailhead: null,
    approachProgressRatio: null,
    approachScore: candidate.supplyChainScore ?? candidate.approachScore ?? candidate.score ?? null,
    beforeTrailEntry: null,
    fallbackState: 'trailhead_only',
    warnings: candidate.warnings.map((warning) => warning.message),
    diesel: false,
    groceries: candidate.category === 'grocery',
    sourceType: 'route_context_engine',
    suggestion,
  };
}

function normalizeSmartResupplyKeyPart(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function smartResupplyOptionStableKey(option: SmartResupplyPoi): string {
  const mapboxId = normalizeSmartResupplyKeyPart(option.suggestion.mapboxId ?? null);
  if (mapboxId) return `${option.category}:mapbox:${mapboxId}`;
  const routeContextCandidateId = normalizeSmartResupplyKeyPart(routeContextCandidateIdFromSmartOption(option));
  if (routeContextCandidateId) return `${option.category}:route-context:${routeContextCandidateId}`;
  const sourceId = normalizeSmartResupplyKeyPart(option.id || option.suggestion.id);
  if (sourceId) return `${option.category}:source:${sourceId}`;
  return [
    option.category,
    normalizeSmartResupplyKeyPart(option.title),
    option.coordinate.latitude.toFixed(4),
    option.coordinate.longitude.toFixed(4),
  ].join(':');
}

function smartResupplyOptionDisplaySignature(option: SmartResupplyPoi): string {
  return [
    smartResupplyOptionStableKey(option),
    normalizeSmartResupplyKeyPart(option.title),
    normalizeSmartResupplyKeyPart(option.subtitle),
    option.distanceFromRouteStartMiles == null ? 'unknown' : option.distanceFromRouteStartMiles.toFixed(1),
    option.routeDeviationMiles == null ? 'route-unknown' : option.routeDeviationMiles.toFixed(1),
    option.approachScore == null ? 'score-unknown' : option.approachScore.toFixed(3),
    option.fallbackState,
    option.sourceType,
    option.diesel ? 'diesel' : 'no-diesel',
    option.groceries ? 'groceries' : 'no-groceries',
  ].join('|');
}

function smartResupplyOptionListSignature(options: SmartResupplyPoi[]): string {
  return options.map(smartResupplyOptionDisplaySignature).join('||');
}

function smartResupplySearchSignature(
  routeStart: TripMapCoordinate,
  kind: SmartResupplySearchKind,
  approachRoute: TripMapCoordinate[] = [],
  selectionKey: string | null = null,
): string {
  const approachSignature = approachRoute
    .filter(isValidMapCoordinate)
    .map((point) => `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`)
    .join(';') || 'no-approach';
  return [
    kind,
    routeStart.latitude.toFixed(5),
    routeStart.longitude.toFixed(5),
    approachSignature,
    selectionKey ?? 'none',
  ].join(':');
}

function isSmartResupplyOptionRouteAware(option: SmartResupplyPoi): boolean {
  if (option.fallbackState === 'trailhead_only') return true;
  if (option.routeDeviationMiles == null) return true;
  return option.routeDeviationMiles <= SMART_RESUPPLY_MAX_ROUTE_DEVIATION_MILES;
}

function compareSmartResupplyOptionsByApproach(left: SmartResupplyPoi, right: SmartResupplyPoi): number {
  const approachDelta =
    (right.approachScore ?? Number.NEGATIVE_INFINITY) -
    (left.approachScore ?? Number.NEGATIVE_INFINITY);
  if (Math.abs(approachDelta) > 0.001) return approachDelta;
  const leftFallback = left.fallbackState === 'approach_route' ? 0 : 1;
  const rightFallback = right.fallbackState === 'approach_route' ? 0 : 1;
  if (leftFallback !== rightFallback) return leftFallback - rightFallback;
  const leftRouteContext = left.sourceType === 'route_context_engine' ? 0 : 1;
  const rightRouteContext = right.sourceType === 'route_context_engine' ? 0 : 1;
  if (leftRouteContext !== rightRouteContext) return leftRouteContext - rightRouteContext;
  const distanceDelta =
    (left.remainingApproachMilesToTrailhead ?? left.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY) -
    (right.remainingApproachMilesToTrailhead ?? right.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY);
  if (Math.abs(distanceDelta) > 0.001) return distanceDelta;
  return left.title.localeCompare(right.title);
}

function preferredSmartResupplyOption(current: SmartResupplyPoi, candidate: SmartResupplyPoi): SmartResupplyPoi {
  const currentRouteContext = current.sourceType === 'route_context_engine' ? 0 : 1;
  const candidateRouteContext = candidate.sourceType === 'route_context_engine' ? 0 : 1;
  if (candidateRouteContext < currentRouteContext) return candidate;
  if (currentRouteContext < candidateRouteContext) return current;
  if ((candidate.approachScore ?? -1) > (current.approachScore ?? -1)) return candidate;
  if (current.distanceFromRouteStartMiles == null && candidate.distanceFromRouteStartMiles != null) return candidate;
  if (!current.subtitle && candidate.subtitle) return candidate;
  return current;
}

function approachCandidateFromSmartResupplyOption(option: SmartResupplyPoi): ApproachResupplyCandidate {
  return {
    id: smartResupplyOptionStableKey(option),
    title: option.title,
    category: option.category,
    coordinate: option.coordinate,
    sourceType: option.sourceType,
    confidence: option.sourceType === 'route_context_engine' ? 'high' : 'medium',
    score: option.approachScore ?? undefined,
    beforeTrailEntry: option.beforeTrailEntry,
    distanceFromTrailheadMiles: option.distanceFromTrailheadMiles,
    distanceFromApproachRouteMiles: option.distanceFromApproachRouteMiles,
    detourDistanceMiles: option.routeDeviationMiles,
    warnings: option.warnings,
  };
}

function applyApproachRankingToSmartResupplyOptions(params: {
  options: SmartResupplyPoi[];
  category: SmartResupplyPoi['category'];
  trailhead: TripMapCoordinate;
  approachRoute: TripMapCoordinate[];
  origin?: TripMapCoordinate | null;
  limit?: number;
}): SmartResupplyPoi[] {
  const byKey = new Map(params.options.map((option) => [smartResupplyOptionStableKey(option), option]));
  return rankApproachResupplyOptions({
    category: params.category,
    origin: params.origin ?? params.approachRoute.find(isValidMapCoordinate) ?? null,
    trailhead: params.trailhead,
    approachRoute: params.approachRoute,
    candidates: params.options.map(approachCandidateFromSmartResupplyOption),
    maxRouteDeviationMiles: SMART_RESUPPLY_MAX_ROUTE_DEVIATION_MILES,
    limit: params.limit ?? params.options.length,
  }).flatMap((ranked): SmartResupplyPoi[] => {
    const option = byKey.get(ranked.id);
    if (!option) return [];
    return [{
      ...option,
      distanceFromRouteStartMiles: ranked.distanceFromTrailheadMiles,
      distanceFromTrailheadMiles: ranked.distanceFromTrailheadMiles,
      distanceFromApproachRouteMiles: ranked.distanceFromApproachRouteMiles,
      routeDeviationMiles: ranked.routeDeviationMiles,
      remainingApproachMilesToTrailhead: ranked.remainingApproachMilesToTrailhead,
      approachProgressRatio: ranked.approachProgressRatio,
      approachScore: ranked.approachScore,
      beforeTrailEntry: ranked.beforeTrailEntry,
      fallbackState: ranked.fallbackState,
      warnings: ranked.warnings,
    }];
  });
}

function applySmartResupplyOptionRefresh(
  previous: SmartResupplyPoi[],
  incoming: SmartResupplyPoi[],
): SmartResupplyPoi[] {
  return smartResupplyOptionListSignature(previous) === smartResupplyOptionListSignature(incoming)
    ? previous
    : incoming;
}

function refreshSelectedSmartResupplyOption(
  selected: SmartResupplyPoi | null,
  options: SmartResupplyPoi[],
): SmartResupplyPoi | null {
  if (!selected) return selected;
  const selectedKey = smartResupplyOptionStableKey(selected);
  return options.find((option) => smartResupplyOptionStableKey(option) === selectedKey) ?? selected;
}

function smartResupplyOptionsFromRouteContext(
  context: RouteContext | null,
  category: SmartResupplyPoi['category'],
  routeStart: TripMapCoordinate | null,
  approachRoute: TripMapCoordinate[] = [],
  fallbackAnchor: TripMapCoordinate | null = routeStart,
): SmartResupplyPoi[] {
  if (!isUsableRouteContext(context) || !routeStart) return [];
  const supplyCategory = category === 'fuel' ? 'gas' : 'grocery';
  const orderedCandidateIds = new Map(
    context.selectedSupplyPlan?.orderedStops.map((stop, index) => [stop.candidateId, index]) ?? [],
  );
  const options = context.supplyCandidates
    .filter((candidate) => candidate.category === supplyCategory)
    .sort((left, right) => {
      const leftOrder = orderedCandidateIds.get(left.id) ?? Number.POSITIVE_INFINITY;
      const rightOrder = orderedCandidateIds.get(right.id) ?? Number.POSITIVE_INFINITY;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      const leftChainScore = typeof left.supplyChainScore === 'number' ? left.supplyChainScore : left.score;
      const rightChainScore = typeof right.supplyChainScore === 'number' ? right.supplyChainScore : right.score;
      return rightChainScore - leftChainScore || right.score - left.score || right.confidence.value - left.confidence.value;
    })
    .map((candidate) => smartResupplyPoiFromRouteContextCandidate(candidate, category, fallbackAnchor ?? routeStart))
    .filter((option): option is SmartResupplyPoi => option != null);
  return applyApproachRankingToSmartResupplyOptions({
    options,
    category,
    trailhead: routeStart,
    approachRoute,
    limit: SMART_RESUPPLY_OPTION_LIMIT,
  })
    .filter(isSmartResupplyOptionRouteAware)
    .slice(0, SMART_RESUPPLY_OPTION_LIMIT);
}

function mergeSmartResupplyOptions(
  primary: SmartResupplyPoi[],
  secondary: SmartResupplyPoi[],
  previous: SmartResupplyPoi[] = [],
): SmartResupplyPoi[] {
  const merged = new Map<string, SmartResupplyPoi>();
  [...previous, ...primary, ...secondary].forEach((option) => {
    if (!isSmartResupplyOptionRouteAware(option)) return;
    const key = smartResupplyOptionStableKey(option);
    const current = merged.get(key);
    merged.set(key, current ? preferredSmartResupplyOption(current, option) : option);
  });
  return Array.from(merged.values())
    .sort(compareSmartResupplyOptionsByApproach)
    .slice(0, SMART_RESUPPLY_OPTION_LIMIT);
}

function orderSelectedSmartResupplyPoints(
  context: RouteContext | null,
  points: { option: SmartResupplyPoi; point: ResupplyPoint }[],
): ResupplyPoint[] {
  if (!isUsableRouteContext(context) || points.length < 2) return points.map((item) => item.point);
  const order = new Map(
    context.selectedSupplyPlan?.orderedStops.map((stop, index) => [stop.candidateId, index]) ?? [],
  );
  return [...points]
    .sort((left, right) => {
      const leftId = routeContextCandidateIdFromSmartOption(left.option);
      const rightId = routeContextCandidateIdFromSmartOption(right.option);
      const leftOrder = leftId && order.has(leftId) ? order.get(leftId) as number : Number.POSITIVE_INFINITY;
      const rightOrder = rightId && order.has(rightId) ? order.get(rightId) as number : Number.POSITIVE_INFINITY;
      return leftOrder - rightOrder;
    })
    .map((item) => item.point);
}

function bailoutPlanPointFromDestination(
  suggestion: RoadNavSearchSuggestion,
  destination: RoadNavDestination,
  routeStart: TripMapCoordinate,
): BailoutPlanPoint | null {
  const coordinate = {
    latitude: destination.coordinate.lat,
    longitude: destination.coordinate.lng,
  };
  if (!isValidMapCoordinate(coordinate)) return null;
  return {
    id: `mapbox-bailout-${makePlanIdPart(destination.id || suggestion.id)}`,
    title: destination.title || suggestion.title,
    subtitle: destination.subtitle ?? suggestion.subtitle ?? 'Nearby road-access or rendezvous option.',
    coordinate,
    source: 'mapbox_search',
    distanceFromRouteStartMiles: Math.round(tripMapCoordinateDistanceMiles(routeStart, coordinate) * 10) / 10,
  };
}

function bailoutPlanPointsFromRouteContext(context: RouteContext | null): BailoutPlanPoint[] {
  if (!isUsableRouteContext(context)) return [];
  const routeStart = routeContextTrailheadCoordinate(context);
  return context.bailoutCandidates
    .map((candidate): BailoutPlanPoint | null => {
      const coordinate = { latitude: candidate.lat, longitude: candidate.lng };
      if (!isValidMapCoordinate(coordinate)) return null;
      return {
        id: `route-context-bailout-${candidate.id}`,
        title: candidate.label,
        subtitle: [
          candidate.category ? candidate.category.replace(/_/g, ' ') : 'Route Context bailout candidate',
          candidate.reachableByVehicle === false ? 'vehicle reachability unknown/limited' : null,
        ].filter(Boolean).join(' | ') || 'Route Context bailout candidate. Verify legal access and drivability.',
        coordinate,
        source: 'ecs_suggested',
        distanceFromRouteStartMiles: routeStart ? Math.round(tripMapCoordinateDistanceMiles(routeStart, coordinate) * 10) / 10 : null,
      };
    })
    .filter((point): point is BailoutPlanPoint => point != null);
}

function buildBailoutSearchAnchors(routePoints: TripMapCoordinate[]): TripMapCoordinate[] {
  const validPoints = routePoints.filter(isValidMapCoordinate);
  if (validPoints.length === 0) return [];
  const indexes = [
    0,
    Math.floor(validPoints.length * 0.5),
    Math.floor(validPoints.length * 0.75),
    validPoints.length - 1,
  ];
  const anchors: TripMapCoordinate[] = [];
  indexes.forEach((index) => {
    const point = validPoints[Math.max(0, Math.min(validPoints.length - 1, index))];
    if (point && !anchors.some((existing) => sameTripCoordinate(existing, point))) anchors.push(point);
  });
  return anchors;
}

function bailoutExitPointForPlan(point: BailoutPlanPoint): ExitPoint {
  return {
    id: point.id,
    name: point.title,
    type: point.source === 'operator_drop' ? 'operator_selected_bailout' : 'suggested_bailout_rendezvous',
    location: point.coordinate,
    routeMileMarker: null,
    priority: 1,
    source: point.source,
    notes: [
      point.subtitle ?? 'Operator selected as an emergency bailout or rendezvous point.',
      'Verify legal access, drivability, and current conditions before relying on this point.',
    ],
  };
}

function tripPlanReferencePointFromCampPin(pin: CampPlanPin): TripPlanReferencePoint {
  return {
    id: pin.id,
    type: 'camp',
    title: pin.title,
    coordinate: pin.coordinate,
    source: 'operator_drop',
    confidence: 'unknown',
    referenceType: 'camp_candidate',
    notes: [
      'Operator-marked potential camp. Legal access, land use, fire restrictions, and posted rules are unknown.',
      pin.note,
    ].filter((note): note is string => !!note),
  };
}

function tripPlanReferencePointFromBailoutPoint(point: BailoutPlanPoint): TripPlanReferencePoint {
  return {
    id: point.id,
    type: 'exit',
    title: point.title,
    coordinate: point.coordinate,
    source: point.source,
    confidence: point.source === 'operator_drop' ? 'low' : 'medium',
    referenceType: 'bailout',
    notes: [
      point.subtitle ?? 'Emergency bailout or rendezvous point selected.',
      'Reference-only bailout pin. Verify legal access, drivability, and current conditions before relying on it.',
    ],
  };
}

function appendBailoutStopToPlan(plan: TripPlan, point: BailoutPlanPoint | null): TripPlan {
  if (!point) return plan;
  const duplicate = plan.suggestedStops.some((stop) => (
    isBailoutItineraryStop(stop) &&
    stop.coordinate &&
    Math.abs(stop.coordinate.latitude - point.coordinate.latitude) < 0.0001 &&
    Math.abs(stop.coordinate.longitude - point.coordinate.longitude) < 0.0001
  ));
  if (duplicate) return plan;
  const nextStops = [
    ...plan.suggestedStops,
    {
      id: `${plan.id}-operator-bailout-${makePlanIdPart(point.id)}`,
      type: 'exit' as const,
      title: point.title,
      sequence: plan.suggestedStops.length + 1,
      plannedDay: plan.estimate.tripDays ?? 1,
      coordinate: point.coordinate,
      routeMileMarker: null,
      etaOffsetHours: null,
      source: ITINERARY_BAILOUT_SOURCE,
      confidence: 'medium' as const,
      guidanceRole: 'reference_only' as const,
      referenceType: 'bailout' as const,
      notes: [
        ITINERARY_BAILOUT_NOTE,
        point.subtitle ?? 'Operator selected as an emergency bailout or rendezvous point.',
        'This bailout point remains unconnected from the projected guidance line.',
      ],
    },
  ];
  return updateTripPlanStops({ ...plan, suggestedStops: nextStops }, nextStops);
}

async function loadSmartResupplyOptions(params: {
  accessToken: string;
  sessionToken: string;
  query: string;
  category: SmartResupplyPoi['category'];
  routeStart: TripMapCoordinate;
  approachRoute: TripMapCoordinate[];
  origin?: TripMapCoordinate | null;
  fallbackAnchor?: TripMapCoordinate | null;
}): Promise<SmartResupplyPoi[]> {
  const searchAnchors = buildApproachResupplySearchAnchors({
    trailhead: params.routeStart,
    approachRoute: params.approachRoute,
    fallbackAnchor: params.fallbackAnchor ?? params.routeStart,
    maxAnchors: 5,
  });
  const suggestionMap = new Map<string, RoadNavSearchSuggestion>();
  const collectSuggestions = (suggestions: RoadNavSearchSuggestion[]) => {
    suggestions.forEach((suggestion) => {
      const key = smartResupplySuggestionKey(suggestion);
      if (!suggestionMap.has(key)) suggestionMap.set(key, suggestion);
    });
  };
  const collectSearchPass = async (anchor: TripMapCoordinate, bbox?: SmartResupplySearchBounds) => {
    const suggestions = await searchRoadDestinations({
      accessToken: params.accessToken,
      query: params.query,
      sessionToken: params.sessionToken,
      proximity: { lat: anchor.latitude, lng: anchor.longitude },
      bbox,
      limit: SMART_RESUPPLY_SEARCH_LIMIT,
    });
    collectSuggestions(suggestions);
  };

  for (const anchor of searchAnchors) {
    for (const radiusMiles of SMART_RESUPPLY_SEARCH_RADIUS_TIERS_MILES) {
      try {
        await collectSearchPass(anchor.coordinate, smartResupplySearchBounds(anchor.coordinate, radiusMiles));
      } catch {}
      if (suggestionMap.size >= SMART_RESUPPLY_OPTION_LIMIT * 3) break;
    }
    if (suggestionMap.size >= SMART_RESUPPLY_OPTION_LIMIT * 3) break;
  }

  const options: SmartResupplyPoi[] = [];
  const seen = new Set<string>();
  const fallbackAnchor = params.fallbackAnchor ?? params.routeStart;
  for (const suggestion of suggestionMap.values()) {
    try {
      const destination = await resolveRoadDestination({
        accessToken: params.accessToken,
        sessionToken: params.sessionToken,
        suggestion,
      });
      const option = smartResupplyPoiFromDestination(suggestion, destination, params.category, fallbackAnchor);
      if (!option) continue;
      const key = `${option.title.toLowerCase()}:${option.coordinate.latitude.toFixed(4)}:${option.coordinate.longitude.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(option);
    } catch {}
  }
  return applyApproachRankingToSmartResupplyOptions({
    options,
    category: params.category,
    trailhead: params.routeStart,
    approachRoute: params.approachRoute,
    origin: params.origin ?? null,
    limit: SMART_RESUPPLY_OPTION_LIMIT * 2,
  })
    .filter(isSmartResupplyOptionRouteAware)
    .sort(compareSmartResupplyOptionsByApproach)
    .slice(0, SMART_RESUPPLY_OPTION_LIMIT);
}

async function loadBailoutPlanOptions(params: {
  accessToken: string;
  sessionToken: string;
  routePoints: TripMapCoordinate[];
  routeContextOptions?: BailoutPlanPoint[];
}): Promise<BailoutPlanPoint[]> {
  const routeStart = params.routePoints[0];
  const midRoute = params.routePoints[Math.max(0, Math.floor(params.routePoints.length * 0.5))] ?? routeStart;
  const lateRoute = params.routePoints[Math.max(0, Math.floor(params.routePoints.length * 0.75))] ?? midRoute;
  const routeEnd = params.routePoints[params.routePoints.length - 1] ?? lateRoute;
  const routeContextOptions = params.routeContextOptions ?? [];
  const suggestedCandidates: (BailoutPlanPoint | null)[] = [
    ...routeContextOptions,
    routeEnd ? {
      id: 'ecs-route-finish-rendezvous',
      title: 'Route finish rendezvous',
      subtitle: 'End-of-route rendezvous option. Verify this is not the only escape path.',
      coordinate: routeEnd,
      source: 'ecs_suggested' as const,
      distanceFromRouteStartMiles: routeStart ? Math.round(tripMapCoordinateDistanceMiles(routeStart, routeEnd) * 10) / 10 : null,
    } : null,
    lateRoute ? {
      id: 'ecs-late-route-road-access-search',
      title: 'Late-route road access search',
      subtitle: 'Route-derived candidate near the last quarter of the trail. Verify road access before relying on it.',
      coordinate: lateRoute,
      source: 'ecs_suggested' as const,
      distanceFromRouteStartMiles: routeStart ? Math.round(tripMapCoordinateDistanceMiles(routeStart, lateRoute) * 10) / 10 : null,
    } : null,
    midRoute ? {
      id: 'ecs-mid-route-bailout-search',
      title: 'Mid-route bailout search',
      subtitle: 'Route-derived candidate near the midpoint for emergency planning.',
      coordinate: midRoute,
      source: 'ecs_suggested' as const,
      distanceFromRouteStartMiles: routeStart ? Math.round(tripMapCoordinateDistanceMiles(routeStart, midRoute) * 10) / 10 : null,
    } : null,
  ];
  const suggested = suggestedCandidates.filter((point): point is BailoutPlanPoint => !!point && isValidMapCoordinate(point.coordinate));

  const suggestions: RoadNavSearchSuggestion[] = [];
  for (const anchor of buildBailoutSearchAnchors(params.routePoints)) {
    try {
      const anchorSuggestions = await searchRoadDestinations({
        accessToken: params.accessToken,
        query: BAILOUT_SEARCH_QUERY,
        sessionToken: params.sessionToken,
        proximity: { lat: anchor.latitude, lng: anchor.longitude },
        limit: BAILOUT_SEARCH_LIMIT,
      });
      anchorSuggestions.forEach((suggestion) => suggestions.push(suggestion));
    } catch {}
  }
  const seen = new Set<string>();
  const options: BailoutPlanPoint[] = [];
  const addOption = (point: BailoutPlanPoint) => {
    const key = `${point.title.toLowerCase()}:${point.coordinate.latitude.toFixed(4)}:${point.coordinate.longitude.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.push(point);
  };
  suggested.forEach(addOption);
  for (const suggestion of suggestions) {
    try {
      const destination = await resolveRoadDestination({
        accessToken: params.accessToken,
        sessionToken: params.sessionToken,
        suggestion,
      });
      const point = bailoutPlanPointFromDestination(suggestion, destination, routeStart);
      if (point) addOption(point);
    } catch {}
  }
  const routeEvidenceOptions = options
    .filter((point) => point.source !== 'mapbox_search')
    .slice(0, BAILOUT_OPTION_LIMIT);
  const mapboxOptions = options
    .filter((point) => point.source === 'mapbox_search')
    .sort(
      (left, right) =>
        (left.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY) -
        (right.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, BAILOUT_OPTION_LIMIT);

  return filterBailoutPlanCandidates({
    providerCandidates: [...routeEvidenceOptions, ...mapboxOptions],
    routeFallbackCandidates: suggested,
    routeStart,
    routePoints: params.routePoints,
    limit: BAILOUT_OPTION_LIMIT,
  }).candidates;
}

function interpolateTripRouteCoordinate(
  routePoints: TripMapCoordinate[],
  routeMileMarker: number | null | undefined,
): TripMapCoordinate | null {
  if (!Number.isFinite(routeMileMarker) || routePoints.length === 0) return null;
  const validPoints = routePoints.filter(isValidMapCoordinate);
  if (validPoints.length === 0) return null;
  const targetMiles = Math.max(0, Number(routeMileMarker));
  if (targetMiles === 0 || validPoints.length === 1) return validPoints[0];

  let coveredMiles = 0;
  for (let index = 1; index < validPoints.length; index += 1) {
    const start = validPoints[index - 1];
    const end = validPoints[index];
    const segmentMiles = tripMapCoordinateDistanceMiles(start, end);
    if (segmentMiles <= 0) continue;
    if (coveredMiles + segmentMiles >= targetMiles) {
      const ratio = (targetMiles - coveredMiles) / segmentMiles;
      return {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      };
    }
    coveredMiles += segmentMiles;
  }
  return validPoints[validPoints.length - 1];
}

function nearestCoordinateOnRouteLine(
  routePoints: TripMapCoordinate[],
  coordinate: TripMapCoordinate | null | undefined,
): TripMapCoordinate | null {
  if (!isValidMapCoordinate(coordinate)) return null;
  const validPoints = routePoints.filter(isValidMapCoordinate);
  if (validPoints.length === 0) return coordinate;
  if (validPoints.length === 1) return validPoints[0];

  let nearest = validPoints[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < validPoints.length; index += 1) {
    const start = validPoints[index - 1];
    const end = validPoints[index];
    const dx = end.longitude - start.longitude;
    const dy = end.latitude - start.latitude;
    const denominator = dx * dx + dy * dy;
    const ratio = denominator > 0
      ? Math.max(0, Math.min(1, ((coordinate.longitude - start.longitude) * dx + (coordinate.latitude - start.latitude) * dy) / denominator))
      : 0;
    const projected = {
      latitude: start.latitude + dy * ratio,
      longitude: start.longitude + dx * ratio,
    };
    const distance = tripMapCoordinateDistanceMiles(coordinate, projected);
    if (distance < nearestDistance) {
      nearest = projected;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function getTripPlanMapReadyCount(
  route: TripBuilderRouteInput,
  plan: TripPlan,
  scope: TripPlanMapScope,
): number {
  if (scope === 'itinerary') {
    const baseRoutePoints = routePointsForTripMap(route);
    const enrichedRoute = routeForOfflinePrep(route, plan, baseRoutePoints);
    const routePoints = routePointsForTripMap(enrichedRoute);
    const stopRoutePoints = baseRoutePoints.length >= 2 ? baseRoutePoints : routePoints;
    return plan.suggestedStops
      .filter((stop) => !!coordinateForTripPlanStop(plan, stop, stopRoutePoints))
      .length;
  }
  if (scope === 'camps') {
    return [plan.primaryCampCandidate, plan.backupCampCandidate]
      .filter((candidate) => isValidMapCoordinate(candidate?.location))
      .length + campReferenceStopsFromPlan(plan).filter((stop) => isValidMapCoordinate(stop.coordinate)).length;
  }
  if (scope === 'exits') {
    return exitPointsFromPlan(plan, routePointsForTripMap(route))
      .filter((exitPoint) => isValidMapCoordinate(exitPoint.location))
      .length;
  }
  const smart = plan.smartResupplyPlan;
  if (!smart) return 0;
  return resupplyRows(smart)
    .filter((entry) => isValidMapCoordinate(entry.keyPoint?.location))
    .length;
}

function resupplyMapType(category: ResupplyCategoryPlan['category']): string {
  switch (category) {
    case 'food_supplies':
      return 'supply';
    case 'exit_access':
      return 'exit';
    default:
      return category;
  }
}

function markerToneForStopType(type: string | null | undefined): {
  color: string;
  mapChar: string;
} {
  switch (type) {
    case 'camp':
    case 'backup_camp':
      return { color: '#66BB6A', mapChar: 'C' };
    case 'exit':
      return { color: '#EF5350', mapChar: 'X' };
    case 'fuel':
      return { color: '#64B5F6', mapChar: 'F' };
    case 'water':
      return { color: '#4FC3F7', mapChar: 'W' };
    case 'supply':
      return { color: TACTICAL.amber, mapChar: 'S' };
    case 'repair':
      return { color: '#B39DDB', mapChar: 'R' };
    case 'medical':
      return { color: '#FF8A80', mapChar: 'M' };
    case 'start':
      return { color: '#FFFFFF', mapChar: 'A' };
    case 'finish':
      return { color: TACTICAL.amber, mapChar: 'B' };
    default:
      return { color: TACTICAL.textMuted, mapChar: 'P' };
  }
}

function buildTripPlanCameraCommand(
  scope: TripPlanMapScope,
  focusMarker: TripPlanMapMarker | null,
  routePointCount: number,
): CameraCommand | null {
  if (!focusMarker) return null;
  return {
    mode: 'pin_focus',
    center: {
      latitude: focusMarker.latitude,
      longitude: focusMarker.longitude,
    },
    zoom: scope === 'itinerary' ? 12.8 : 13.2,
    durationMs: 0,
    animate: false,
    reason: `trip_builder_${scope}_focus_${focusMarker.id}`,
  };
}

function buildTripRoutePreviewCameraCommand(
  routePoints: TripMapCoordinate[],
  reasonPrefix: string,
): CameraCommand | null {
  const validPoints = routePoints.filter(isValidMapCoordinate);
  if (validPoints.length === 0) return null;
  if (validPoints.length === 1) {
    const point = validPoints[0];
    return {
      mode: 'route_overview',
      center: { latitude: point.latitude, longitude: point.longitude },
      zoom: 13,
      durationMs: 0,
      animate: false,
      reason: `trip_builder_${reasonPrefix}_route_start_focus`,
    };
  }

  const bounds = validPoints.reduce(
    (current, point) => ({
      north: Math.max(current.north, point.latitude),
      south: Math.min(current.south, point.latitude),
      east: Math.max(current.east, point.longitude),
      west: Math.min(current.west, point.longitude),
    }),
    {
      north: -90,
      south: 90,
      east: -180,
      west: 180,
    },
  );

  return {
    mode: 'route_overview',
    fitBounds: {
      ...bounds,
      padding: 72,
      maxZoom: 13.5,
    },
    durationMs: 0,
    animate: false,
    reason: `trip_builder_${reasonPrefix}_route_preview_bounds`,
  };
}

function buildBailoutRoutePreviewCameraCommand(routePoints: TripMapCoordinate[]): CameraCommand | null {
  return buildTripRoutePreviewCameraCommand(routePoints, 'bailout');
}

function buildTripPlanMapModel(
  route: TripBuilderRouteInput | null,
  plan: TripPlan | null,
  scope: TripPlanMapScope | null,
  itinerarySaved = false,
  routePreviewPoints: TripMapCoordinate[] = [],
): TripPlanMapModel {
  if (!route || !plan || !scope) {
    return {
      points: [],
      markers: [],
      title: 'Trip Map',
      subtitle: 'No trip plan selected.',
      focusMarker: null,
      cameraCommand: null,
    };
  }

  const preparedRoutePoints = routePreviewPoints.filter(isValidMapCoordinate);
  const baseRoutePoints = preparedRoutePoints.length >= 2
    ? preparedRoutePoints
    : routePointsForTripMap(route);
  const enrichedRoute = routeForOfflinePrep(route, plan, baseRoutePoints);
  const enrichedRoutePoints = routePointsForTripMap(enrichedRoute);
  const routePoints = baseRoutePoints.length >= 2 ? baseRoutePoints : enrichedRoutePoints;
  const markerSources: {
    id: string;
    title: string;
    type: string;
    pinType?: string;
    coordinate: TripMapCoordinate | null;
    subtitle?: string | null;
    mapChar?: string;
    color?: string;
    connectToRouteLine?: boolean;
  }[] = [];

  if (scope === 'itinerary') {
    const stopRoutePoints = baseRoutePoints.length >= 2 ? baseRoutePoints : routePoints;
    plan.suggestedStops
      .slice()
      .sort((left, right) => left.sequence - right.sequence)
      .forEach((stop, index) => {
        const mapChar = formatTripMapLetter(index);
        const coordinate = coordinateForTripPlanStop(plan, stop, stopRoutePoints);
        const tone = itineraryStopTone(stop);
        markerSources.push({
          id: stop.id,
          title: `${mapChar}. ${stop.title}`,
          type: stop.type,
          pinType: 'itinerary',
          coordinate,
          subtitle: [tone.label, stop.type.replace(/_/g, ' '), formatRouteMarker(stop.routeMileMarker)].filter(Boolean).join(' | '),
          mapChar,
          color: tone.color,
          connectToRouteLine: isGuidanceConnectedTripPlanStop(stop),
        });
      });
  } else if (scope === 'camps') {
    [plan.primaryCampCandidate, plan.backupCampCandidate].forEach((candidate, index) => {
      if (!candidate) return;
      markerSources.push({
        id: candidate.id,
        title: `${index === 0 ? 'Primary' : 'Backup'}: ${candidate.name}`,
        type: index === 0 ? 'camp' : 'backup_camp',
        coordinate: candidate.location ?? null,
        subtitle: campCandidateLine(candidate),
      });
    });
    campReferenceStopsFromPlan(plan).forEach((stop, index) => {
      markerSources.push({
        id: stop.id,
        title: `Operator ${index + 1}: ${stop.title}`,
        type: 'camp',
        coordinate: stop.coordinate,
        subtitle: stop.notes?.[0] ?? 'Operator-marked potential camp. Verify legal access before relying on it.',
        connectToRouteLine: false,
      });
    });
  } else if (scope === 'exits') {
    exitPointsFromPlan(plan, baseRoutePoints).forEach((exitPoint) => {
      markerSources.push({
        id: exitPoint.id,
        title: exitPoint.name,
        type: 'exit',
        coordinate: exitPoint.location ?? null,
        subtitle: exitPointLine(exitPoint),
      });
    });
  } else if (scope === 'resupply') {
    if (!plan.smartResupplyPlan) {
      return {
        points: routePoints,
        markers: [],
        title: mapScopeTitle(scope, itinerarySaved),
        subtitle: 'No smart resupply plan is available yet.',
        focusMarker: null,
        cameraCommand: null,
      };
    }
    resupplyRows(plan.smartResupplyPlan).forEach((entry) => {
      if (!entry.keyPoint?.location) return;
      markerSources.push({
        id: entry.keyPoint.id,
        title: `${resupplyLabel(entry.category)}: ${entry.keyPoint.name}`,
        type: resupplyMapType(entry.category),
        coordinate: entry.keyPoint.location,
        subtitle: entry.primaryRecommendation,
      });
    });
  }

  const markers = markerSources
    .flatMap((entry): TripPlanMapMarker[] => {
      const coordinate = entry.coordinate;
      if (!isValidMapCoordinate(coordinate)) return [];
      const tone = markerToneForStopType(entry.type);
      return [{
        id: entry.id,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        title: entry.title,
        subtitle: entry.subtitle ?? undefined,
        type: entry.pinType ?? entry.type,
        color: entry.color ?? tone.color,
        mapChar: entry.mapChar ?? tone.mapChar,
        connectToRouteLine: entry.connectToRouteLine ?? true,
      }];
    });
  const fallbackPoints = markers
    .filter((marker) => marker.connectToRouteLine !== false)
    .map((marker) => ({ latitude: marker.latitude, longitude: marker.longitude }));
  const itineraryRouteLinePoints = scope === 'itinerary' && routePoints.length >= 2
    ? routePoints
    : fallbackPoints;
  const points = scope === 'itinerary'
    ? itineraryRouteLinePoints
    : routePoints.length >= 2
      ? routePoints
      : fallbackPoints;
  const focusMarker = markers[0] ?? null;
  return {
    points,
    markers,
    title: mapScopeTitle(scope, itinerarySaved),
    subtitle: markers.length > 0
      ? scope === 'itinerary'
        ? `${markers.length} itinerary point${markers.length === 1 ? '' : 's'} labeled A-${markers[markers.length - 1]?.mapChar ?? 'A'} over the selected route preview.`
        : `${markers.length} mapped point${markers.length === 1 ? '' : 's'} from the generated trip plan.`
      : 'No map-ready points are available for this section yet.',
    focusMarker,
    cameraCommand:
      scope === 'itinerary' && points.length >= 2
        ? buildTripRoutePreviewCameraCommand(points, 'itinerary')
        : buildTripPlanCameraCommand(scope, focusMarker, points.length),
  };
}

function TripPlanMapOverlay({
  visible,
  scope,
  route,
  routePreviewPoints,
  plan,
  itinerarySaved = false,
  onClose,
}: {
  visible: boolean;
  scope: TripPlanMapScope | null;
  route: TripBuilderRouteInput | null;
  routePreviewPoints: TripMapCoordinate[];
  plan: TripPlan | null;
  itinerarySaved?: boolean;
  onClose: () => void;
}) {
  const [mapboxToken, setMapboxToken] = useState(() => getMapboxTokenSync());
  const model = useMemo(
    () => buildTripPlanMapModel(route, plan, scope, itinerarySaved, routePreviewPoints),
    [itinerarySaved, plan, route, routePreviewPoints, scope],
  );

  useEffect(() => {
    if (!visible || mapboxToken) return;
    let cancelled = false;
    getMapboxToken().then((token) => {
      if (!cancelled) setMapboxToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [mapboxToken, visible]);

  if (!visible) return null;

  return (
    <View style={styles.tripMapOverlay} testID="trip-builder-map-overlay">
      <View style={styles.tripMapCard}>
        <View style={styles.tripMapHeader}>
          <View style={styles.tripMapHeaderCopy}>
            <Text style={styles.eyebrow}>TRIP MAP</Text>
            <Text style={styles.tripMapTitle}>{model.title}</Text>
            <Text style={styles.tripMapSubtitle}>{model.subtitle}</Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseButton}
            activeOpacity={0.82}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close Trip Map"
            testID="trip-builder-map-close"
          >
            <Ionicons name="close" size={18} color={TACTICAL.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.tripMapFrame}>
          {mapboxToken && model.points.length > 0 ? (
            <MapRenderer
              points={model.points}
              pinMarkers={model.markers}
              routeColor={TACTICAL.amber}
              mapStyle={DEFAULT_MAP_STYLE}
              mapboxToken={mapboxToken}
              hasToken={!!mapboxToken}
              motionPriority="warm"
              interactive
              cameraMode="route_overview"
              cameraCommand={model.cameraCommand}
              style={styles.tripMapSurface}
            />
          ) : (
            <View style={styles.tripMapFallback}>
              <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
              <Text style={styles.tripMapFallbackTitle}>Map preview unavailable</Text>
              <Text style={styles.tripMapFallbackText}>
                Route geometry or Mapbox rendering is not ready. The trip plan points remain listed below.
              </Text>
            </View>
          )}
        </View>
        <ScrollView style={styles.tripMapPointList} contentContainerStyle={styles.tripMapPointListContent}>
          {model.markers.length === 0 ? (
            <Text style={styles.resultText}>No map-ready points for this section.</Text>
          ) : (
            model.markers.map((marker) => (
              <View key={marker.id} style={styles.tripMapPointRow}>
                <View style={[styles.tripMapPointDot, { borderColor: marker.color, backgroundColor: marker.color + '18' }]}>
                  <Text style={[styles.tripMapPointDotText, { color: marker.color }]}>{marker.mapChar}</Text>
                </View>
                <View style={styles.tripMapPointCopy}>
                  <Text style={styles.tripMapPointTitle}>{marker.title}</Text>
                  {marker.subtitle ? <Text style={styles.tripMapPointMeta}>{marker.subtitle}</Text> : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function CampPlanPickerOverlay({
  visible,
  route,
  routePreviewPoints,
  pins,
  onDropPin,
  onRemovePin,
  onClearPins,
  onClose,
}: {
  visible: boolean;
  route: TripBuilderRouteInput | null;
  routePreviewPoints: TripMapCoordinate[];
  pins: CampPlanPin[];
  onDropPin: (coordinate: TripMapCoordinate) => void;
  onRemovePin: (id: string) => void;
  onClearPins: () => void;
  onClose: () => void;
}) {
  const [mapboxToken, setMapboxToken] = useState(() => getMapboxTokenSync());
  const routePoints = useMemo(() => {
    const prepared = routePreviewPoints.filter(isValidMapCoordinate);
    if (prepared.length > 0) return prepared;
    return route ? routePointsForTripMap(route) : [];
  }, [route, routePreviewPoints]);
  const campCameraCommand = useMemo(
    () => buildTripRoutePreviewCameraCommand(routePoints, 'camp_plan'),
    [routePoints],
  );
  const campMarkers = pins.map((pin, index): TripPlanMapMarker => ({
    id: pin.id,
    latitude: pin.coordinate.latitude,
    longitude: pin.coordinate.longitude,
    title: pin.title,
    subtitle: 'Operator-marked potential camp. Verify access, land use, fire restrictions, and posted rules.',
    type: 'camp',
    color: '#66BB6A',
    mapChar: String(index + 1),
    connectToRouteLine: false,
  }));

  useEffect(() => {
    if (!visible || mapboxToken) return;
    let cancelled = false;
    getMapboxToken().then((token) => {
      if (!cancelled) setMapboxToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [mapboxToken, visible]);

  if (!visible) return null;

  return (
    <View style={styles.tripMapOverlay} testID="trip-builder-camp-picker-overlay">
      <View style={styles.bailoutPickerCard}>
        <View style={styles.tripMapHeader}>
          <View style={styles.tripMapHeaderCopy}>
            <Text style={styles.eyebrow}>REFERENCE CAMP PLAN</Text>
            <Text style={styles.tripMapTitle}>Camp Plan</Text>
            <Text style={styles.tripMapSubtitle}>
              Tap the map to drop operator reference camp pins. These pins do not alter navigation.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseButton}
            activeOpacity={0.82}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close camp picker"
            testID="trip-builder-camp-picker-close"
          >
            <Ionicons name="close" size={18} color={TACTICAL.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.bailoutPickerMapFrame}>
          {mapboxToken && routePoints.length > 0 ? (
            <MapRenderer
              points={routePoints}
              pinMarkers={campMarkers}
              routeColor={TACTICAL.amber}
              mapStyle={DEFAULT_MAP_STYLE}
              mapboxToken={mapboxToken}
              hasToken={!!mapboxToken}
              motionPriority="warm"
              interactive
              cameraMode="route_overview"
              cameraCommand={campCameraCommand}
              onMapTap={(coordinate) => onDropPin(coordinate)}
              style={styles.tripMapSurface}
            />
          ) : (
            <View style={styles.tripMapFallback}>
              <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
              <Text style={styles.tripMapFallbackTitle}>Camp map unavailable</Text>
              <Text style={styles.tripMapFallbackText}>Route geometry or map token is unavailable. Camp pins can be added when the route map is available.</Text>
            </View>
          )}
        </View>
        <View style={styles.bailoutPickerFooter}>
          <View style={styles.bailoutPickerFooterHeader}>
            <Text style={styles.bailoutPickerTitle}>Camp Reference Pins</Text>
            {pins.length > 0 ? (
              <TouchableOpacity
                style={styles.bailoutOpenButton}
                activeOpacity={0.82}
                onPress={onClearPins}
                accessibilityRole="button"
                accessibilityLabel="Clear camp pins"
                testID="trip-builder-clear-camp-pins"
              >
                <Ionicons name="trash-outline" size={12} color={TACTICAL.amber} />
                <Text style={styles.bailoutOpenButtonText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView style={styles.bailoutOptionList} contentContainerStyle={styles.bailoutOptionListContent}>
            {pins.length === 0 ? (
              <Text style={styles.tripMapPointMeta}>Tap the map to drop camp reference pins along the selected route.</Text>
            ) : (
              pins.map((pin, index) => (
                <View key={pin.id} style={styles.campPinRow}>
                  <View style={styles.campPinIcon}>
                    <Text style={styles.smartResupplyMarkerText}>{index + 1}</Text>
                  </View>
                  <View style={styles.campPinCopy}>
                    <Text style={styles.campPinTitle}>{pin.title}</Text>
                    <Text style={styles.campPinMeta} numberOfLines={1}>
                      Operator-marked potential camp. Legal access, land use, fire restrictions, and posted rules are unknown.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.campPinRemove}
                    activeOpacity={0.82}
                    onPress={() => onRemovePin(pin.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove camp pin ${index + 1}`}
                  >
                    <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.84}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Save camp pins"
            testID="trip-builder-save-camp-pins"
          >
            <Text style={styles.primaryButtonText}>{pins.length > 0 ? 'Save Camp Pins' : 'Done'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function BailoutPlanPickerOverlay({
  visible,
  route,
  routePreviewPoints,
  options,
  selectedPoint,
  loading,
  error,
  onSelect,
  onDropPoint,
  onClose,
}: {
  visible: boolean;
  route: TripBuilderRouteInput | null;
  routePreviewPoints: TripMapCoordinate[];
  options: BailoutPlanPoint[];
  selectedPoint: BailoutPlanPoint | null;
  loading: boolean;
  error: string | null;
  onSelect: (point: BailoutPlanPoint) => void;
  onDropPoint: (coordinate: TripMapCoordinate) => void;
  onClose: () => void;
}) {
  const [mapboxToken, setMapboxToken] = useState(() => getMapboxTokenSync());
  const routePoints = useMemo(() => {
    const prepared = routePreviewPoints.filter(isValidMapCoordinate);
    if (prepared.length > 0) return prepared;
    return route ? routePointsForTripMap(route) : [];
  }, [route, routePreviewPoints]);
  const routeEndpointMarkers = useMemo(() => {
    if (routePoints.length === 0) return [];
    const start = routePoints[0];
    const end = routePoints.length > 1 ? routePoints[routePoints.length - 1] : null;
    const markers: TripPlanMapMarker[] = [{
      id: 'bailout-route-start',
      latitude: start.latitude,
      longitude: start.longitude,
      title: 'Route start',
      subtitle: 'Selected Trip Builder route entry point.',
      type: 'start',
      color: '#FFFFFF',
      mapChar: 'S',
    }];
    if (end && !sameTripCoordinate(start, end)) {
      markers.push({
        id: 'bailout-route-end',
        latitude: end.latitude,
        longitude: end.longitude,
        title: 'Route end',
        subtitle: 'Selected Trip Builder route exit point.',
        type: 'finish',
        color: TACTICAL.amber,
        mapChar: 'E',
      });
    }
    return markers;
  }, [routePoints]);
  const bailoutCameraCommand = useMemo(
    () => buildBailoutRoutePreviewCameraCommand(routePoints),
    [routePoints],
  );
  const selectedMarker = selectedPoint ? [{
    id: selectedPoint.id,
    latitude: selectedPoint.coordinate.latitude,
    longitude: selectedPoint.coordinate.longitude,
    title: selectedPoint.title,
    subtitle: selectedPoint.subtitle ?? undefined,
    type: 'bailout',
    color: ITINERARY_BAILOUT_COLOR,
    mapChar: 'B',
  }] : [];
  const optionMarkers = options
    .filter((option) => option.id !== selectedPoint?.id)
    .map((option, index) => ({
      id: option.id,
      latitude: option.coordinate.latitude,
      longitude: option.coordinate.longitude,
      title: option.title,
      subtitle: option.subtitle ?? undefined,
      type: 'bailout',
      color: ITINERARY_BAILOUT_COLOR,
      mapChar: String(index + 1),
    }));

  useEffect(() => {
    if (!visible || mapboxToken) return;
    let cancelled = false;
    getMapboxToken().then((token) => {
      if (!cancelled) setMapboxToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [mapboxToken, visible]);

  if (!visible) return null;

  return (
    <View style={styles.tripMapOverlay} testID="trip-builder-bailout-picker-overlay">
      <View style={styles.bailoutPickerCard}>
        <View style={styles.tripMapHeader}>
          <View style={styles.tripMapHeaderCopy}>
            <Text style={styles.eyebrow}>PRE-GUIDANCE TRAIL VIEW</Text>
            <Text style={styles.tripMapTitle}>Bailout Plan</Text>
            <Text style={styles.tripMapSubtitle}>
              Select a suggested road-access/rendezvous point, or tap the map to drop your own emergency point.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseButton}
            activeOpacity={0.82}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close bailout picker"
            testID="trip-builder-bailout-picker-close"
          >
            <Ionicons name="close" size={18} color={TACTICAL.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.bailoutPickerMapFrame}>
          {mapboxToken && routePoints.length > 0 ? (
            <MapRenderer
              points={routePoints}
              pinMarkers={[...routeEndpointMarkers, ...optionMarkers, ...selectedMarker]}
              routeColor={TACTICAL.amber}
              mapStyle={DEFAULT_MAP_STYLE}
              mapboxToken={mapboxToken}
              hasToken={!!mapboxToken}
              motionPriority="warm"
              interactive
              cameraMode="route_overview"
              cameraCommand={bailoutCameraCommand}
              onMapTap={(coordinate) => onDropPoint(coordinate)}
              style={styles.tripMapSurface}
            />
          ) : (
            <View style={styles.tripMapFallback}>
              <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
              <Text style={styles.tripMapFallbackTitle}>Bailout map unavailable</Text>
              <Text style={styles.tripMapFallbackText}>Route geometry or map token is unavailable. Use a suggested point below if available.</Text>
            </View>
          )}
        </View>
        <View style={styles.bailoutPickerFooter}>
          <View style={styles.bailoutPickerFooterHeader}>
            <Text style={styles.bailoutPickerTitle}>Suggested Bailout / Rendezvous Points</Text>
            {loading ? <ActivityIndicator size="small" color={TACTICAL.amber} /> : null}
          </View>
          {error ? <Text style={styles.smartResupplyErrorText}>{error}</Text> : null}
          <ScrollView style={styles.bailoutOptionList} contentContainerStyle={styles.bailoutOptionListContent}>
            {options.length === 0 && !loading ? (
              <Text style={styles.tripMapPointMeta}>No suggested points yet. Tap the map to drop an operator-selected bailout point.</Text>
            ) : (
              options.map((option) => (
                <BailoutPlanOptionCard
                  key={option.id}
                  option={option}
                  selected={selectedPoint?.id === option.id}
                  onPress={() => onSelect(option)}
                />
              ))
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.primaryButton, !selectedPoint && styles.primaryButtonDisabled]}
            activeOpacity={selectedPoint ? 0.84 : 1}
            disabled={!selectedPoint}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Use selected bailout point"
            testID="trip-builder-bailout-picker-use"
          >
            <Text style={styles.primaryButtonText}>{selectedPoint ? 'Use Bailout Point' : 'Select Bailout Point'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ExploreTripBuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId?: string }>();
  const insets = useSafeAreaInsets();
  const bottomClearance = getShellBottomClearance(insets.bottom, 8);
  const [routes, setRoutes] = useState<ExpeditionOpportunity[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [tripSetupStarted, setTripSetupStarted] = useState(false);
  const [preparedTripRoutePreview, setPreparedTripRoutePreview] = useState<PreparedTripRoutePreview | null>(null);
  const [smartResupplyPreference, setSmartResupplyPreference] = useState<SmartResupplyPreference>('fuel_only');
  const [bailoutPlanPreference, setBailoutPlanPreference] = useState<BailoutPlanPreference>('yes');
  const [campPlanPreference, setCampPlanPreference] = useState<CampPlanPreference>('skip');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [campPlanPins, setCampPlanPins] = useState<CampPlanPin[]>([]);
  const [routeImportState, setRouteImportState] = useState<RouteImportState>({ status: 'idle', message: null });
  const [smartResupplyFuelOptions, setSmartResupplyFuelOptions] = useState<SmartResupplyPoi[]>([]);
  const [smartResupplySupplyOptions, setSmartResupplySupplyOptions] = useState<SmartResupplyPoi[]>([]);
  const [routeContextSnapshot, setRouteContextSnapshot] = useState<RouteContext | null>(null);
  const [selectedSmartFuel, setSelectedSmartFuel] = useState<SmartResupplyPoi | null>(null);
  const [selectedSmartSupply, setSelectedSmartSupply] = useState<SmartResupplyPoi | null>(null);
  const [smartResupplyLoading, setSmartResupplyLoading] = useState<SmartResupplySearchKind | null>(null);
  const [smartResupplyError, setSmartResupplyError] = useState<string | null>(null);
  const [bailoutPickerVisible, setBailoutPickerVisible] = useState(false);
  const [bailoutOptions, setBailoutOptions] = useState<BailoutPlanPoint[]>([]);
  const [selectedBailoutPoint, setSelectedBailoutPoint] = useState<BailoutPlanPoint | null>(null);
  const [bailoutOptionsLoading, setBailoutOptionsLoading] = useState(false);
  const [bailoutOptionsError, setBailoutOptionsError] = useState<string | null>(null);
  const [resupplyOverrides, setResupplyOverrides] = useState<Partial<Record<ResupplyCategory, ResupplyOverride>>>({});
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planMapScope, setPlanMapScope] = useState<TripPlanMapScope | null>(null);
  const [itineraryEditMode, setItineraryEditMode] = useState(false);
  const [draftItineraryStops, setDraftItineraryStops] = useState<TripPlanStop[]>([]);
  const [draftTripItineraryEditSession, setDraftTripItineraryEditSession] = useState<TripItineraryEditSession | null>(null);
  const [savedTripItineraryEditSession, setSavedTripItineraryEditSession] = useState<TripItineraryEditSession | null>(null);
  const [itinerarySaved, setItinerarySaved] = useState(false);
  const [insertState, setInsertState] = useState<ItineraryInsertState | null>(null);
  const [itinerarySearchToken, setItinerarySearchToken] = useState(() => getMapboxTokenSync());
  const [itinerarySearchLoading, setItinerarySearchLoading] = useState(false);
  const [itinerarySearchError, setItinerarySearchError] = useState<string | null>(null);
  const [itinerarySearchSuggestions, setItinerarySearchSuggestions] = useState<RoadNavSearchSuggestion[]>([]);
  const [liveApproachRoutePoints, setLiveApproachRoutePoints] = useState<TripMapCoordinate[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTripActivating, setActiveTripActivating] = useState(false);
  const [activeTripActivationError, setActiveTripActivationError] = useState<string | null>(null);
  const roadSearchSessionTokenRef = useRef(createRoadSearchSessionToken());
  const smartResupplyFuelOptionsRef = useRef<SmartResupplyPoi[]>([]);
  const smartResupplySupplyOptionsRef = useRef<SmartResupplyPoi[]>([]);
  const smartResupplyFuelRequestRef = useRef(0);
  const smartResupplySupplyRequestRef = useRef(0);
  const smartResupplyFuelSearchSignatureRef = useRef<string | null>(null);
  const smartResupplySupplySearchSignatureRef = useRef<string | null>(null);
  const tripType = DEFAULT_TRIP_BUILDER_TRIP_TYPE;
  const groupType = DEFAULT_TRIP_BUILDER_GROUP_TYPE;
  const priorities = DEFAULT_TRIP_BUILDER_PRIORITIES;
  const tripBuilderGps = useThrottledGPS({ enabled: true, highAccuracy: true });
  const liveTripBuilderUserLocation = useMemo(
    () => tripBuilderCoordinateFromGpsPosition(tripBuilderGps.rawGPS.position ?? tripBuilderGps.position),
    [tripBuilderGps.position, tripBuilderGps.rawGPS.position],
  );
  const liveRouteContextOrigin = useMemo(
    () => routeContextOriginFromTripCoordinate(liveTripBuilderUserLocation),
    [liveTripBuilderUserLocation],
  );
  const routeContextProviderRegistry = useMemo(
    () => createMapboxRouteContextProviderRegistry(itinerarySearchToken, () => roadSearchSessionTokenRef.current),
    [itinerarySearchToken],
  );
  const commitSmartResupplyFuelOptions = useCallback((incoming: SmartResupplyPoi[]) => {
    const nextOptions = applySmartResupplyOptionRefresh(smartResupplyFuelOptionsRef.current, incoming);
    smartResupplyFuelOptionsRef.current = nextOptions;
    setSmartResupplyFuelOptions(nextOptions);
    setSelectedSmartFuel((current) => refreshSelectedSmartResupplyOption(current, nextOptions));
  }, []);
  const commitSmartResupplySupplyOptions = useCallback((incoming: SmartResupplyPoi[]) => {
    const nextOptions = applySmartResupplyOptionRefresh(smartResupplySupplyOptionsRef.current, incoming);
    smartResupplySupplyOptionsRef.current = nextOptions;
    setSmartResupplySupplyOptions(nextOptions);
    setSelectedSmartSupply((current) => refreshSelectedSmartResupplyOption(current, nextOptions));
  }, []);

  useEffect(() => {
    if (itinerarySearchToken) return;
    let cancelled = false;
    getMapboxToken().then((token) => {
      if (!cancelled && token) setItinerarySearchToken(token);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [itinerarySearchToken]);

  useEffect(() => {
    smartResupplyFuelOptionsRef.current = smartResupplyFuelOptions;
  }, [smartResupplyFuelOptions]);

  useEffect(() => {
    smartResupplySupplyOptionsRef.current = smartResupplySupplyOptions;
  }, [smartResupplySupplyOptions]);

  useEffect(() => {
    try {
      const handoff = loadTripBuilderRouteHandoff();
      const exploreContext = loadExplorePlanningRouteContext();
      const suggestedRoutes = (exploreContext?.routes?.length
        ? exploreContext.routes
        : loadOpportunitiesWithCompatibility(null).opportunities
      ) as ExpeditionOpportunity[];
      const handoffDraftItinerary = handoff?.draftItinerary ?? null;
      const handoffRoute = handoff?.route
        ? {
            ...handoff.route,
            itinerary: handoffDraftItinerary ?? handoff.route.itinerary ?? null,
            itineraryConfidence: handoffDraftItinerary?.confidence ?? handoff.route.itineraryConfidence,
          } as unknown as ExpeditionOpportunity
        : undefined;
      const routeMap = new Map<string, TripBuilderRouteInput>();
      if (handoffRoute?.id) upsertExplorePlanningRoute(routeMap, handoffRoute as unknown as TripBuilderRouteInput);
      suggestedRoutes.forEach((route) => upsertExplorePlanningRoute(routeMap, route as unknown as TripBuilderRouteInput));
      const nextRoutes = Array.from(routeMap.values());
      setRoutes(nextRoutes as unknown as ExpeditionOpportunity[]);
      const requestedRouteId = params.routeId ? String(params.routeId) : null;
      const restoredRouteId = lastTripBuilderPlanState.visible ? lastTripBuilderPlanState.selectedRouteId : null;
      setSelectedRouteId(requestedRouteId ?? restoredRouteId ?? (handoffRoute?.id ? String(handoffRoute.id) : null));
      if (
        lastTripBuilderPlanState.visible &&
        lastTripBuilderPlanState.plan &&
        (!requestedRouteId || requestedRouteId === lastTripBuilderPlanState.selectedRouteId)
      ) {
        setPlan(lastTripBuilderPlanState.plan);
        setPlanModalVisible(true);
        setTripSetupStarted(true);
        const restoredRoute =
          nextRoutes.find((route) => String(route.id) === String(lastTripBuilderPlanState.selectedRouteId)) ??
          handoffRoute ??
          null;
        setPreparedTripRoutePreview(buildPreparedTripRoutePreview(restoredRoute as ExpeditionOpportunity | null));
        setItinerarySaved(lastTripBuilderPlanState.itinerarySaved);
        setSavedTripItineraryEditSession(lastTripBuilderPlanState.itineraryEditSession);
      } else {
        setTripSetupStarted(false);
        setPreparedTripRoutePreview(null);
        setSavedTripItineraryEditSession(null);
      }
      setError(null);
    } catch {
      setError('Trip Builder could not load route options.');
    } finally {
      setLoading(false);
    }
  }, [params.routeId]);

  const selectedRoute = useMemo(
    () => routes.find((route) => String(route.id) === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );
  const selectedRouteDisplayName = useMemo(
    () => tripBuilderRouteDisplayName(selectedRoute),
    [selectedRoute],
  );
  const selectedRouteContextSupplySelection = useMemo(
    () => routeContextSupplySelectionFromSmartOptions(selectedSmartFuel, selectedSmartSupply),
    [selectedSmartFuel, selectedSmartSupply],
  );

  useEffect(() => {
    if (!selectedRoute) {
      setRouteContextSnapshot(null);
      return;
    }
    const trail = selectedRoute as unknown as TripBuilderRouteInput & { id: string };
    const selectedSupplyMode = routeContextSupplyModeForTripBuilder(smartResupplyPreference);
    const cachedRouteContext = routeContextOrchestrator.getContext({
      trailId: String(selectedRoute.id),
      origin: liveRouteContextOrigin,
      selectedSupplyMode,
      selectedRefuelCandidateId: selectedRouteContextSupplySelection.selectedRefuelCandidateId,
      selectedResupplyCandidateId: selectedRouteContextSupplySelection.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: selectedRouteContextSupplySelection.selectedSupplyCandidateIds,
      featureFlags: TRIP_BUILDER_ROUTE_CONTEXT_FEATURE_FLAGS,
      providerRegistry: routeContextProviderRegistry,
    });
    setRouteContextSnapshot(cachedRouteContext);
    let cancelled = false;
    void routeContextOrchestrator.prefetchForTrailSelection({
      trail,
      origin: liveRouteContextOrigin,
      selectedSupplyMode,
      selectedRefuelCandidateId: selectedRouteContextSupplySelection.selectedRefuelCandidateId,
      selectedResupplyCandidateId: selectedRouteContextSupplySelection.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: selectedRouteContextSupplySelection.selectedSupplyCandidateIds,
      featureFlags: TRIP_BUILDER_ROUTE_CONTEXT_FEATURE_FLAGS,
      providerRegistry: routeContextProviderRegistry,
    })
      .then((context) => {
        if (!cancelled) setRouteContextSnapshot(context);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [liveRouteContextOrigin, routeContextProviderRegistry, selectedRoute, selectedRouteContextSupplySelection, smartResupplyPreference]);

  const selectedRouteStartCoordinate = useMemo(() => {
    if (!selectedRoute) return null;
    const routeContextTrailhead = routeContextTrailheadCoordinate(routeContextSnapshot);
    if (routeContextTrailhead) return routeContextTrailhead;
    if (
      tripSetupStarted &&
      preparedRoutePreviewMatches(preparedTripRoutePreview, selectedRoute) &&
      preparedTripRoutePreview.start
    ) {
      return preparedTripRoutePreview.start;
    }
    const routePoints = routePointsForTripMap(selectedRoute as unknown as TripBuilderRouteInput);
    return routePoints[0] ??
      routeStartCoordinateForTrip(selectedRoute as unknown as TripBuilderRouteInput) ??
      null;
  }, [preparedTripRoutePreview, routeContextSnapshot, selectedRoute, tripSetupStarted]);
  const selectedTrailheadResupplyAnchorCoordinate = selectedRouteStartCoordinate;
  const selectedPreTrailSupplyAnchorCoordinate = selectedSmartFuel?.coordinate ?? selectedTrailheadResupplyAnchorCoordinate;

  const selectedRouteEndCoordinate = useMemo(() => {
    if (!selectedRoute) return null;
    if (
      tripSetupStarted &&
      preparedRoutePreviewMatches(preparedTripRoutePreview, selectedRoute) &&
      preparedTripRoutePreview.end
    ) {
      return preparedTripRoutePreview.end;
    }
    const routePoints = routePointsForTripMap(selectedRoute as unknown as TripBuilderRouteInput);
    return routePoints.length > 1
      ? routePoints[routePoints.length - 1]
      : routeEndCoordinateForTrip(selectedRoute as unknown as TripBuilderRouteInput);
  }, [preparedTripRoutePreview, selectedRoute, tripSetupStarted]);

  const selectedPreparedRoutePoints = useMemo(() => {
    const contextRoutePoints = routeContextRoutePoints(routeContextSnapshot);
    if (contextRoutePoints.length >= 2) return contextRoutePoints;
    if (
      selectedRoute &&
      tripSetupStarted &&
      preparedRoutePreviewMatches(preparedTripRoutePreview, selectedRoute)
    ) {
      return preparedTripRoutePreview.routePoints;
    }
    return selectedRoute ? routePointsForTripMap(selectedRoute as unknown as TripBuilderRouteInput) : [];
  }, [preparedTripRoutePreview, routeContextSnapshot, selectedRoute, tripSetupStarted]);

  useEffect(() => {
    if (
      !tripSetupStarted ||
      !itinerarySearchToken ||
      !liveTripBuilderUserLocation ||
      !selectedRouteStartCoordinate
    ) {
      setLiveApproachRoutePoints([]);
      return;
    }

    const origin = {
      lat: liveTripBuilderUserLocation.latitude,
      lng: liveTripBuilderUserLocation.longitude,
    };
    const trailhead = {
      lat: selectedRouteStartCoordinate.latitude,
      lng: selectedRouteStartCoordinate.longitude,
    };
    const alreadyAtTrailhead = tripMapCoordinateDistanceMiles(
      { latitude: origin.lat, longitude: origin.lng },
      selectedRouteStartCoordinate,
    ) <= 0.05;

    if (alreadyAtTrailhead) {
      setLiveApproachRoutePoints([
        { latitude: origin.lat, longitude: origin.lng },
        selectedRouteStartCoordinate,
      ]);
      return;
    }

    let cancelled = false;
    void fetchRoadRoute({
      accessToken: itinerarySearchToken,
      origin,
      destination: {
        id: `${selectedRouteId ?? 'selected-route'}-trailhead-approach`,
        title: `${selectedRouteDisplayName ?? 'Selected route'} trailhead`,
        subtitle: 'Trip Builder live approach to trailhead start.',
        coordinate: trailhead,
        sourceType: 'manual_selection',
      },
    })
      .then((roadRoute) => {
        if (cancelled) return;
        const routePoints = roadRoute.geometry
          .map((point) => ({ latitude: point.lat, longitude: point.lng }))
          .filter(isValidMapCoordinate);
        setLiveApproachRoutePoints(routePoints.length >= 2 ? routePoints : []);
      })
      .catch(() => {
        if (!cancelled) setLiveApproachRoutePoints([]);
      });

    return () => {
      cancelled = true;
    };
  }, [
    itinerarySearchToken,
    liveTripBuilderUserLocation,
    selectedRouteDisplayName,
    selectedRouteId,
    selectedRouteStartCoordinate,
    tripSetupStarted,
  ]);

  const readinessReference = useMemo(() => {
    if (!selectedRoute) return null;
    try {
      const assessment = buildExploreRouteReadinessAssessment(selectedRoute, { hasVehicle: false });
      const summary = getExploreRouteReadinessSummary(assessment, selectedRoute, { hasVehicle: false });
      return {
        status: assessment.status,
        score: assessment.overallScore,
        summary,
        topConcern: summary.concern,
        source: 'explore_route_readiness',
        updatedAt: assessment.updatedAt,
      };
    } catch {
      return null;
    }
  }, [selectedRoute]);

  const vehicleProfile = useMemo(() => {
    const profile = buildProfileFromSpecs();
    if (!profile) return null;
    const supportReadiness = deriveLoadoutSupport(profile.vehicleId);
    return {
      id: profile.vehicleId,
      label: profile.vehicleName,
      vehicleType: profile.vehicleType,
      rangeMiles: profile.fuel_range_miles,
      rangeSource: profile.fuel_tank_capacity_gal > 0 ? 'manual' : 'unknown',
      fuelTankCapacityGal: profile.fuel_tank_capacity_gal,
      avgMpg: profile.avg_mpg,
      waterCapacityGal: profile.water_capacity_gal,
      currentWaterGallons: profile.water_capacity_gal,
      waterSource: profile.water_capacity_gal > 0 ? 'manual' : 'unknown',
      clearanceInches: null,
      tireSizeInches: profile.tireSizeInches,
      confidence: 'medium' as const,
      source: 'fleet_profile',
      supportReadiness,
    };
  }, []);

  const selectedPreTrailOptionsForDraft = useMemo(() => {
    const fuel = selectedSmartFuel
      ? [selectedPreTrailOptionFromSmartResupply(selectedSmartFuel, 'fuel')]
      : undefined;
    const grocerySource = smartResupplyPreference === 'fuel_supplies'
      ? selectedSmartSupply ?? (selectedSmartFuel?.groceries ? selectedSmartFuel : null)
      : null;
    const grocery = grocerySource
      ? [selectedPreTrailOptionFromSmartResupply(grocerySource, 'grocery')]
      : undefined;
    return {
      ...(fuel ? { fuel } : {}),
      ...(grocery ? { grocery } : {}),
    };
  }, [selectedSmartFuel, selectedSmartSupply, smartResupplyPreference]);

  const preTrailStopCandidatesForDraft = useMemo<PreTrailStopCandidateInput | null>(() => {
    const fuel = smartResupplyFuelOptions.map((option) => preTrailCandidateFromSmartResupply(option, 'fuel'));
    const grocery = smartResupplySupplyOptions.map((option) => preTrailCandidateFromSmartResupply(option, 'grocery'));
    if (fuel.length === 0 && grocery.length === 0) return null;
    return {
      ...(fuel.length > 0 ? { fuel } : {}),
      ...(grocery.length > 0 ? { grocery } : {}),
    };
  }, [smartResupplyFuelOptions, smartResupplySupplyOptions]);

  const preTrailProviderAvailableForDraft = Boolean(
    tripSetupStarted &&
      smartResupplyPreference !== 'no' &&
      selectedTrailheadResupplyAnchorCoordinate &&
      smartResupplyLoading == null &&
      (
        preTrailStopCandidatesForDraft != null ||
        (
          itinerarySearchToken &&
          (
            smartResupplyError?.startsWith('No fuel options') ||
            smartResupplyError?.startsWith('No grocery')
          )
        )
      ),
  );

  const preTrailDraftResolution = useMemo(
    () => resolvePreTrailStops({
      trailheadStart: selectedTrailheadResupplyAnchorCoordinate
        ? {
            id: `${selectedRouteId ?? 'selected-route'}-trip-builder-trailhead-anchor`,
            type: 'trailhead_start' as const,
            phase: 'trailhead' as const,
            title: `${selectedRouteDisplayName ?? 'Selected route'} trailhead`,
            coordinate: selectedTrailheadResupplyAnchorCoordinate,
            source: { label: 'trip_builder_selected_route_start', state: 'cached' as const },
            confidence: 'medium' as const,
          }
        : null,
      approachRoute: liveApproachRoutePoints.length >= 2 ? liveApproachRoutePoints : selectedPreparedRoutePoints,
      candidates: preTrailStopCandidatesForDraft,
      providerAvailable: preTrailProviderAvailableForDraft,
      selectedPreTrailOptions: selectedPreTrailOptionsForDraft,
      userPreferences: {
        smartResupplyPreference,
      },
      vehicleProfile,
      routeId: selectedRouteId ?? 'selected-route',
    }),
    [
      liveApproachRoutePoints,
      preTrailProviderAvailableForDraft,
      preTrailStopCandidatesForDraft,
      selectedPreTrailOptionsForDraft,
      selectedPreparedRoutePoints,
      selectedRouteDisplayName,
      selectedRouteId,
      selectedTrailheadResupplyAnchorCoordinate,
      smartResupplyPreference,
      vehicleProfile,
    ],
  );
  const preTrailDraftStatusMessage = useMemo(() => {
    if (smartResupplyPreference === 'no') return null;
    const missingAnchor = preTrailDraftResolution.bucketSummaries.some((summary) => summary.status === 'missing_anchor');
    if (missingAnchor) return 'Trailhead start is unavailable, so ECS cannot rank pre-trail fuel or supply stops.';
    const providerUnavailable = preTrailDraftResolution.bucketSummaries.some((summary) => summary.status === 'provider_unavailable');
    if (providerUnavailable && !preTrailStopCandidatesForDraft) {
      return 'Live pre-trail POI lookup is unavailable; itinerary continuity is preserved with manual verification.';
    }
    const noResults = preTrailDraftResolution.bucketSummaries.some((summary) => summary.status === 'no_results');
    if (noResults) return 'No usable pre-trail POI candidates were returned. Verify fuel and supplies manually.';
    return null;
  }, [preTrailDraftResolution, preTrailStopCandidatesForDraft, smartResupplyPreference]);

  const selectedTripItinerary = useMemo<TripItinerary | null>(() => {
    if (!selectedRoute) return null;
    const routeRecord = selectedRoute as unknown as { itinerary?: TripItinerary | null };
    const handoffItinerary = routeRecord.itinerary ?? null;
    const selectedSupplyMode = routeContextSupplyModeForTripBuilder(smartResupplyPreference);
    const routeContextItineraryInput = routeContextSnapshot
      ? routeContextToTripBuilderItineraryContext(routeContextSnapshot, selectedSupplyMode)
      : null;
    const liveItinerarySuggestedRoute = buildLiveItinerarySuggestedRoute({
      route: selectedRoute as unknown as SuggestedRoute,
      liveApproachRoutePoints,
      routeContext: routeContextItineraryInput,
    });

    try {
      return buildTripItineraryFromSuggestedRoute({
        suggestedRoute: liveItinerarySuggestedRoute,
        userLocation: liveTripBuilderUserLocation ?? handoffItinerary?.userStart ?? null,
        userPreferences: {
          smartResupplyPreference,
          priorities,
        },
        selectedPreTrailOptions: selectedPreTrailOptionsForDraft,
        preTrailStopCandidates: preTrailStopCandidatesForDraft,
        preTrailProviderAvailable: preTrailProviderAvailableForDraft,
        routeContext: routeContextItineraryInput,
        vehicleProfile,
      });
    } catch {
      return handoffItinerary;
    }
  }, [
    priorities,
    liveApproachRoutePoints,
    liveTripBuilderUserLocation,
    preTrailProviderAvailableForDraft,
    preTrailStopCandidatesForDraft,
    routeContextSnapshot,
    selectedPreTrailOptionsForDraft,
    selectedRoute,
    smartResupplyPreference,
    vehicleProfile,
  ]);

  const activeTripItineraryEditSession = itineraryEditMode
    ? draftTripItineraryEditSession
    : savedTripItineraryEditSession;
  const editableTripItinerary = useMemo(
    () => applyTripItineraryEditSession(selectedTripItinerary, activeTripItineraryEditSession),
    [activeTripItineraryEditSession, selectedTripItinerary],
  );

  const itinerarySummary = useMemo(
    () => getTripItinerarySummary(editableTripItinerary),
    [editableTripItinerary],
  );
  const itineraryReview = useMemo(
    () => getTripItineraryReview(editableTripItinerary),
    [editableTripItinerary],
  );
  const tripConfidenceSummary = useMemo(
    () => getTripConfidenceSummary({
      itinerary: editableTripItinerary,
      selectedRoute: selectedRoute as unknown as TripBuilderRouteInput | null,
      vehicleProfile,
      plan,
      environment: {
        weather: { status: 'unknown', label: 'Trip Builder weather unavailable' },
        daylight: { status: 'unknown', label: 'Trip Builder daylight unavailable' },
        remoteness: {
          status: selectedRoute?.remotenessScore != null ? 'available' : 'unknown',
          score: selectedRoute?.remotenessScore ?? null,
        },
      },
      telemetry: { status: 'unavailable', label: 'Telemetry unavailable for Trip Builder MVP' },
    }),
    [editableTripItinerary, plan, selectedRoute, vehicleProfile],
  );

  const tripPlanMapAvailability = useMemo(() => {
    if (!selectedRoute || !plan) {
      return {
        itinerary: false,
        camps: false,
        exits: false,
        resupply: false,
      };
    }
    const route = selectedRoute as unknown as TripBuilderRouteInput;
    return {
      itinerary: getTripPlanMapReadyCount(route, plan, 'itinerary') > 0,
      camps: getTripPlanMapReadyCount(route, plan, 'camps') > 0,
      exits: getTripPlanMapReadyCount(route, plan, 'exits') > 0,
      resupply: getTripPlanMapReadyCount(route, plan, 'resupply') > 0,
    };
  }, [plan, selectedRoute]);

  const itinerarySearchProximity = useMemo(() => {
    const firstStop = draftItineraryStops.find((stop) => isValidMapCoordinate(stop.coordinate))?.coordinate ??
      plan?.suggestedStops.find((stop) => isValidMapCoordinate(stop.coordinate))?.coordinate ??
      null;
    if (firstStop) return { lat: firstStop.latitude, lng: firstStop.longitude };
    if (!selectedRoute) return null;
    const firstRoutePoint = routePointsForTripMap(selectedRoute as unknown as TripBuilderRouteInput)[0];
    return firstRoutePoint ? { lat: firstRoutePoint.latitude, lng: firstRoutePoint.longitude } : null;
  }, [draftItineraryStops, plan, selectedRoute]);

  const smartResupplyReady = useMemo(() => {
    if (smartResupplyPreference === 'no') return true;
    if (!selectedSmartFuel) return false;
    if (smartResupplyPreference === 'fuel_only') return true;
    return selectedSmartFuel.groceries || !!selectedSmartSupply;
  }, [selectedSmartFuel, selectedSmartSupply, smartResupplyPreference]);
  const routeContextFuelOptions = useMemo(
    () => smartResupplyOptionsFromRouteContext(routeContextSnapshot, 'fuel', selectedTrailheadResupplyAnchorCoordinate, liveApproachRoutePoints),
    [liveApproachRoutePoints, routeContextSnapshot, selectedTrailheadResupplyAnchorCoordinate],
  );
  const routeContextSupplyOptions = useMemo(
    () => smartResupplyOptionsFromRouteContext(routeContextSnapshot, 'food_supplies', selectedTrailheadResupplyAnchorCoordinate, liveApproachRoutePoints, selectedPreTrailSupplyAnchorCoordinate),
    [liveApproachRoutePoints, routeContextSnapshot, selectedPreTrailSupplyAnchorCoordinate, selectedTrailheadResupplyAnchorCoordinate],
  );
  const bailoutPlanReady = bailoutPlanPreference === 'no' || !!selectedBailoutPoint;
  const campPlanReady = campPlanPreference === 'skip' || campPlanPins.length > 0;

  useEffect(() => {
    if (!itineraryEditMode || !insertState || itinerarySearchToken) return;
    let cancelled = false;
    getMapboxToken().then((token) => {
      if (!cancelled) setItinerarySearchToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [insertState, itineraryEditMode, itinerarySearchToken]);

  useEffect(() => {
    if (!planModalVisible || !selectedRoute) return;
    setRouteContextSnapshot(routeContextOrchestrator.getContext({
      trailId: String(selectedRoute.id),
      trail: selectedRoute as unknown as TripBuilderRouteInput & { id: string },
      origin: liveRouteContextOrigin,
      selectedSupplyMode: routeContextSupplyModeForTripBuilder(smartResupplyPreference),
      selectedRefuelCandidateId: selectedRouteContextSupplySelection.selectedRefuelCandidateId,
      selectedResupplyCandidateId: selectedRouteContextSupplySelection.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: selectedRouteContextSupplySelection.selectedSupplyCandidateIds,
      featureFlags: TRIP_BUILDER_ROUTE_CONTEXT_FEATURE_FLAGS,
      providerRegistry: routeContextProviderRegistry,
    }));
  }, [liveRouteContextOrigin, planModalVisible, routeContextProviderRegistry, selectedRoute, selectedRouteContextSupplySelection, smartResupplyPreference]);

  useEffect(() => {
    if (!itineraryEditMode || !insertState) return;
    const query = insertState.query.trim();
    if (query.length < 2) {
      setItinerarySearchSuggestions([]);
      setItinerarySearchLoading(false);
      setItinerarySearchError(null);
      return;
    }
    if (!itinerarySearchToken) {
      setItinerarySearchSuggestions([]);
      setItinerarySearchLoading(false);
      setItinerarySearchError('Map search unavailable until Mapbox token is ready.');
      return;
    }

    let cancelled = false;
    setItinerarySearchLoading(true);
    setItinerarySearchError(null);
    const timer = setTimeout(() => {
      void searchRoadDestinations({
        accessToken: itinerarySearchToken,
        query,
        sessionToken: roadSearchSessionTokenRef.current,
        proximity: itinerarySearchProximity,
        limit: 6,
      })
        .then((suggestions) => {
          if (cancelled) return;
          setItinerarySearchSuggestions(suggestions);
          setItinerarySearchError(suggestions.length > 0 ? null : 'No matching locations found.');
        })
        .catch((searchError: unknown) => {
          if (cancelled) return;
          setItinerarySearchSuggestions([]);
          setItinerarySearchError(searchError instanceof Error ? searchError.message : 'Location search unavailable.');
        })
        .finally(() => {
          if (!cancelled) setItinerarySearchLoading(false);
        });
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [insertState, itineraryEditMode, itinerarySearchProximity, itinerarySearchToken]);

  useEffect(() => {
    setSelectedSmartFuel(null);
    setSelectedSmartSupply(null);
    smartResupplyFuelRequestRef.current += 1;
    smartResupplySupplyRequestRef.current += 1;
    smartResupplyFuelSearchSignatureRef.current = null;
    smartResupplySupplySearchSignatureRef.current = null;
    smartResupplyFuelOptionsRef.current = [];
    smartResupplySupplyOptionsRef.current = [];
    setSmartResupplyFuelOptions([]);
    setSmartResupplySupplyOptions([]);
    setSmartResupplyError(null);
  }, [selectedRouteId, smartResupplyPreference]);

  useEffect(() => {
    if (!tripSetupStarted) {
      smartResupplyFuelRequestRef.current += 1;
      smartResupplyFuelSearchSignatureRef.current = null;
      smartResupplyFuelOptionsRef.current = [];
      setSmartResupplyFuelOptions([]);
      setSmartResupplyLoading((current) => current === 'fuel' ? null : current);
      setSmartResupplyError(null);
      return;
    }
    if (smartResupplyPreference === 'no') {
      smartResupplyFuelRequestRef.current += 1;
      smartResupplyFuelSearchSignatureRef.current = null;
      smartResupplyFuelOptionsRef.current = [];
      setSmartResupplyFuelOptions([]);
      setSmartResupplyLoading(null);
      setSmartResupplyError(null);
      return;
    }
    if (!selectedTrailheadResupplyAnchorCoordinate) {
      smartResupplyFuelRequestRef.current += 1;
      smartResupplyFuelSearchSignatureRef.current = null;
      smartResupplyFuelOptionsRef.current = [];
      setSmartResupplyFuelOptions([]);
      setSmartResupplyLoading((current) => current === 'fuel' ? null : current);
      setSmartResupplyError('Route start is unavailable, so ECS cannot locate pre-route fuel options.');
      return;
    }

    const searchSignature = smartResupplySearchSignature(selectedTrailheadResupplyAnchorCoordinate, 'fuel', liveApproachRoutePoints);
    const routeContextMergedOptions = mergeSmartResupplyOptions(routeContextFuelOptions, [], smartResupplyFuelOptionsRef.current);
    if (routeContextFuelOptions.length > 0 || smartResupplyFuelOptionsRef.current.length > 0) {
      commitSmartResupplyFuelOptions(routeContextMergedOptions);
    }
    if (smartResupplyFuelSearchSignatureRef.current === searchSignature && smartResupplyFuelOptionsRef.current.length > 0) {
      return;
    }
    smartResupplyFuelSearchSignatureRef.current = searchSignature;
    let cancelled = false;
    const requestId = ++smartResupplyFuelRequestRef.current;
    setSmartResupplyLoading((current) => {
      if (current === 'supplies') return current;
      return 'fuel';
    });
    setSmartResupplyError(null);
    void (async () => {
      try {
        const token = itinerarySearchToken ?? await getMapboxToken();
        if (!token) {
          if (routeContextFuelOptions.length > 0) return;
          throw new Error('Map search unavailable until Mapbox token is ready.');
        }
        if (!itinerarySearchToken) setItinerarySearchToken(token);
        const options = await loadSmartResupplyOptions({
          accessToken: token,
          sessionToken: roadSearchSessionTokenRef.current,
          query: SMART_RESUPPLY_FUEL_QUERY,
          category: 'fuel',
          routeStart: selectedTrailheadResupplyAnchorCoordinate,
          approachRoute: liveApproachRoutePoints,
          origin: liveTripBuilderUserLocation,
        });
        if (cancelled || requestId !== smartResupplyFuelRequestRef.current) return;
        const mergedOptions = mergeSmartResupplyOptions(routeContextFuelOptions, options, smartResupplyFuelOptionsRef.current);
        commitSmartResupplyFuelOptions(mergedOptions);
        if (mergedOptions.length === 0) {
          setSmartResupplyError('No fuel options were found near the route start. Try selecting No, or verify manually.');
        }
      } catch (searchError) {
        if (!cancelled && requestId === smartResupplyFuelRequestRef.current) {
          const fallbackOptions = mergeSmartResupplyOptions(routeContextFuelOptions, [], smartResupplyFuelOptionsRef.current);
          commitSmartResupplyFuelOptions(fallbackOptions);
          setSmartResupplyError(searchError instanceof Error ? searchError.message : 'Fuel search unavailable.');
        }
      } finally {
        if (!cancelled && requestId === smartResupplyFuelRequestRef.current) {
          setSmartResupplyLoading((current) => current === 'fuel' ? null : current);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    commitSmartResupplyFuelOptions,
    itinerarySearchToken,
    routeContextFuelOptions,
    liveApproachRoutePoints,
    liveTripBuilderUserLocation,
    selectedTrailheadResupplyAnchorCoordinate,
    smartResupplyPreference,
    tripSetupStarted,
  ]);

  useEffect(() => {
    if (
      !tripSetupStarted ||
      smartResupplyPreference !== 'fuel_supplies' ||
      !selectedSmartFuel ||
      selectedSmartFuel.groceries
    ) {
      smartResupplySupplyRequestRef.current += 1;
      smartResupplySupplySearchSignatureRef.current = null;
      smartResupplySupplyOptionsRef.current = [];
      setSmartResupplySupplyOptions([]);
      setSmartResupplyLoading((current) => current === 'supplies' ? null : current);
      return;
    }
    if (!selectedPreTrailSupplyAnchorCoordinate) {
      smartResupplySupplyRequestRef.current += 1;
      smartResupplySupplySearchSignatureRef.current = null;
      setSmartResupplyLoading((current) => current === 'supplies' ? null : current);
      return;
    }

    const searchSignature = smartResupplySearchSignature(
      selectedPreTrailSupplyAnchorCoordinate,
      'supplies',
      liveApproachRoutePoints,
      smartResupplyOptionStableKey(selectedSmartFuel),
    );
    const routeContextMergedOptions = mergeSmartResupplyOptions(routeContextSupplyOptions, [], smartResupplySupplyOptionsRef.current);
    if (routeContextSupplyOptions.length > 0 || smartResupplySupplyOptionsRef.current.length > 0) {
      commitSmartResupplySupplyOptions(routeContextMergedOptions);
    }
    if (smartResupplySupplySearchSignatureRef.current === searchSignature && smartResupplySupplyOptionsRef.current.length > 0) {
      return;
    }
    smartResupplySupplySearchSignatureRef.current = searchSignature;
    let cancelled = false;
    const requestId = ++smartResupplySupplyRequestRef.current;
    setSmartResupplyLoading((current) => {
      if (current === 'fuel') return current;
      return 'supplies';
    });
    setSmartResupplyError(null);
    void (async () => {
      try {
        const token = itinerarySearchToken ?? await getMapboxToken();
        if (!token) {
          if (routeContextSupplyOptions.length > 0) return;
          throw new Error('Map search unavailable until Mapbox token is ready.');
        }
        if (!itinerarySearchToken) setItinerarySearchToken(token);
        const options = await loadSmartResupplyOptions({
          accessToken: token,
          sessionToken: roadSearchSessionTokenRef.current,
          query: SMART_RESUPPLY_SUPPLY_QUERY,
          category: 'food_supplies',
          routeStart: selectedTrailheadResupplyAnchorCoordinate ?? selectedPreTrailSupplyAnchorCoordinate,
          approachRoute: liveApproachRoutePoints,
          origin: liveTripBuilderUserLocation,
          fallbackAnchor: selectedPreTrailSupplyAnchorCoordinate,
        });
        if (cancelled || requestId !== smartResupplySupplyRequestRef.current) return;
        const mergedOptions = mergeSmartResupplyOptions(routeContextSupplyOptions, options, smartResupplySupplyOptionsRef.current);
        commitSmartResupplySupplyOptions(mergedOptions);
        if (mergedOptions.length === 0) {
          setSmartResupplyError('No grocery or supply options were found near the route start. Verify manually before departure.');
        }
      } catch (searchError) {
        if (!cancelled && requestId === smartResupplySupplyRequestRef.current) {
          const fallbackOptions = mergeSmartResupplyOptions(routeContextSupplyOptions, [], smartResupplySupplyOptionsRef.current);
          commitSmartResupplySupplyOptions(fallbackOptions);
          setSmartResupplyError(searchError instanceof Error ? searchError.message : 'Supply search unavailable.');
        }
      } finally {
        if (!cancelled && requestId === smartResupplySupplyRequestRef.current) {
          setSmartResupplyLoading((current) => current === 'supplies' ? null : current);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    commitSmartResupplySupplyOptions,
    itinerarySearchToken,
    routeContextSupplyOptions,
    liveApproachRoutePoints,
    liveTripBuilderUserLocation,
    selectedPreTrailSupplyAnchorCoordinate,
    selectedTrailheadResupplyAnchorCoordinate,
    selectedSmartFuel,
    smartResupplyPreference,
    tripSetupStarted,
  ]);

  useEffect(() => {
    setSelectedBailoutPoint(null);
    setBailoutOptions([]);
    setBailoutOptionsLoading(false);
    setBailoutOptionsError(null);
  }, [selectedRouteId]);

  useEffect(() => {
    if (!tripSetupStarted) {
      setBailoutPickerVisible(false);
      setBailoutOptionsLoading(false);
      setBailoutOptionsError(null);
      return;
    }
    if (bailoutPlanPreference === 'no') {
      setBailoutPickerVisible(false);
      setSelectedBailoutPoint(null);
      setBailoutOptions([]);
      setBailoutOptionsLoading(false);
      setBailoutOptionsError(null);
      return;
    }
    const routePoints = selectedPreparedRoutePoints.length >= 2
      ? selectedPreparedRoutePoints
      : [selectedRouteStartCoordinate, selectedRouteEndCoordinate].filter(isValidMapCoordinate);
    if (routePoints.length < 2) {
      setBailoutOptions([]);
      setBailoutOptionsLoading(false);
      setBailoutOptionsError('Route geometry is unavailable, so ECS cannot suggest bailout points. Tap the map if available or select No.');
      return;
    }

    let cancelled = false;
    setBailoutOptionsLoading(true);
    setBailoutOptionsError(null);
    void (async () => {
      try {
        const token = itinerarySearchToken ?? await getMapboxToken();
        if (!token) throw new Error('Map search unavailable until Mapbox token is ready.');
        if (!itinerarySearchToken) setItinerarySearchToken(token);
        const options = await loadBailoutPlanOptions({
          accessToken: token,
          sessionToken: roadSearchSessionTokenRef.current,
          routePoints,
          routeContextOptions: bailoutPlanPointsFromRouteContext(routeContextSnapshot),
        });
        if (!cancelled) {
          setBailoutOptions(options);
          setBailoutOptionsError(
            options.length === 0
              ? 'No usable bailout candidates were found near this route. Use Map Pick or select No.'
              : null,
          );
        }
      } catch (searchError) {
        if (!cancelled) {
          setBailoutOptions([]);
          setBailoutOptionsError(searchError instanceof Error ? searchError.message : 'Bailout search unavailable.');
        }
      } finally {
        if (!cancelled) setBailoutOptionsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bailoutPlanPreference,
    itinerarySearchToken,
    selectedPreparedRoutePoints,
    routeContextSnapshot,
    selectedRouteEndCoordinate,
    selectedRouteId,
    selectedRouteStartCoordinate,
    tripSetupStarted,
  ]);

  const handleSmartResupplyPreference = (preference: SmartResupplyPreference) => {
    hapticMicro();
    setSmartResupplyPreference(preference);
    setSelectedSmartFuel(null);
    setSelectedSmartSupply(null);
    setSmartResupplyError(null);
  };

  const handleSelectSmartFuel = (option: SmartResupplyPoi) => {
    hapticMicro();
    setSelectedSmartFuel(option);
    setSelectedSmartSupply(null);
    setSmartResupplyError(null);
  };

  const handleSelectSmartSupply = (option: SmartResupplyPoi) => {
    hapticMicro();
    setSelectedSmartSupply(option);
    setSmartResupplyError(null);
  };

  const handleBailoutPlanPreference = (preference: BailoutPlanPreference) => {
    hapticMicro();
    setBailoutPlanPreference(preference);
    setBailoutOptionsError(null);
    if (preference === 'yes') {
      setBailoutPickerVisible(true);
    } else {
      setSelectedBailoutPoint(null);
      setBailoutPickerVisible(false);
    }
  };

  const handleSelectBailoutPoint = (point: BailoutPlanPoint) => {
    hapticMicro();
    setSelectedBailoutPoint(point);
    setBailoutOptionsError(null);
  };

  const handleDropBailoutPoint = (coordinate: TripMapCoordinate) => {
    if (!isValidMapCoordinate(coordinate)) return;
    hapticMicro();
    const routeStart = selectedRouteStartCoordinate;
    const point: BailoutPlanPoint = {
      id: `operator-bailout-${Date.now().toString(36)}`,
      title: 'Operator dropped bailout point',
      subtitle: 'Manual emergency bailout or rendezvous point. Verify legal access and drivability.',
      coordinate,
      source: 'operator_drop',
      distanceFromRouteStartMiles: routeStart ? Math.round(tripMapCoordinateDistanceMiles(routeStart, coordinate) * 10) / 10 : null,
    };
    setSelectedBailoutPoint(point);
    setBailoutOptions((current) => [point, ...current.filter((item) => item.source !== 'operator_drop')].slice(0, BAILOUT_OPTION_LIMIT));
    setBailoutOptionsError(null);
  };

  const cycleResupplyOverride = (category: ResupplyCategory) => {
    if (!RESUPPLY_OVERRIDE_CATEGORIES.has(category)) return;
    hapticMicro();
    setResupplyOverrides((current) => {
      const currentValue = current[category] ?? 'unknown';
      const next: ResupplyOverride = currentValue === 'unknown'
        ? 'provided'
        : currentValue === 'provided'
          ? 'not_required'
          : 'unknown';
      return { ...current, [category]: next };
    });
  };

  const selectPlanningRoute = (routeId: string) => {
    hapticMicro();
    const routeForContext = routes.find((route) => String(route.id) === routeId) ?? null;
    if (routeForContext) {
      void routeContextOrchestrator.prefetchForTrailSelection({
        trail: routeForContext as unknown as TripBuilderRouteInput & { id: string },
        origin: liveRouteContextOrigin,
        selectedSupplyMode: routeContextSupplyModeForTripBuilder(smartResupplyPreference),
        featureFlags: TRIP_BUILDER_ROUTE_CONTEXT_FEATURE_FLAGS,
        providerRegistry: routeContextProviderRegistry,
      }).catch(() => {});
    }
    setSelectedRouteId(routeId);
    setTripSetupStarted(false);
    setPreparedTripRoutePreview(null);
    setPlan(null);
    setPlanMapScope(null);
    setPlanModalVisible(false);
    setDraftTripItineraryEditSession(null);
    setSavedTripItineraryEditSession(null);
    setRouteImportState({ status: 'idle', message: null });
    setSelectedSmartFuel(null);
    setSelectedSmartSupply(null);
    setSmartResupplyError(null);
    setSelectedBailoutPoint(null);
    setBailoutPickerVisible(false);
    setCampPlanPreference('skip');
    setCampPickerVisible(false);
    setCampPlanPins([]);
    setResupplyOverrides({});
    lastTripBuilderPlanState = {
      selectedRouteId: routeId,
      plan: null,
      visible: false,
      itinerarySaved: false,
      itineraryEditSession: null,
    };
  };

  const handleImportRouteFile = async () => {
    if (routeImportState.status === 'loading') return;
    hapticMicro();
    setRouteImportState({ status: 'loading', message: 'Opening route file picker...' });
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/gpx+xml',
          'application/vnd.google-earth.kml+xml',
          'text/xml',
          'application/xml',
          'application/json',
          'application/geo+json',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setRouteImportState({ status: 'idle', message: null });
        return;
      }

      const asset = result.assets[0];
      const fileName = asset.name || 'imported-route.gpx';
      const content = await fsReadFileFromPickerUri(asset.uri);
      if (!content) {
        throw new Error('Could not read selected route file.');
      }

      const importedRoute = buildTripBuilderImportedRoute(fileName, content);
      void routeContextOrchestrator.prefetchForTrailSelection({
        trail: importedRoute as unknown as TripBuilderRouteInput & { id: string },
        origin: liveRouteContextOrigin,
        selectedSupplyMode: routeContextSupplyModeForTripBuilder(smartResupplyPreference),
        featureFlags: TRIP_BUILDER_ROUTE_CONTEXT_FEATURE_FLAGS,
        providerRegistry: routeContextProviderRegistry,
      }).catch(() => {});
      setRoutes((current) => {
        const routeMap = new Map<string, TripBuilderRouteInput>();
        upsertExplorePlanningRoute(routeMap, importedRoute as unknown as TripBuilderRouteInput);
        current.forEach((route) => upsertExplorePlanningRoute(routeMap, route as unknown as TripBuilderRouteInput));
        return Array.from(routeMap.values()) as unknown as ExpeditionOpportunity[];
      });
      setSelectedRouteId(importedRoute.id);
      setTripSetupStarted(false);
      setPreparedTripRoutePreview(null);
      setPlan(null);
      setPlanMapScope(null);
      setPlanModalVisible(false);
      setDraftTripItineraryEditSession(null);
      setSavedTripItineraryEditSession(null);
      setSelectedSmartFuel(null);
      setSelectedSmartSupply(null);
      setSmartResupplyError(null);
      setSelectedBailoutPoint(null);
      setBailoutPickerVisible(false);
      setCampPlanPreference('skip');
      setCampPickerVisible(false);
      setCampPlanPins([]);
      setResupplyOverrides({});
      setRouteImportState({ status: 'success', message: `${fileName} ready for Trip Builder.` });
      lastTripBuilderPlanState = {
        selectedRouteId: importedRoute.id,
        plan: null,
        visible: false,
        itinerarySaved: false,
        itineraryEditSession: null,
      };
    } catch (importError) {
      setRouteImportState({
        status: 'error',
        message: importError instanceof Error ? importError.message : 'Route import failed.',
      });
    }
  };

  const handleOpenTripBuilderSetup = () => {
    if (!selectedRoute) return;
    hapticMicro();
    setPreparedTripRoutePreview(buildPreparedTripRoutePreview(selectedRoute));
    setTripSetupStarted(true);
    setError(null);
  };

  const handleSkipCampPlan = () => {
    hapticMicro();
    setCampPlanPreference('skip');
    setCampPickerVisible(false);
    setCampPlanPins([]);
  };

  const handleOpenCampPicker = () => {
    hapticMicro();
    setCampPlanPreference('pins');
    setCampPickerVisible(true);
  };

  const handleDropCampPin = (coordinate: TripMapCoordinate) => {
    if (!isValidMapCoordinate(coordinate)) return;
    hapticMicro();
    setCampPlanPreference('pins');
    setCampPlanPins((current) => {
      const nextIndex = current.length + 1;
      return [
        ...current,
        {
          id: `operator-camp-${Date.now().toString(36)}-${nextIndex}`,
          title: `Camp candidate ${nextIndex}`,
          coordinate,
          note: null,
        },
      ].slice(0, 8);
    });
  };

  const handleRemoveCampPin = (id: string) => {
    hapticMicro();
    setCampPlanPins((current) => current.filter((pin) => pin.id !== id));
  };

  const handleClearCampPins = () => {
    hapticMicro();
    setCampPlanPins([]);
  };

  const handleGenerate = () => {
    if (!selectedRoute) {
      setError('Select a route before generating a trip plan.');
      return;
    }
    if (!smartResupplyReady) {
      setError(
        smartResupplyPreference === 'fuel_supplies' && selectedSmartFuel && !selectedSmartFuel.groceries
          ? 'Select a grocery or supply stop before building this trip plan.'
          : 'Select a fuel stop before building this trip plan.',
      );
      return;
    }
    if (!bailoutPlanReady) {
      setError('Select a bailout or rendezvous point before building this trip plan, or choose No for bailout planning.');
      setBailoutPickerVisible(true);
      return;
    }
    if (!campPlanReady) {
      setError('Drop at least one camp reference pin, or choose Skip for Camp Plan.');
      setCampPickerVisible(true);
      return;
    }
    try {
      setGenerating(true);
      setError(null);
      const selectedSupplyMode = routeContextSupplyModeForTripBuilder(smartResupplyPreference);
      const routeContext = routeContextOrchestrator.getContext({
        trailId: String(selectedRoute.id),
        trail: selectedRoute as unknown as TripBuilderRouteInput & { id: string },
        origin: liveRouteContextOrigin,
        selectedSupplyMode,
        selectedRefuelCandidateId: selectedRouteContextSupplySelection.selectedRefuelCandidateId,
        selectedResupplyCandidateId: selectedRouteContextSupplySelection.selectedResupplyCandidateId,
        selectedSupplyCandidateIds: selectedRouteContextSupplySelection.selectedSupplyCandidateIds,
        featureFlags: TRIP_BUILDER_ROUTE_CONTEXT_FEATURE_FLAGS,
        providerRegistry: routeContextProviderRegistry,
      });
      setRouteContextSnapshot(routeContext);
      const selectedSmartFuelPoint = selectedSmartFuel ? smartResupplyPointForPlan(selectedSmartFuel) : null;
      const selectedSmartSupplyPoint = smartResupplyPreference === 'fuel_supplies' && selectedSmartSupply
        ? smartResupplyPointForPlan(selectedSmartSupply)
        : null;
      const selectedPreRouteResupplyPoints = orderSelectedSmartResupplyPoints(
        routeContext,
        [
          selectedSmartFuel && selectedSmartFuelPoint ? { option: selectedSmartFuel, point: selectedSmartFuelPoint } : null,
          selectedSmartSupply && selectedSmartSupplyPoint ? { option: selectedSmartSupply, point: selectedSmartSupplyPoint } : null,
        ].filter((item): item is { option: SmartResupplyPoi; point: ResupplyPoint } => !!item),
      );
      const routeContextPoiData = routeContextSupplyCandidatesToResupplyPoints(routeContext, selectedSupplyMode);
      const routeContextItineraryInput = routeContextToTripBuilderItineraryContext(routeContext, selectedSupplyMode);
      const selectedBailoutExitPoints = selectedBailoutPoint ? [bailoutExitPointForPlan(selectedBailoutPoint)] : null;
      const referencePoints: TripPlanReferencePoint[] = campPlanPins.map(tripPlanReferencePointFromCampPin);
      const input: TripBuilderInput = {
        tripType: DEFAULT_TRIP_BUILDER_TRIP_TYPE,
        timeWindow: timeWindowForTripType(DEFAULT_TRIP_BUILDER_TRIP_TYPE),
        groupType: DEFAULT_TRIP_BUILDER_GROUP_TYPE,
        priorities: DEFAULT_TRIP_BUILDER_PRIORITIES,
        smartResupplyPreference,
        bailoutPlanRequested: bailoutPlanPreference === 'yes',
      };
      const routeForPlan = routeWithRouteContext(selectedRoute as unknown as TripBuilderRouteInput, routeContext);
      const nextPlan = buildTripPlan({
        route: routeForPlan,
        input,
        vehicleProfile,
        readiness: readinessReference,
        campsiteCandidates: routeToCampCandidates(selectedRoute),
        exitPoints: selectedBailoutExitPoints,
        referencePoints,
        resupplyPoints: selectedPreRouteResupplyPoints,
        availablePoiData: routeContextPoiData,
        routeContext: routeContextItineraryInput,
        currentLocation: liveTripBuilderUserLocation,
      });
      const finalizedPlan = appendBailoutStopToPlan(nextPlan, selectedBailoutPoint);
      setPlan(finalizedPlan);
      setPlanModalVisible(true);
      setPlanMapScope(null);
      setItineraryEditMode(false);
      setDraftItineraryStops([]);
      setDraftTripItineraryEditSession(null);
      setSavedTripItineraryEditSession(null);
      setInsertState(null);
      setItinerarySaved(false);
      setResupplyOverrides({});
      lastTripBuilderPlanState = {
        selectedRouteId: String(selectedRoute.id),
        plan: finalizedPlan,
        visible: true,
        itinerarySaved: false,
        itineraryEditSession: null,
      };
    } catch {
      setError('Trip Builder could not build a plan from the selected route.');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartItineraryEdit = () => {
    if (!plan) return;
    hapticMicro();
    setDraftItineraryStops(plan.suggestedStops);
    setDraftTripItineraryEditSession(
      savedTripItineraryEditSession && selectedTripItinerary?.id === savedTripItineraryEditSession.itineraryId
        ? savedTripItineraryEditSession
        : selectedTripItinerary
          ? createTripItineraryEditSession(selectedTripItinerary)
          : null,
    );
    setInsertState(null);
    setItinerarySearchSuggestions([]);
    setItinerarySearchError(null);
    setItineraryEditMode(true);
  };

  const handleCancelItineraryEdit = () => {
    hapticMicro();
    setDraftItineraryStops([]);
    setDraftTripItineraryEditSession(null);
    setInsertState(null);
    setItinerarySearchSuggestions([]);
    setItinerarySearchError(null);
    setItineraryEditMode(false);
  };

  const handleSaveItineraryEdit = () => {
    if (!plan) return;
    hapticMicro();
    const nextPlan = updateTripPlanStops(plan, draftItineraryStops);
    const nextTripItineraryEditSession = draftTripItineraryEditSession;
    setPlan(nextPlan);
    setDraftItineraryStops([]);
    setSavedTripItineraryEditSession(nextTripItineraryEditSession);
    setDraftTripItineraryEditSession(null);
    setInsertState(null);
    setItinerarySearchSuggestions([]);
    setItinerarySearchError(null);
    setItineraryEditMode(false);
    setItinerarySaved(true);
    lastTripBuilderPlanState = {
      selectedRouteId,
      plan: nextPlan,
      visible: planModalVisible,
      itinerarySaved: true,
      itineraryEditSession: nextTripItineraryEditSession,
    };
  };

  const handleAcceptItineraryReviewItem = (itemId: string) => {
    hapticMicro();
    setDraftTripItineraryEditSession((current) => (
      current ? acceptTripItineraryEditItem(current, itemId) : current
    ));
  };

  const handleDismissItineraryReviewItem = (itemId: string) => {
    hapticMicro();
    setDraftTripItineraryEditSession((current) => (
      current ? dismissTripItineraryEditItem(current, itemId) : current
    ));
  };

  const handleMoveItineraryReviewStop = (itemId: string, direction: -1 | 1) => {
    hapticMicro();
    setDraftTripItineraryEditSession((current) => (
      current ? reorderTripItineraryStop(current, itemId, direction) : current
    ));
  };

  const handleAddUserItineraryStop = () => {
    hapticMicro();
    setDraftTripItineraryEditSession((current) => (
      current ? addUserItineraryStop(current) : current
    ));
  };

  const handleAddUserTrailWaypoint = () => {
    hapticMicro();
    setDraftTripItineraryEditSession((current) => (
      current ? addUserTrailWaypoint(current) : current
    ));
  };

  const handleMoveDraftStop = (index: number, direction: -1 | 1) => {
    setDraftItineraryStops((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return renumberTripPlanStops(next);
    });
  };

  const handleDeleteDraftStop = (index: number) => {
    setDraftItineraryStops((current) => renumberTripPlanStops(current.filter((_, itemIndex) => itemIndex !== index)));
  };

  const handleToggleItineraryBailout = (index: number) => {
    hapticMicro();
    setDraftItineraryStops((current) => renumberTripPlanStops(current.map((stop, itemIndex) => (
      itemIndex === index ? toggleItineraryStopBailout(stop) : stop
    ))));
  };

  const handleOpenInsertSlot = (index: number) => {
    hapticMicro();
    setInsertState({ index, query: '' });
    setItinerarySearchSuggestions([]);
    setItinerarySearchError(null);
  };

  const handleItinerarySearchQuery = (query: string) => {
    setInsertState((current) => current ? { ...current, query } : current);
  };

  const handleSelectItinerarySuggestion = async (suggestion: RoadNavSearchSuggestion) => {
    if (!plan || !insertState) return;
    hapticMicro();
    const token = itinerarySearchToken || await getMapboxToken();
    if (!token) {
      setItinerarySearchError('Map search unavailable until Mapbox token is ready.');
      return;
    }
    setItinerarySearchLoading(true);
    setItinerarySearchError(null);
    try {
      const destination = await resolveRoadDestination({
        accessToken: token,
        sessionToken: roadSearchSessionTokenRef.current,
        suggestion,
      });
      const coordinate = {
        latitude: destination.coordinate.lat,
        longitude: destination.coordinate.lng,
      };
      setDraftItineraryStops((current) => {
        const insertIndex = Math.max(0, Math.min(insertState.index, current.length));
        const nextStop = buildUserItineraryStop(
          plan,
          {
            ...suggestion,
            title: destination.title || suggestion.title,
            subtitle: destination.subtitle ?? suggestion.subtitle,
          },
          coordinate,
          insertIndex,
          current,
        );
        const next = [...current];
        next.splice(insertIndex, 0, nextStop);
        return renumberTripPlanStops(next);
      });
      setInsertState(null);
      setItinerarySearchSuggestions([]);
      setItinerarySearchError(null);
      roadSearchSessionTokenRef.current = createRoadSearchSessionToken();
    } catch (selectError) {
      setItinerarySearchError(selectError instanceof Error ? selectError.message : 'Selected location could not be added.');
    } finally {
      setItinerarySearchLoading(false);
    }
  };

  const handleActivateTrip = async () => {
    const itineraryForActiveTrip = editableTripItinerary ?? selectedTripItinerary;
    if (!plan || !selectedRoute || !itineraryForActiveTrip) {
      setActiveTripActivationError('Build or preview an itinerary before activating Active Trip Mode.');
      return;
    }

    hapticMicro();
    setActiveTripActivating(true);
    setActiveTripActivationError(null);
    try {
      activeTripModeStore.activate({
        itinerary: itineraryForActiveTrip,
        selectedRoute: selectedRoute as unknown as TripBuilderRouteInput,
        vehicleProfile,
        plan,
        routeConfidence: tripConfidenceSummary,
        lastKnownLocation: liveTripBuilderUserLocation,
        environment: {
          weather: { status: 'unknown', label: 'Trip Builder weather unavailable' },
          daylight: { status: 'unknown', label: 'Trip Builder daylight unavailable' },
          remoteness: {
            status: selectedRoute.remotenessScore != null ? 'available' : 'unknown',
            score: selectedRoute.remotenessScore ?? null,
          },
        },
        telemetry: { status: 'unavailable', label: 'Telemetry unavailable for Trip Builder MVP' },
      });
      await activeTripModeStore.flush();
      setPlanMapScope(null);
      setPlanModalVisible(false);
      router.push('/active-trip' as any);
    } catch (activationError) {
      setActiveTripActivationError(
        activationError instanceof Error
          ? activationError.message
          : 'Active Trip Mode could not be started from this itinerary.',
      );
    } finally {
      setActiveTripActivating(false);
    }
  };

  const handlePrepareOfflinePack = () => {
    if (selectedRoute && plan) {
      const route = routeForOfflinePrep(
        selectedRoute as unknown as TripBuilderRouteInput,
        plan,
        selectedPreparedRoutePoints.length >= 2
          ? selectedPreparedRoutePoints
          : routePointsForTripMap(selectedRoute as unknown as TripBuilderRouteInput),
      );
      const resupplyPoints = resupplyPointsFromPlan(plan);
      const exitPoints = exitPointsFromPlan(plan, getOfflinePrepRouteCoordinates(route));
      const itineraryForOfflinePrep = editableTripItinerary ?? selectedTripItinerary ?? null;
      saveOfflinePrepPackHandoff({
        route,
        itinerary: itineraryForOfflinePrep,
        tripPlan: plan,
        smartResupplyPlan: plan.smartResupplyPlan,
        vehicleProfile,
        readiness: readinessReference,
        campsiteCandidates: routeToCampCandidates(selectedRoute),
        exitPoints,
        resupplyPoints,
        emergencyPoints: resupplyPoints.filter((point) => point.category === 'medical' || point.category === 'repair'),
      }, 'trip_builder');
    }
    hapticMicro();
    router.push('/explore-offline-prep-pack');
  };

  const openPlanMap = (scope: TripPlanMapScope) => {
    hapticMicro();
    setPlanMapScope(scope);
  };

  const handleBackToSuggestedRoutes = () => {
    clearTripBuilderRouteHandoff();
    router.push('/discover');
  };

  return (
    <TopoBackground>
      <View style={[styles.safeContainer, { paddingBottom: bottomClearance }]}>
        <Header title="Explore" />
        <ExplorePlanningTabs activeTab="trip_builder" />
        <View style={styles.bodyFrame}>
          <View
            style={styles.fixedContent}
            testID="trip-builder-screen"
          >
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Ionicons name="git-merge-outline" size={18} color={TACTICAL.amber} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>EXPLORE PLANNING</Text>
                <Text style={styles.heroTitle}>Trip Builder</Text>
                <Text style={styles.heroText} numberOfLines={1}>
                  Turn a selected route into a day trip, overnight route, or expedition-style plan.
                </Text>
              </View>
              {tripSetupStarted && selectedRouteDisplayName ? (
                <View style={styles.heroRouteBadge} testID="trip-builder-selected-route-name">
                  <Text style={styles.heroRouteBadgeLabel}>ROUTE</Text>
                  <Text style={styles.heroRouteBadgeText} numberOfLines={1}>
                    {selectedRouteDisplayName}
                  </Text>
                </View>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={TACTICAL.amber} />
                <Text style={styles.stateText}>Loading route options...</Text>
              </View>
            ) : routes.length === 0 ? (
              <View style={styles.stateCard} testID="trip-builder-empty-state">
                <Ionicons name="map-outline" size={20} color={TACTICAL.textMuted} />
                <Text style={styles.stateTitle}>No routes ready for planning</Text>
                <Text style={styles.stateText}>
                  Open Suggested Trailheads, or import your own GPX/KML/GeoJSON route file.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryButton, routeImportState.status === 'loading' && styles.primaryButtonDisabled]}
                  onPress={handleImportRouteFile}
                  disabled={routeImportState.status === 'loading'}
                  accessibilityRole="button"
                  testID="trip-builder-import-route"
                >
                  {routeImportState.status === 'loading' ? <ActivityIndicator size="small" color="#081014" /> : null}
                  <Text style={styles.primaryButtonText}>Import Route File</Text>
                </TouchableOpacity>
                {routeImportState.message ? (
                  <Text style={[styles.stateText, routeImportState.status === 'error' ? styles.importErrorText : null]}>
                    {routeImportState.message}
                  </Text>
                ) : null}
                <TouchableOpacity style={styles.primaryButton} onPress={handleBackToSuggestedRoutes} accessibilityRole="button">
                  <Text style={styles.primaryButtonText}>Suggested Trailheads</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {!tripSetupStarted ? (
                  <View style={[styles.sectionCard, styles.routeSectionCard]}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Choose Route</Text>
                      <Text style={styles.sectionMeta}>
                        {routes.length} FILTERED ROUTE{routes.length === 1 ? '' : 'S'}
                      </Text>
                    </View>
                    <Text style={styles.routePickerHint}>
                      ECS OR IMPORTED: Select one of the current Suggested Trailheads filters or import a route file, then open Trip Builder to start setup.
                    </Text>
                    <TouchableOpacity
                      style={[styles.importRouteCard, routeImportState.status === 'loading' && styles.primaryButtonDisabled]}
                      onPress={handleImportRouteFile}
                      disabled={routeImportState.status === 'loading'}
                      activeOpacity={0.84}
                      accessibilityRole="button"
                      testID="trip-builder-import-route"
                    >
                      <View style={styles.importRouteIcon}>
                        <Ionicons name="cloud-upload-outline" size={17} color={TACTICAL.amber} />
                      </View>
                      <View style={styles.importRouteCopy}>
                        <Text style={styles.importRouteTitle}>Import GPX / Route File</Text>
                        <Text style={styles.importRouteSubtitle} numberOfLines={2}>
                          Use your own GPX, KML, GeoJSON, JSON, or XML route as the planning route.
                        </Text>
                      </View>
                      {routeImportState.status === 'loading' ? (
                        <ActivityIndicator size="small" color={TACTICAL.amber} />
                      ) : (
                        <Ionicons name="chevron-forward" size={15} color={TACTICAL.textMuted} />
                      )}
                    </TouchableOpacity>
                    {routeImportState.message ? (
                      <Text style={[styles.importStatusText, routeImportState.status === 'error' ? styles.importErrorText : null]}>
                        {routeImportState.message}
                      </Text>
                    ) : null}
                    <ScrollView
                      style={styles.routeListScroller}
                      contentContainerStyle={styles.routeList}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={routes.length > 4}
                    >
                      {routes.map((route) => (
                        <RouteSelectionCard
                          key={route.id}
                          route={route}
                          selected={String(route.id) === selectedRouteId}
                          onPress={() => selectPlanningRoute(String(route.id))}
                        />
                      ))}
                    </ScrollView>
                    <TouchableOpacity
                      style={[styles.primaryButton, !selectedRoute && styles.primaryButtonDisabled]}
                      activeOpacity={selectedRoute ? 0.84 : 1}
                      disabled={!selectedRoute}
                      onPress={handleOpenTripBuilderSetup}
                      accessibilityRole="button"
                      accessibilityLabel="Open Trip Builder"
                      testID="trip-builder-open-setup"
                    >
                      <Ionicons name="open-outline" size={14} color="#081014" />
                      <Text style={styles.primaryButtonText}>Open Trip Builder</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {tripSetupStarted && selectedRoute ? (
                  <View style={[styles.sectionCard, styles.tripSetupCard]}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Trip Setup</Text>
                      <Text style={styles.sectionMeta}>PLAN INPUTS</Text>
                    </View>

                    <ScrollView
                      style={styles.tripSetupScroller}
                      contentContainerStyle={styles.tripSetupContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      <View style={styles.tripSetupDefaults} testID="trip-builder-setup-defaults">
                        <View style={styles.tripSetupDefaultItem}>
                          <Text style={styles.tripSetupDefaultLabel}>Route</Text>
                          <Text style={styles.tripSetupDefaultValue} numberOfLines={1}>
                            {selectedRouteDisplayName ?? selectedRoute.name}
                          </Text>
                        </View>
                        <View style={styles.tripSetupDefaultItem}>
                          <Text style={styles.tripSetupDefaultLabel}>Mode</Text>
                          <Text style={styles.tripSetupDefaultValue}>Point A to B</Text>
                        </View>
                      </View>

                  <View style={styles.planningQuestionsBlock}>
                    <View style={styles.planningQuestion}>
                      <Text style={styles.groupLabel}>Smart Resupply Plan</Text>
                      <Text style={styles.planningQuestionText}>Are you looking to implement a smart resupply plan?</Text>
                      <View style={styles.planningChoiceRow}>
                        {SMART_RESUPPLY_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.planningChoice,
                              smartResupplyPreference === option.value && styles.planningChoiceSelected,
                            ]}
                            activeOpacity={0.82}
                            onPress={() => handleSmartResupplyPreference(option.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: smartResupplyPreference === option.value }}
                            testID={`trip-builder-resupply-${option.value}`}
                          >
                            <Text
                              style={[
                                styles.planningChoiceLabel,
                                smartResupplyPreference === option.value && styles.planningChoiceLabelSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                styles.planningChoiceDetail,
                                smartResupplyPreference === option.value && styles.planningChoiceDetailSelected,
                              ]}
                              numberOfLines={2}
                            >
                              {option.detail}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {smartResupplyPreference !== 'no' ? (
                        <View style={styles.smartResupplyPicker} testID="trip-builder-smart-resupply-picker">
                          <View style={styles.smartResupplyPickerHeader}>
                            <Text style={styles.smartResupplyPickerTitle}>Last Fuel Before Trail Entry</Text>
                            <Text style={styles.smartResupplyPickerMeta}>PICK 1 OF UP TO 5</Text>
                          </View>
                          <Text style={styles.smartResupplyPickerHint}>
                            ECS ranks fuel along your GPS-to-trailhead approach first, then uses trailhead-only fallback if GPS routing is unavailable.
                          </Text>
                          {smartResupplyLoading === 'fuel' && smartResupplyFuelOptions.length === 0 ? (
                            <View style={styles.smartResupplyLoadingRow}>
                              <ActivityIndicator size="small" color={TACTICAL.amber} />
                              <Text style={styles.smartResupplyPickerHint}>Finding fuel options...</Text>
                            </View>
                          ) : null}
                          {smartResupplyLoading === 'fuel' && smartResupplyFuelOptions.length > 0 ? (
                            <View style={styles.smartResupplyLoadingRow}>
                              <ActivityIndicator size="small" color={TACTICAL.amber} />
                              <Text style={styles.smartResupplyPickerHint}>Updating nearby fuel options...</Text>
                            </View>
                          ) : null}
                          <View style={styles.smartResupplyOptionList}>
                            {smartResupplyFuelOptions.map((option) => (
                              <SmartResupplyOptionCard
                                key={smartResupplyOptionStableKey(option)}
                                option={option}
                                selected={selectedSmartFuel ? smartResupplyOptionStableKey(selectedSmartFuel) === smartResupplyOptionStableKey(option) : false}
                                markerLabel="A"
                                onPress={() => handleSelectSmartFuel(option)}
                              />
                            ))}
                          </View>

                          {smartResupplyPreference === 'fuel_supplies' && selectedSmartFuel?.groceries ? (
                            <View style={styles.smartResupplyNotice} testID="trip-builder-smart-resupply-one-stop">
                              <Ionicons name="checkmark-circle" size={13} color="#66BB6A" />
                              <Text style={styles.smartResupplyNoticeText}>
                                This fuel stop is marked fuel + groceries, so it will be added once before the route start.
                              </Text>
                            </View>
                          ) : null}

                          {smartResupplyPreference === 'fuel_supplies' && selectedSmartFuel && !selectedSmartFuel.groceries ? (
                            <View style={styles.smartResupplySupplyBlock} testID="trip-builder-smart-resupply-supply-step">
                              <View style={styles.smartResupplyPickerHeader}>
                                <Text style={styles.smartResupplyPickerTitle}>Groceries / Supplies Along Approach</Text>
                                <Text style={styles.smartResupplyPickerMeta}>NEXT STOP B</Text>
                              </View>
                              <Text style={styles.smartResupplyPickerHint}>
                                ECS keeps supplies on the same approach corridor when possible, then falls back near your selected fuel stop.
                              </Text>
                              {smartResupplyLoading === 'supplies' && smartResupplySupplyOptions.length === 0 ? (
                                <View style={styles.smartResupplyLoadingRow}>
                                  <ActivityIndicator size="small" color={TACTICAL.amber} />
                                  <Text style={styles.smartResupplyPickerHint}>Finding grocery and supply options...</Text>
                                </View>
                              ) : null}
                              {smartResupplyLoading === 'supplies' && smartResupplySupplyOptions.length > 0 ? (
                                <View style={styles.smartResupplyLoadingRow}>
                                  <ActivityIndicator size="small" color={TACTICAL.amber} />
                                  <Text style={styles.smartResupplyPickerHint}>Updating nearby grocery/supply options...</Text>
                                </View>
                              ) : null}
                              <View style={styles.smartResupplyOptionList}>
                                {smartResupplySupplyOptions.map((option) => (
                                  <SmartResupplyOptionCard
                                    key={smartResupplyOptionStableKey(option)}
                                    option={option}
                                    selected={selectedSmartSupply ? smartResupplyOptionStableKey(selectedSmartSupply) === smartResupplyOptionStableKey(option) : false}
                                    markerLabel="B"
                                    onPress={() => handleSelectSmartSupply(option)}
                                  />
                                ))}
                              </View>
                            </View>
                          ) : null}

                          {smartResupplyError ? (
                            <Text style={styles.smartResupplyErrorText}>{smartResupplyError}</Text>
                          ) : null}
                          {!smartResupplyError && preTrailDraftStatusMessage ? (
                            <Text style={styles.smartResupplyErrorText}>{preTrailDraftStatusMessage}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.planningQuestion}>
                      <Text style={styles.groupLabel}>Bailout Plan</Text>
                      <Text style={styles.planningQuestionText}>Would you like to establish a bailout plan?</Text>
                      <View style={styles.planningChoiceRow}>
                        {BAILOUT_PLAN_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.planningChoice,
                              styles.planningChoiceHalf,
                              bailoutPlanPreference === option.value && styles.planningChoiceSelected,
                            ]}
                            activeOpacity={0.82}
                            onPress={() => handleBailoutPlanPreference(option.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: bailoutPlanPreference === option.value }}
                            testID={`trip-builder-bailout-plan-${option.value}`}
                          >
                            <Text
                              style={[
                                styles.planningChoiceLabel,
                                bailoutPlanPreference === option.value && styles.planningChoiceLabelSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                styles.planningChoiceDetail,
                                bailoutPlanPreference === option.value && styles.planningChoiceDetailSelected,
                              ]}
                              numberOfLines={2}
                            >
                              {option.detail}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {bailoutPlanPreference === 'yes' ? (
                        <View style={styles.bailoutSummaryCard} testID="trip-builder-bailout-summary">
                          <View style={styles.bailoutSummaryHeader}>
                            <View style={styles.bailoutSummaryCopy}>
                              <Text style={styles.bailoutSummaryTitle}>
                                {selectedBailoutPoint ? selectedBailoutPoint.title : 'Suggested Bailout / Rendezvous Points'}
                              </Text>
                              <Text style={styles.bailoutSummaryMeta} numberOfLines={2}>
                                {selectedBailoutPoint
                                  ? selectedBailoutPoint.subtitle ?? 'Emergency bailout or rendezvous point selected.'
                                  : 'Pick one of up to five ECS-calculated road-access points, or open the map to drop your own.'}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.bailoutOpenButton}
                              activeOpacity={0.82}
                              onPress={() => setBailoutPickerVisible(true)}
                              accessibilityRole="button"
                              accessibilityLabel="Open bailout picker"
                              testID="trip-builder-open-bailout-picker"
                            >
                              <Ionicons name="map-outline" size={12} color={TACTICAL.amber} />
                              <Text style={styles.bailoutOpenButtonText}>{selectedBailoutPoint ? 'Change' : 'Map Pick'}</Text>
                            </TouchableOpacity>
                          </View>
                          {bailoutOptionsLoading ? (
                            <View style={styles.smartResupplyLoadingRow}>
                              <ActivityIndicator size="small" color={TACTICAL.amber} />
                              <Text style={styles.smartResupplyPickerHint}>Calculating bailout options...</Text>
                            </View>
                          ) : null}
                          {bailoutOptions.length > 0 ? (
                            <View style={styles.bailoutInlineList} testID="trip-builder-bailout-inline-options">
                              {bailoutOptions.slice(0, BAILOUT_OPTION_LIMIT).map((option) => (
                                <BailoutPlanOptionCard
                                  key={option.id}
                                  option={option}
                                  selected={selectedBailoutPoint?.id === option.id}
                                  onPress={() => handleSelectBailoutPoint(option)}
                                />
                              ))}
                            </View>
                          ) : null}
                          {bailoutOptionsError ? (
                            <Text style={styles.smartResupplyErrorText}>{bailoutOptionsError}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.planningQuestion} testID="trip-builder-camp-plan">
                      <Text style={styles.groupLabel}>Camp Plan</Text>
                      <Text style={styles.planningQuestionText}>
                        Drop optional reference camp pins along this route, or skip camp planning for this trip.
                      </Text>
                      <View style={styles.planningChoiceRow}>
                        <TouchableOpacity
                          style={[
                            styles.planningChoice,
                            styles.planningChoiceHalf,
                            campPlanPreference === 'skip' && styles.planningChoiceSelected,
                          ]}
                          activeOpacity={0.82}
                          onPress={handleSkipCampPlan}
                          accessibilityRole="button"
                          accessibilityState={{ selected: campPlanPreference === 'skip' }}
                          testID="trip-builder-camp-skip"
                        >
                          <Text style={[
                            styles.planningChoiceLabel,
                            campPlanPreference === 'skip' && styles.planningChoiceLabelSelected,
                          ]}>
                            Skip
                          </Text>
                          <Text style={[
                            styles.planningChoiceDetail,
                            campPlanPreference === 'skip' && styles.planningChoiceDetailSelected,
                          ]} numberOfLines={2}>
                            No camp reference pins.
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.planningChoice,
                            styles.planningChoiceHalf,
                            campPlanPreference === 'pins' && styles.planningChoiceSelected,
                          ]}
                          activeOpacity={0.82}
                          onPress={handleOpenCampPicker}
                          accessibilityRole="button"
                          accessibilityState={{ selected: campPlanPreference === 'pins' }}
                          testID="trip-builder-open-camp-picker"
                        >
                          <Text style={[
                            styles.planningChoiceLabel,
                            campPlanPreference === 'pins' && styles.planningChoiceLabelSelected,
                          ]}>
                            Open Map
                          </Text>
                          <Text style={[
                            styles.planningChoiceDetail,
                            campPlanPreference === 'pins' && styles.planningChoiceDetailSelected,
                          ]} numberOfLines={2}>
                            Drop reference camp pins.
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {campPlanPins.length > 0 ? (
                        <View style={styles.campPinList} testID="trip-builder-camp-pin-list">
                          {campPlanPins.map((pin, index) => (
                            <View key={pin.id} style={styles.campPinRow}>
                              <View style={styles.campPinIcon}>
                                <Ionicons name="bonfire-outline" size={12} color={TACTICAL.amber} />
                              </View>
                              <View style={styles.campPinCopy}>
                                <Text style={styles.campPinTitle}>{pin.title}</Text>
                                <Text style={styles.campPinMeta} numberOfLines={1}>
                                  Operator-marked potential camp. Legal access, land use, fire restrictions, and posted rules are unknown.
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={styles.campPinRemove}
                                activeOpacity={0.82}
                                onPress={() => handleRemoveCampPin(pin.id)}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove camp pin ${index + 1}`}
                                testID={`trip-builder-remove-camp-pin-${pin.id}`}
                              >
                                <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.smartResupplyPickerHint}>
                          Camp pins are reference-only and will not change the guidance route.
                        </Text>
                      )}
                    </View>
                  </View>

                    </ScrollView>

                    <TouchableOpacity
                      style={[styles.primaryButton, (!selectedRoute || generating || !smartResupplyReady || !bailoutPlanReady || !campPlanReady) && styles.primaryButtonDisabled]}
                      activeOpacity={!selectedRoute || generating || !smartResupplyReady || !bailoutPlanReady || !campPlanReady ? 1 : 0.84}
                      disabled={!selectedRoute || generating || !smartResupplyReady || !bailoutPlanReady || !campPlanReady}
                      onPress={handleGenerate}
                      accessibilityRole="button"
                      accessibilityLabel="Build Trip Plan"
                      testID="trip-builder-generate"
                    >
                      {generating ? <ActivityIndicator size="small" color="#081014" /> : null}
                      <Text style={styles.primaryButtonText}>Build Trip Plan</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {error ? (
                  <View style={styles.errorCard}>
                    <Ionicons name="warning-outline" size={14} color="#EF5350" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

              </>
            )}
          </View>

          {plan && planModalVisible ? (
            <View style={styles.planOverlay} testID="trip-builder-plan-overlay">
              <View pointerEvents="none" style={styles.planOverlayBackdrop} />
              <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.eyebrow}>TRIP BUILDER</Text>
                  <Text style={styles.modalTitle}>Trip Plan</Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  activeOpacity={0.82}
                  onPress={() => {
                    setPlanMapScope(null);
                    setPlanModalVisible(false);
                    lastTripBuilderPlanState = {
                      selectedRouteId,
                      plan,
                      visible: false,
                      itinerarySaved,
                      itineraryEditSession: savedTripItineraryEditSession,
                    };
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close Trip Plan"
                  testID="trip-builder-results-close"
                >
                  <Ionicons name="close" size={18} color={TACTICAL.text} />
                </TouchableOpacity>
              </View>

              {plan ? (
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalContent}
                  showsVerticalScrollIndicator={false}
                  testID="trip-builder-results"
                >
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>{plan.route.name}</Text>
                      <Text style={styles.sectionMeta}>PLAN</Text>
                    </View>
                    <View style={styles.metricGrid}>
                      <Metric label="Distance" value={formatMiles(plan.estimate.totalDistanceMiles)} />
                      <Metric label="Drive Time" value={formatHours(plan.estimate.driveTimeHours)} />
                      <Metric label="Trip Type" value={tripTypeLabel(plan.tripType)} />
                      <Metric label="Readiness" value={plan.readinessReference?.status?.toUpperCase() ?? 'Data unavailable'} />
                    </View>

                    <ResultBlock title="Camp Check">
                      <Text style={styles.resultText}>
                        {plan.primaryCampCandidate
                          ? campCandidateLine(plan.primaryCampCandidate)
                          : 'No known camp source detected. Verify before departure.'}
                      </Text>
                      {plan.primaryCampCandidate?.notes?.[0] ? (
                        <Text style={styles.resultSubtext}>{plan.primaryCampCandidate.notes[0]}</Text>
                      ) : null}
                    </ResultBlock>

                    <ResultBlock
                      title={itinerarySaved ? 'Confidence-Built Itinerary' : 'Suggested Itinerary'}
                      onMapPress={tripPlanMapAvailability.itinerary ? () => openPlanMap('itinerary') : undefined}
                      onEditPress={itineraryEditMode ? undefined : handleStartItineraryEdit}
                    >
                      <TripConfidenceSummaryPanel summary={tripConfidenceSummary} />
                      <ItinerarySummaryPanel summary={itinerarySummary} />
                      <View style={styles.activeTripActionCard}>
                        <View style={styles.activeTripActionCopy}>
                          <Text style={styles.activeTripActionTitle}>Active Trip Snapshot</Text>
                          <Text style={styles.activeTripActionText} numberOfLines={2}>
                            Start a local, read-only operational trip from this itinerary and keep current warnings visible.
                          </Text>
                          {activeTripActivationError ? (
                            <Text style={styles.activeTripActionError}>{activeTripActivationError}</Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          style={[styles.activeTripButton, activeTripActivating && styles.activeTripButtonDisabled]}
                          activeOpacity={activeTripActivating ? 1 : 0.84}
                          disabled={activeTripActivating}
                          onPress={handleActivateTrip}
                          accessibilityRole="button"
                          accessibilityLabel="Activate Trip"
                          testID="trip-builder-activate-trip"
                        >
                          {activeTripActivating ? (
                            <ActivityIndicator size="small" color="#081014" />
                          ) : (
                            <Ionicons name="navigate-circle-outline" size={14} color="#081014" />
                          )}
                          <Text style={styles.activeTripButtonText}>
                            {activeTripActivating ? 'Starting' : 'Activate Trip'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <ItineraryReviewPanel
                        review={itineraryReview}
                        editing={itineraryEditMode}
                        editSession={draftTripItineraryEditSession}
                        onAcceptItem={handleAcceptItineraryReviewItem}
                        onDismissItem={handleDismissItineraryReviewItem}
                        onMoveStopItem={handleMoveItineraryReviewStop}
                        onAddUserStop={handleAddUserItineraryStop}
                        onAddUserWaypoint={handleAddUserTrailWaypoint}
                      />
                      {itineraryEditMode ? (
                        <View style={styles.itineraryEditor} testID="trip-builder-itinerary-editor">
                          <View style={styles.itineraryEditToolbar}>
                            <Text style={styles.itineraryEditHint}>
                              Reorder stops, remove extras, mark emergency bailouts, or add resupply, camp, waypoint, or address stops from Mapbox search.
                            </Text>
                            <View style={styles.itineraryEditButtons}>
                              <TouchableOpacity
                                style={styles.itineraryCancelButton}
                                activeOpacity={0.82}
                                onPress={handleCancelItineraryEdit}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel itinerary edits"
                                testID="trip-builder-cancel-itinerary"
                              >
                                <Text style={styles.itineraryCancelButtonText}>Cancel</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.itinerarySaveButton}
                                activeOpacity={0.84}
                                onPress={handleSaveItineraryEdit}
                                accessibilityRole="button"
                                accessibilityLabel="Save confidence-built itinerary"
                                testID="trip-builder-save-itinerary"
                              >
                                <Text style={styles.itinerarySaveButtonText}>Save</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          {draftItineraryStops.map((stop, index) => (
                            <React.Fragment key={stop.id}>
                              <ItineraryAddSlot
                                index={index}
                                active={insertState?.index === index}
                                onPress={() => handleOpenInsertSlot(index)}
                              />
                              {insertState?.index === index ? (
                                <ItinerarySearchPanel
                                  value={insertState.query}
                                  loading={itinerarySearchLoading}
                                  error={itinerarySearchError}
                                  suggestions={itinerarySearchSuggestions}
                                  onChangeText={handleItinerarySearchQuery}
                                  onSelectSuggestion={handleSelectItinerarySuggestion}
                                  onCancel={() => setInsertState(null)}
                                />
                              ) : null}
                              <EditableStopRow
                                stop={stop}
                                index={index}
                                count={draftItineraryStops.length}
                                onMoveUp={() => handleMoveDraftStop(index, -1)}
                                onMoveDown={() => handleMoveDraftStop(index, 1)}
                                onDelete={() => handleDeleteDraftStop(index)}
                                onToggleBailout={() => handleToggleItineraryBailout(index)}
                              />
                            </React.Fragment>
                          ))}
                          <ItineraryAddSlot
                            index={draftItineraryStops.length}
                            active={insertState?.index === draftItineraryStops.length}
                            onPress={() => handleOpenInsertSlot(draftItineraryStops.length)}
                          />
                          {insertState?.index === draftItineraryStops.length ? (
                            <ItinerarySearchPanel
                              value={insertState.query}
                              loading={itinerarySearchLoading}
                              error={itinerarySearchError}
                              suggestions={itinerarySearchSuggestions}
                              onChangeText={handleItinerarySearchQuery}
                              onSelectSuggestion={handleSelectItinerarySuggestion}
                              onCancel={() => setInsertState(null)}
                            />
                          ) : null}
                        </View>
                      ) : (
                        plan.suggestedStops.map((stop, index) => <StopRow key={stop.id} stop={stop} index={index} />)
                      )}
                    </ResultBlock>

                    <ResultBlock
                      title="Camp Candidates"
                      onMapPress={tripPlanMapAvailability.camps ? () => openPlanMap('camps') : undefined}
                    >
                      <Text style={styles.resultText}>Primary: {campCandidateLine(plan.primaryCampCandidate)}</Text>
                      <Text style={styles.resultText}>Backup: {campCandidateLine(plan.backupCampCandidate)}</Text>
                      {campReferenceStopsFromPlan(plan).map((stop, index) => (
                        <Text key={stop.id} style={styles.resultSubtext}>
                          Operator {index + 1}: {stop.title} - reference pin only; verify access, land use, fire restrictions, and posted rules.
                        </Text>
                      ))}
                    </ResultBlock>

                    <ResultBlock
                      title="Exit Access"
                      onMapPress={tripPlanMapAvailability.exits ? () => openPlanMap('exits') : undefined}
                    >
                      <Text style={styles.resultText}>{exitPointLine(plan.primaryExitPoint)}</Text>
                      {plan.primaryExitPoint?.notes?.[0] ? (
                        <Text style={styles.resultSubtext}>{plan.primaryExitPoint.notes[0]}</Text>
                      ) : null}
                    </ResultBlock>

                    {plan.smartResupplyPlan ? (
                      <ResultBlock
                        title="Smart Resupply Plan"
                        onMapPress={tripPlanMapAvailability.resupply ? () => openPlanMap('resupply') : undefined}
                      >
                        <View testID="trip-builder-smart-resupply-plan" style={styles.resupplyList}>
                          <Text style={styles.resultText}>
                            Check fuel, water, supply, repair, medical, and exit access before departure.
                          </Text>
                          <View style={styles.resupplySummaryRow}>
                            <Text style={styles.resupplySummaryText}>
                              Overall: {statusLabel(displaySmartResupplyOverall(plan.smartResupplyPlan, resupplyOverrides))}
                            </Text>
                            <Text style={styles.resupplySourceText} numberOfLines={1}>
                              {plan.smartResupplyPlan.sourceSummary.join(' | ')}
                            </Text>
                          </View>
                          {resupplyRows(plan.smartResupplyPlan).map((item) => (
                            <ResupplyRow
                              key={item.category}
                              plan={item}
                              override={resupplyOverrides[item.category]}
                              onPress={RESUPPLY_OVERRIDE_CATEGORIES.has(item.category) ? () => cycleResupplyOverride(item.category) : undefined}
                            />
                          ))}
                        </View>
                      </ResultBlock>
                    ) : null}

                    <ResultBlock title="ECS Notes">
                      {plan.notes.length === 0 ? (
                        <Text style={styles.resultText}>No additional notes.</Text>
                      ) : (
                        plan.notes.map((note) => <Text key={note.id} style={styles.resultText}>- {note.message}</Text>)
                      )}
                    </ResultBlock>

                    <ResultBlock title="Items to Verify">
                      {plan.warnings.length === 0 ? (
                        <Text style={styles.resultText}>No additional verification items from available data.</Text>
                      ) : (
                        plan.warnings.map((warning) => (
                          <Text key={warning.id} style={styles.warningText}>- {warning.message}</Text>
                        ))
                      )}
                    </ResultBlock>

                    <TouchableOpacity
                      style={styles.offlineButton}
                      activeOpacity={0.84}
                      onPress={handlePrepareOfflinePack}
                      accessibilityRole="button"
                      accessibilityLabel="Prepare Offline Pack"
                      testID="trip-builder-prepare-offline-pack"
                    >
                      <Ionicons name="download-outline" size={14} color="#081014" />
                      <Text style={styles.offlineButtonText}>Prepare Offline Pack</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              ) : null}
            </View>
            <TripPlanMapOverlay
              visible={!!planMapScope}
              scope={planMapScope}
              route={selectedRoute as unknown as TripBuilderRouteInput | null}
              routePreviewPoints={selectedPreparedRoutePoints}
              plan={plan}
              itinerarySaved={itinerarySaved}
              onClose={() => setPlanMapScope(null)}
            />
            </View>
          ) : null}
          <BailoutPlanPickerOverlay
            visible={bailoutPickerVisible}
            route={selectedRoute as unknown as TripBuilderRouteInput | null}
            routePreviewPoints={selectedPreparedRoutePoints}
            options={bailoutOptions}
            selectedPoint={selectedBailoutPoint}
            loading={bailoutOptionsLoading}
            error={bailoutOptionsError}
            onSelect={handleSelectBailoutPoint}
            onDropPoint={handleDropBailoutPoint}
            onClose={() => setBailoutPickerVisible(false)}
          />
          <CampPlanPickerOverlay
            visible={campPickerVisible}
            route={selectedRoute as unknown as TripBuilderRouteInput | null}
            routePreviewPoints={selectedPreparedRoutePoints}
            pins={campPlanPins}
            onDropPin={handleDropCampPin}
            onRemovePin={handleRemoveCampPin}
            onClearPins={handleClearCampPins}
            onClose={() => setCampPickerVisible(false)}
          />
        </View>
      </View>
    </TopoBackground>
  );
}

function deriveLoadoutSupport(vehicleId: string | null | undefined): NonNullable<TripBuilderVehicleProfile['supportReadiness']> | null {
  if (!vehicleId) return null;
  const loadout = loadoutStore.getLatestLocalByVehicleIdSync(vehicleId);
  if (!loadout) return null;
  const items = loadoutItemStore.getLocalByLoadoutIdSync(loadout.id);
  const labels = items
    .filter((item) => item.is_packed || item.is_critical)
    .slice(0, 6)
    .map((item) => item.name)
    .filter(Boolean);
  const normalized = items.map((item) => `${item.category} ${item.name ?? ''} ${item.notes ?? ''}`.toLowerCase());
  const hasMatch = (patterns: RegExp[]) => normalized.some((value) => patterns.some((pattern) => pattern.test(value)));
  return {
    water: hasMatch([/\bwater\b/, /\bhydration\b/, /\bjerry\b/]),
    foodSupplies: hasMatch([/\bfood\b/, /\bmeal\b/, /\bsupply\b/, /\bgrocery\b/]),
    repair: hasMatch([/\brepair\b/, /\btire\b/, /\bplug\b/, /\bpatch\b/, /\bcompressor\b/, /\btool\b/, /\bjack\b/]),
    medical: hasMatch([/\bmedical\b/, /\bfirst[ -]?aid\b/, /\btrauma\b/, /\bmed\b/]),
    recovery: hasMatch([/\brecovery\b/, /\bstrap\b/, /\bwinch\b/, /\bshackle\b/, /\btraction\b/]),
    source: loadout.name ? `active loadout: ${loadout.name}` : 'active loadout',
    labels,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ResultBlock({
  title,
  children,
  onMapPress,
  onEditPress,
  editLabel = 'Edit',
}: {
  title: string;
  children: React.ReactNode;
  onMapPress?: () => void;
  onEditPress?: () => void;
  editLabel?: string;
}) {
  return (
    <View style={styles.resultBlock}>
      <View style={styles.resultBlockHeader}>
        <Text style={styles.resultTitle}>{title}</Text>
        <View style={styles.resultActionRow}>
          {onEditPress ? (
            <TouchableOpacity
              style={styles.resultMapButton}
              activeOpacity={0.82}
              onPress={onEditPress}
              accessibilityRole="button"
              accessibilityLabel={`${editLabel} ${title}`}
              testID={`trip-builder-edit-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <Ionicons name="create-outline" size={11} color={TACTICAL.amber} />
              <Text style={styles.resultMapButtonText}>{editLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {onMapPress ? (
            <TouchableOpacity
              style={styles.resultMapButton}
              activeOpacity={0.82}
              onPress={onMapPress}
              accessibilityRole="button"
              accessibilityLabel={`View ${title} on trip map`}
              testID={`trip-builder-map-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <Ionicons name="map-outline" size={11} color={TACTICAL.amber} />
              <Text style={styles.resultMapButtonText}>Map</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1 },
  bodyFrame: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  fixedContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: ECS.bgPanel,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  heroIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: TACTICAL.amber + '10',
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 2 },
  heroRouteBadge: {
    maxWidth: '42%',
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: TACTICAL.amber + '0B',
    paddingHorizontal: 9,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  heroRouteBadgeLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  heroRouteBadgeText: {
    marginTop: 1,
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
  },
  heroText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 9,
    gap: 7,
  },
  routeSectionCard: {
    flex: 1,
    minHeight: 0,
  },
  tripSetupCard: {
    flex: 1,
    minHeight: 0,
  },
  tripSetupScroller: { flex: 1, minHeight: 0 },
  tripSetupContent: { gap: 7, paddingBottom: 2 },
  tripSetupDefaults: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '08',
    padding: 8,
  },
  tripSetupDefaultItem: { flex: 1, minWidth: 0, gap: 2 },
  tripSetupDefaultLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tripSetupDefaultValue: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sectionMeta: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  routePickerHint: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
  importRouteCard: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '2E',
    backgroundColor: TACTICAL.amber + '08',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  importRouteIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  importRouteCopy: { flex: 1, minWidth: 0 },
  importRouteTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  importRouteSubtitle: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  importStatusText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  importErrorText: { color: '#EF5350' },
  routeListScroller: { flex: 1, minHeight: 76 },
  routeList: { gap: 6 },
  routeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  routeOptionSelected: {
    borderColor: TACTICAL.amber + '42',
    backgroundColor: TACTICAL.amber + '0B',
  },
  routeOptionIcon: { width: 22, alignItems: 'center' },
  routeOptionCopy: { flex: 1, minWidth: 0 },
  routeOptionTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  routeOptionMeta: { color: TACTICAL.textMuted, fontSize: 9, fontWeight: '700' },
  routeOptionAuthority: { color: TACTICAL.amber, fontSize: 8, fontWeight: '800', marginTop: 2 },
  groupLabel: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tripTypeCard: {
    width: '31.6%',
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 7,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  tripTypeCardSelected: {
    borderColor: TACTICAL.amber + '50',
    backgroundColor: TACTICAL.amber + '10',
  },
  tripTypeLabel: { color: TACTICAL.text, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  tripTypeLabelSelected: { color: TACTICAL.amber },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    minHeight: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipSelected: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: TACTICAL.amber,
  },
  chipText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
  },
  chipTextSelected: { color: '#081014' },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priorityLimit: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
  },
  planningQuestionsBlock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 7,
    gap: 8,
  },
  planningQuestion: {
    gap: 5,
  },
  planningQuestionText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  planningChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  planningChoice: {
    width: '31.6%',
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 7,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  planningChoiceHalf: {
    width: '48.5%',
  },
  planningChoiceSelected: {
    borderColor: TACTICAL.amber + '52',
    backgroundColor: TACTICAL.amber + '12',
  },
  planningChoiceLabel: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
  planningChoiceLabelSelected: { color: TACTICAL.amber },
  planningChoiceDetail: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  planningChoiceDetailSelected: { color: TACTICAL.text },
  smartResupplyPicker: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.2)',
    backgroundColor: 'rgba(4,10,12,0.42)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
  },
  smartResupplyPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  smartResupplyPickerTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  smartResupplyPickerMeta: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  smartResupplyPickerHint: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  smartResupplyLoadingRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  smartResupplyOptionList: {
    gap: 5,
  },
  smartResupplyOption: {
    minHeight: 46,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 7,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  smartResupplyOptionSelected: {
    borderColor: TACTICAL.amber + '55',
    backgroundColor: TACTICAL.amber + '0E',
  },
  smartResupplyMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartResupplyMarkerSelected: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  smartResupplyMarkerText: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  smartResupplyMarkerTextSelected: { color: '#081014' },
  smartResupplyOptionCopy: { flex: 1, minWidth: 0 },
  smartResupplyOptionTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  smartResupplyOptionMeta: {
    marginTop: 1,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
  },
  smartResupplyPillRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  smartResupplyPill: {
    minHeight: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  smartResupplyPillText: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
  },
  smartResupplyDieselPill: {
    borderColor: '#66BB6A',
    backgroundColor: '#66BB6A',
  },
  smartResupplyDieselPillText: {
    color: '#081014',
    fontSize: 7,
    fontWeight: '900',
  },
  smartResupplyNotice: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#66BB6A55',
    backgroundColor: '#66BB6A12',
    paddingHorizontal: 7,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smartResupplyNoticeText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  smartResupplySupplyBlock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 7,
    gap: 6,
  },
  smartResupplyErrorText: {
    color: '#EF5350',
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  bailoutSummaryCard: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ITINERARY_BAILOUT_COLOR + '35',
    backgroundColor: ITINERARY_BAILOUT_COLOR + '0B',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 7,
  },
  bailoutSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bailoutSummaryCopy: { flex: 1, minWidth: 0 },
  bailoutInlineList: {
    gap: 6,
  },
  bailoutSummaryTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  bailoutSummaryMeta: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  bailoutOpenButton: {
    minHeight: 27,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bailoutOpenButtonText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  campPinList: {
    gap: 6,
  },
  campPinRow: {
    minHeight: 42,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#66BB6A35',
    backgroundColor: '#66BB6A0B',
    paddingHorizontal: 7,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  campPinIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#66BB6A45',
    backgroundColor: '#66BB6A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  campPinCopy: { flex: 1, minWidth: 0 },
  campPinTitle: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  campPinMeta: {
    marginTop: 1,
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 10,
    fontWeight: '700',
  },
  campPinRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ECS.stroke,
  },
  campingToggleRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.2)',
    backgroundColor: 'rgba(4,10,12,0.42)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  campingToggleCopy: { flex: 1 },
  campingToggleHint: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  togglePill: {
    width: 38,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePillOn: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  togglePillLocked: {
    opacity: 0.72,
  },
  primaryButton: {
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: {
    color: '#081014',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  offlineButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  offlineButtonText: {
    color: '#081014',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 18,
    alignItems: 'center',
    gap: 9,
  },
  stateTitle: { color: TACTICAL.text, fontSize: 14, fontWeight: '900' },
  stateText: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  errorCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF535040',
    backgroundColor: '#EF53500D',
    padding: 10,
  },
  errorText: { flex: 1, color: '#EF9A9A', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricTile: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 9,
    gap: 3,
  },
  metricLabel: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  metricValue: { color: TACTICAL.text, fontSize: 12, fontWeight: '900' },
  resultBlock: {
    borderTopWidth: 1,
    borderTopColor: ECS.stroke,
    paddingTop: 10,
    gap: 7,
  },
  resultBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  resultActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
  },
  resultTitle: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  resultMapButton: {
    minHeight: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0D',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultMapButtonText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  activeTripActionCard: {
    minHeight: 56,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: TACTICAL.amber + '0B',
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  activeTripActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  activeTripActionTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  activeTripActionText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  activeTripActionError: {
    marginTop: 2,
    color: '#EF5350',
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  activeTripButton: {
    minHeight: 31,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  activeTripButtonDisabled: { opacity: 0.56 },
  activeTripButtonText: {
    color: '#081014',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tripConfidencePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: 'rgba(4,10,12,0.56)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  tripConfidenceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tripConfidenceTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tripConfidenceEyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  tripConfidenceHeadline: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  tripConfidenceSubhead: {
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  tripConfidenceScoreBadge: {
    minWidth: 52,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  tripConfidenceScoreValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  tripConfidenceScoreLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tripConfidenceWarnings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  tripConfidenceWarningChip: {
    maxWidth: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF535055',
    backgroundColor: '#EF535012',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  tripConfidenceWarningText: {
    color: '#FFAB91',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
  },
  tripConfidenceSectionList: {
    gap: 6,
  },
  tripConfidenceSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 6,
    gap: 4,
  },
  tripConfidenceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tripConfidenceSectionTitle: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  tripConfidenceSectionStatus: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  tripConfidenceSectionSummary: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  tripConfidenceReasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  tripConfidenceReasonChip: {
    maxWidth: '100%',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tripConfidenceReasonText: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
  },
  tripConfidenceActionRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 6,
    gap: 2,
  },
  tripConfidenceActionLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tripConfidenceActionText: {
    color: TACTICAL.amber,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },
  itinerarySummary: {
    gap: 7,
    paddingVertical: 2,
  },
  itinerarySummaryHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itinerarySummaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itinerarySummaryTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itinerarySummaryTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  itinerarySummaryMessage: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  itinerarySummaryState: {
    maxWidth: 76,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  itinerarySummaryPhaseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  itinerarySummaryPhase: {
    minHeight: 30,
    minWidth: 92,
    maxWidth: '48%',
    flexGrow: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itinerarySummaryPhaseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  itinerarySummaryPhaseCopy: {
    flex: 1,
    minWidth: 0,
  },
  itinerarySummaryPhaseLabel: {
    color: TACTICAL.text,
    fontSize: 8,
    fontWeight: '900',
  },
  itinerarySummaryPhaseDetail: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '700',
  },
  itinerarySummaryNote: {
    color: '#FFCC80',
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  itineraryReview: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 8,
    gap: 8,
  },
  itineraryReviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itineraryReviewHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itineraryReviewTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  itineraryReviewSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '700',
  },
  itineraryReviewConfidence: {
    gap: 6,
  },
  itineraryReviewSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itineraryReviewSubheaderText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  itineraryReviewSubheaderMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  itineraryReviewConfidenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  itineraryReviewConfidenceChip: {
    minWidth: 74,
    flexGrow: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '08',
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 1,
  },
  itineraryReviewConfidenceLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  itineraryReviewConfidenceValue: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  itineraryReviewPhaseList: {
    gap: 6,
  },
  itineraryReviewPhase: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 7,
    gap: 5,
  },
  itineraryReviewPhaseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  itineraryReviewPhaseNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itineraryReviewPhaseNumberText: {
    fontSize: 8,
    fontWeight: '900',
  },
  itineraryReviewPhaseCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itineraryReviewPhaseTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  itineraryReviewPhaseDescription: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '700',
  },
  itineraryReviewAvailability: {
    minHeight: 20,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itineraryReviewAvailabilityText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  itineraryReviewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 31,
  },
  itineraryReviewMetaText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
  },
  itineraryReviewEditableText: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  itineraryReviewRecommendation: {
    paddingLeft: 31,
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '800',
  },
  itineraryReviewItemList: {
    paddingLeft: 31,
    gap: 4,
  },
  itineraryReviewItem: {
    minHeight: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 1,
  },
  itineraryReviewItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itineraryReviewItemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itineraryReviewItemTitle: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  itineraryReviewItemMeta: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 10,
    fontWeight: '700',
  },
  itineraryReviewItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itineraryReviewIconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: 'rgba(255,255,255,0.025)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itineraryReviewRemoveButton: {
    borderColor: '#EF535044',
    backgroundColor: '#EF53500D',
  },
  itineraryReviewWarnings: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(239,83,80,0.18)',
    paddingTop: 7,
    gap: 4,
  },
  itineraryReviewWarning: {
    color: '#FFCC80',
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '800',
  },
  itineraryReviewDismissedText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '800',
  },
  itineraryEditor: {
    gap: 7,
  },
  itineraryEditToolbar: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '08',
    padding: 8,
    gap: 7,
  },
  itineraryEditHint: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  itineraryEditButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
  },
  itinerarySaveButton: {
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itinerarySaveButtonText: {
    color: '#081014',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  itineraryCancelButton: {
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itineraryCancelButtonText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  itineraryAddSlot: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: TACTICAL.amber + '32',
    backgroundColor: 'rgba(230,184,76,0.045)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    gap: 6,
  },
  itineraryAddSlotActive: {
    borderColor: TACTICAL.amber + '70',
    backgroundColor: TACTICAL.amber + '10',
  },
  itineraryAddSlotCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  itineraryAddSlotText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  itineraryAddSlotHint: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  editStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 8,
  },
  editGrip: {
    width: 20,
    alignItems: 'center',
  },
  editStopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  editStopIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: TACTICAL.amber + '08',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editStopIconButtonDisabled: {
    opacity: 0.34,
  },
  editStopBailoutButtonActive: {
    borderColor: ITINERARY_BAILOUT_COLOR,
    backgroundColor: ITINERARY_BAILOUT_COLOR,
  },
  editStopDeleteButton: {
    borderColor: '#EF535044',
    backgroundColor: '#EF53500D',
  },
  itinerarySearchPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: 'rgba(3, 8, 10, 0.92)',
    padding: 9,
    gap: 8,
  },
  itinerarySearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  itinerarySearchInput: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: TACTICAL.text,
    paddingHorizontal: 10,
    fontSize: 11,
    fontWeight: '800',
  },
  itinerarySearchError: {
    color: '#FFCC80',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
  },
  itinerarySearchResults: {
    gap: 6,
  },
  itinerarySearchResult: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 2,
  },
  itinerarySearchResultTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  itinerarySearchResultSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
  },
  itinerarySearchCancel: {
    alignSelf: 'flex-end',
    minHeight: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itinerarySearchCancelText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  resultText: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  resultSubtext: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  warningText: { color: '#FFCC80', fontSize: 10, lineHeight: 15, fontWeight: '800' },
  resupplyList: { gap: 8 },
  resupplySummaryRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '08',
    padding: 8,
    gap: 3,
  },
  resupplySummaryText: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  resupplySourceText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  resupplyRow: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.022)',
    padding: 8,
  },
  resupplyRowTappable: {
    borderColor: TACTICAL.amber + '24',
  },
  resupplyIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resupplyCopy: { flex: 1, minWidth: 0, gap: 3 },
  resupplyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resupplyTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  resupplyTitleHint: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'none',
  },
  resupplyStatus: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  resupplyRecommendation: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  resupplyMeta: {
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  resupplyWarning: {
    color: '#FFCC80',
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  stopRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
  },
  stopIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TACTICAL.amber + '18',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '34',
  },
  stopIndexText: { color: TACTICAL.amber, fontSize: 9, fontWeight: '900' },
  stopCopy: { flex: 1, minWidth: 0 },
  stopTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  stopMeta: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '800' },
  stopNote: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  modalContainer: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  planOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  planOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 6, 8, 0.82)',
  },
  modalHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  modalHeaderCopy: { flex: 1, minWidth: 0 },
  modalTitle: {
    color: TACTICAL.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { flex: 1 },
  modalContent: {
    paddingBottom: 20,
  },
  tripMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 35,
    backgroundColor: 'rgba(3, 6, 8, 0.72)',
    padding: 14,
  },
  tripMapCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: ECS.bgPanel,
    padding: 10,
    gap: 9,
  },
  bailoutPickerCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ITINERARY_BAILOUT_COLOR + '32',
    backgroundColor: ECS.bgPanel,
    padding: 10,
    gap: 9,
  },
  tripMapHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tripMapHeaderCopy: { flex: 1, minWidth: 0 },
  tripMapTitle: { color: TACTICAL.text, fontSize: 16, fontWeight: '900' },
  tripMapSubtitle: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  tripMapFrame: {
    flex: 1,
    minHeight: 220,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: '#081014',
  },
  bailoutPickerMapFrame: {
    flex: 1,
    minHeight: 190,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: '#081014',
  },
  tripMapSurface: { flex: 1 },
  tripMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 8,
  },
  tripMapFallbackTitle: { color: TACTICAL.text, fontSize: 12, fontWeight: '900' },
  tripMapFallbackText: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  tripMapPointList: {
    flexShrink: 0,
    maxHeight: 132,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  tripMapPointListContent: { padding: 8, gap: 7 },
  tripMapPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripMapPointDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripMapPointDotText: { fontSize: 9, fontWeight: '900' },
  tripMapPointCopy: { flex: 1, minWidth: 0 },
  tripMapPointTitle: { color: TACTICAL.text, fontSize: 10, fontWeight: '900' },
  tripMapPointMeta: { color: TACTICAL.textMuted, fontSize: 8, lineHeight: 11, fontWeight: '700' },
  bailoutPickerFooter: {
    flexShrink: 0,
    maxHeight: 250,
    gap: 8,
  },
  bailoutPickerFooterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bailoutPickerTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  bailoutOptionList: {
    maxHeight: 150,
  },
  bailoutOptionListContent: { gap: 6 },
  bailoutOption: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  bailoutOptionSelected: {
    borderColor: ITINERARY_BAILOUT_COLOR + '60',
    backgroundColor: ITINERARY_BAILOUT_COLOR + '10',
  },
  bailoutOptionDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: ITINERARY_BAILOUT_COLOR + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bailoutOptionDotSelected: {
    backgroundColor: ITINERARY_BAILOUT_COLOR,
    borderColor: ITINERARY_BAILOUT_COLOR,
  },
  bailoutOptionCopy: { flex: 1, minWidth: 0 },
  bailoutOptionTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  bailoutOptionMeta: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
});
