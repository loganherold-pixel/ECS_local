import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { parseGeoFile, getPrimaryRouteCoordinates } from '../lib/gpxParser';
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
import {
  buildTripPlan,
  clearTripBuilderRouteHandoff,
  loadTripBuilderRouteHandoff,
  type CampCandidate,
  type GroupType,
  type TimeWindow,
  type TripBuilderInput,
  type TripBuilderVehicleProfile,
  type TripPlan,
  type TripBuilderRouteInput,
  type TripPlanStop,
  type TripPriority,
  type TripType,
  type ResupplyCategory,
  type ResupplyStatus,
  type ExitPoint,
  type ResupplyCategoryPlan,
  type ResupplyPoint,
  type SmartResupplyPlan,
} from '../lib/tripBuilder';
import {
  getOfflinePrepRouteCoordinates,
  saveOfflinePrepPackHandoff,
} from '../lib/offlinePrepPack';
import {
  loadExplorePlanningRouteContext,
  upsertExplorePlanningRoute,
} from '../lib/explore/explorePlanningRouteContextStore';
import { loadoutItemStore, loadoutStore } from '../lib/loadoutStore';
import {
  createRoadSearchSessionToken,
  type RoadNavDestination,
  resolveRoadDestination,
  searchRoadDestinations,
  type RoadNavSearchSuggestion,
} from '../lib/mapboxRoadNavigation';
import { fsReadFileFromPickerUri } from '../lib/fsCompat';

let lastTripBuilderPlanState: {
  selectedRouteId: string | null;
  plan: TripPlan | null;
  visible: boolean;
  itinerarySaved: boolean;
} = {
  selectedRouteId: null,
  plan: null,
  visible: false,
  itinerarySaved: false,
};

const TRIP_TYPE_OPTIONS: { value: TripType; label: string }[] = [
  { value: 'day_trip', label: 'Day Trip' },
  { value: 'overnight_camping', label: 'Overnight' },
  { value: 'weekend_overland', label: 'Weekend' },
  { value: 'multi_day_expedition', label: 'Multi-Day' },
  { value: 'scenic_exploration', label: 'Scenic' },
  { value: 'technical_trail_run', label: 'Technical' },
];

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
const SMART_RESUPPLY_SEARCH_LIMIT = 10;
const SMART_RESUPPLY_NEAR_START_RADIUS_MILES = 75;
const SMART_RESUPPLY_EXPANDED_START_RADIUS_MILES = 180;
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
  if (stop.source === ITINERARY_BAILOUT_SOURCE) return true;
  const source = stop.source.toLowerCase();
  if (source.includes('bailout') || source.includes('emergency')) return true;
  return stop.type === 'exit' && stopNoteIncludes(stop, /\b(bailout|emergency|escape)\b/);
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
    return {
      ...stop,
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
    notes: [
      ITINERARY_BAILOUT_NOTE,
      `${ITINERARY_BAILOUT_ORIGINAL_TYPE_PREFIX}${stop.type}.`,
      `${ITINERARY_BAILOUT_ORIGINAL_SOURCE_PREFIX}${stop.source}.`,
      ...stripBailoutMetadataNotes(stop),
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
  if (!value || typeof value !== 'object') return [];
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'Feature') return coordinatesFromImportedGeoJson(candidate.geometry);
  if (candidate.type === 'LineString' && Array.isArray(candidate.coordinates)) {
    return candidate.coordinates
      .map((coordinate) => Array.isArray(coordinate) ? [Number(coordinate[0]), Number(coordinate[1])] as [number, number] : null)
      .filter((coordinate): coordinate is [number, number] => (
        !!coordinate &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]) &&
        Math.abs(coordinate[1]) <= 90 &&
        Math.abs(coordinate[0]) <= 180
      ));
  }
  if (candidate.type === 'MultiLineString' && Array.isArray(candidate.coordinates)) {
    return candidate.coordinates.flatMap((line) => (
      Array.isArray(line) ? coordinatesFromImportedGeoJson({ type: 'LineString', coordinates: line }) : []
    ));
  }
  if (candidate.type === 'FeatureCollection' && Array.isArray(candidate.features)) {
    return candidate.features.flatMap(coordinatesFromImportedGeoJson);
  }
  if (Array.isArray(candidate.coordinates)) {
    return coordinatesFromImportedGeoJson({ type: 'LineString', coordinates: candidate.coordinates });
  }
  return [];
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
    routeMetadata: {
      source: 'trip_builder_import',
      sourceFileName: fileName,
      sourceFileType: ext,
      importedAt: new Date().toISOString(),
      routePointCount: coordinates.length,
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
      tripBuilderCampCandidateCount: [plan.primaryCampCandidate, plan.backupCampCandidate].filter(Boolean).length,
      tripBuilderExitPointCount: exitPointsFromPlan(plan, routePoints).length,
      tripBuilderBailoutPointCount: plan.suggestedStops.filter(isBailoutItineraryStop).length,
      tripBuilderResupplyPointCount: resupplyPointsFromPlan(plan).length,
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
          {option.distanceFromRouteStartMiles != null ? `${option.distanceFromRouteStartMiles.toFixed(1)} mi from route start` : 'Near route start'}
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
  routeStart: TripMapCoordinate,
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
    distanceFromRouteStartMiles: Math.round(tripMapCoordinateDistanceMiles(routeStart, coordinate) * 10) / 10,
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
        ? 'Operator selected as a pre-route fuel stop near the route start.'
        : 'Operator selected as a pre-route grocery/supply stop near the route start.',
      option.diesel ? 'Returned place data suggests diesel support. Verify pump availability before departure.' : null,
      option.groceries ? 'Returned place data suggests fuel and groceries/supplies at the same stop.' : null,
      option.subtitle ? `Mapbox place context: ${option.subtitle}.` : null,
    ].filter((note): note is string => !!note),
  };
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

function appendBailoutStopToPlan(plan: TripPlan, point: BailoutPlanPoint | null): TripPlan {
  if (!point) return plan;
  const duplicate = plan.suggestedStops.some((stop) => (
    stop.source === ITINERARY_BAILOUT_SOURCE &&
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
}): Promise<SmartResupplyPoi[]> {
  const routeStartProximity = {
    lat: params.routeStart.latitude,
    lng: params.routeStart.longitude,
  };
  const suggestionMap = new Map<string, RoadNavSearchSuggestion>();
  const collectSuggestions = (suggestions: RoadNavSearchSuggestion[]) => {
    suggestions.forEach((suggestion) => {
      const key = smartResupplySuggestionKey(suggestion);
      if (!suggestionMap.has(key)) suggestionMap.set(key, suggestion);
    });
  };
  const collectSearchPass = async (bbox?: SmartResupplySearchBounds) => {
    const suggestions = await searchRoadDestinations({
      accessToken: params.accessToken,
      query: params.query,
      sessionToken: params.sessionToken,
      proximity: routeStartProximity,
      bbox,
      limit: SMART_RESUPPLY_SEARCH_LIMIT,
    });
    collectSuggestions(suggestions);
  };

  try {
    await collectSearchPass(smartResupplySearchBounds(params.routeStart, SMART_RESUPPLY_NEAR_START_RADIUS_MILES));
  } catch {}

  if (suggestionMap.size < SMART_RESUPPLY_OPTION_LIMIT) {
    try {
      await collectSearchPass(smartResupplySearchBounds(params.routeStart, SMART_RESUPPLY_EXPANDED_START_RADIUS_MILES));
    } catch {}
  }

  if (suggestionMap.size < SMART_RESUPPLY_OPTION_LIMIT) {
    await collectSearchPass();
  }

  const options: SmartResupplyPoi[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestionMap.values()) {
    try {
      const destination = await resolveRoadDestination({
        accessToken: params.accessToken,
        sessionToken: params.sessionToken,
        suggestion,
      });
      const option = smartResupplyPoiFromDestination(suggestion, destination, params.category, params.routeStart);
      if (!option) continue;
      const key = `${option.title.toLowerCase()}:${option.coordinate.latitude.toFixed(4)}:${option.coordinate.longitude.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(option);
    } catch {}
  }
  return options
    .sort(
      (left, right) =>
        (left.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY) -
        (right.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, SMART_RESUPPLY_OPTION_LIMIT);
}

async function loadBailoutPlanOptions(params: {
  accessToken: string;
  sessionToken: string;
  routePoints: TripMapCoordinate[];
}): Promise<BailoutPlanPoint[]> {
  const routeStart = params.routePoints[0];
  const midRoute = params.routePoints[Math.max(0, Math.floor(params.routePoints.length * 0.5))] ?? routeStart;
  const lateRoute = params.routePoints[Math.max(0, Math.floor(params.routePoints.length * 0.75))] ?? midRoute;
  const routeEnd = params.routePoints[params.routePoints.length - 1] ?? lateRoute;
  const suggestedCandidates: (BailoutPlanPoint | null)[] = [
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

  const suggestions = await searchRoadDestinations({
    accessToken: params.accessToken,
    query: BAILOUT_SEARCH_QUERY,
    sessionToken: params.sessionToken,
    proximity: { lat: routeStart.latitude, lng: routeStart.longitude },
    limit: BAILOUT_SEARCH_LIMIT,
  });
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
  const mapboxOptions = options
    .filter((point) => point.source === 'mapbox_search')
    .sort(
      (left, right) =>
        (left.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY) -
        (right.distanceFromRouteStartMiles ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, BAILOUT_OPTION_LIMIT);

  return (mapboxOptions.length > 0 ? mapboxOptions : suggested).slice(0, BAILOUT_OPTION_LIMIT);
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
      .length;
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
        const isBailoutStop = isBailoutItineraryStop(stop);
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
          connectToRouteLine: !isBailoutStop,
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
  const [tripType, setTripType] = useState<TripType>('day_trip');
  const [groupType, setGroupType] = useState<GroupType>('solo');
  const [priorities, setPriorities] = useState<TripPriority[]>(['low_risk']);
  const [smartResupplyPreference, setSmartResupplyPreference] = useState<SmartResupplyPreference>('fuel_only');
  const [bailoutPlanPreference, setBailoutPlanPreference] = useState<BailoutPlanPreference>('yes');
  const [routeImportState, setRouteImportState] = useState<RouteImportState>({ status: 'idle', message: null });
  const [smartResupplyFuelOptions, setSmartResupplyFuelOptions] = useState<SmartResupplyPoi[]>([]);
  const [smartResupplySupplyOptions, setSmartResupplySupplyOptions] = useState<SmartResupplyPoi[]>([]);
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
  const [itinerarySaved, setItinerarySaved] = useState(false);
  const [insertState, setInsertState] = useState<ItineraryInsertState | null>(null);
  const [itinerarySearchToken, setItinerarySearchToken] = useState(() => getMapboxTokenSync());
  const [itinerarySearchLoading, setItinerarySearchLoading] = useState(false);
  const [itinerarySearchError, setItinerarySearchError] = useState<string | null>(null);
  const [itinerarySearchSuggestions, setItinerarySearchSuggestions] = useState<RoadNavSearchSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roadSearchSessionTokenRef = useRef(createRoadSearchSessionToken());

  useEffect(() => {
    try {
      const handoff = loadTripBuilderRouteHandoff();
      const exploreContext = loadExplorePlanningRouteContext();
      const suggestedRoutes = (exploreContext?.routes?.length
        ? exploreContext.routes
        : loadOpportunitiesWithCompatibility(null).opportunities
      ) as ExpeditionOpportunity[];
      const handoffRoute = handoff?.route as ExpeditionOpportunity | undefined;
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
      } else {
        setTripSetupStarted(false);
        setPreparedTripRoutePreview(null);
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

  const selectedRouteStartCoordinate = useMemo(() => {
    if (!selectedRoute) return null;
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
  }, [preparedTripRoutePreview, selectedRoute, tripSetupStarted]);

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
    if (
      selectedRoute &&
      tripSetupStarted &&
      preparedRoutePreviewMatches(preparedTripRoutePreview, selectedRoute)
    ) {
      return preparedTripRoutePreview.routePoints;
    }
    return selectedRoute ? routePointsForTripMap(selectedRoute as unknown as TripBuilderRouteInput) : [];
  }, [preparedTripRoutePreview, selectedRoute, tripSetupStarted]);

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
  const bailoutPlanReady = bailoutPlanPreference === 'no' || !!selectedBailoutPoint;

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
    setSmartResupplyFuelOptions([]);
    setSmartResupplySupplyOptions([]);
    setSmartResupplyError(null);
  }, [selectedRouteId, smartResupplyPreference]);

  useEffect(() => {
    if (!tripSetupStarted) {
      setSmartResupplyFuelOptions([]);
      setSmartResupplyLoading(null);
      setSmartResupplyError(null);
      return;
    }
    if (smartResupplyPreference === 'no') {
      setSmartResupplyFuelOptions([]);
      setSmartResupplyLoading(null);
      setSmartResupplyError(null);
      return;
    }
    if (!selectedRouteStartCoordinate) {
      setSmartResupplyFuelOptions([]);
      setSmartResupplyLoading(null);
      setSmartResupplyError('Route start is unavailable, so ECS cannot locate pre-route fuel options.');
      return;
    }

    let cancelled = false;
    setSmartResupplyLoading('fuel');
    setSmartResupplyError(null);
    void (async () => {
      try {
        const token = itinerarySearchToken ?? await getMapboxToken();
        if (!token) throw new Error('Map search unavailable until Mapbox token is ready.');
        if (!itinerarySearchToken) setItinerarySearchToken(token);
        const options = await loadSmartResupplyOptions({
          accessToken: token,
          sessionToken: roadSearchSessionTokenRef.current,
          query: SMART_RESUPPLY_FUEL_QUERY,
          category: 'fuel',
          routeStart: selectedRouteStartCoordinate,
        });
        if (cancelled) return;
        setSmartResupplyFuelOptions(options);
        if (options.length === 0) {
          setSmartResupplyError('No fuel options were found near the route start. Try selecting No, or verify manually.');
        }
      } catch (searchError) {
        if (!cancelled) {
          setSmartResupplyFuelOptions([]);
          setSmartResupplyError(searchError instanceof Error ? searchError.message : 'Fuel search unavailable.');
        }
      } finally {
        if (!cancelled) setSmartResupplyLoading(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itinerarySearchToken, selectedRouteStartCoordinate, smartResupplyPreference, tripSetupStarted]);

  useEffect(() => {
    if (
      !tripSetupStarted ||
      smartResupplyPreference !== 'fuel_supplies' ||
      !selectedSmartFuel ||
      selectedSmartFuel.groceries
    ) {
      setSmartResupplySupplyOptions([]);
      return;
    }
    if (!selectedRouteStartCoordinate) return;

    let cancelled = false;
    setSmartResupplyLoading('supplies');
    setSmartResupplyError(null);
    void (async () => {
      try {
        const token = itinerarySearchToken ?? await getMapboxToken();
        if (!token) throw new Error('Map search unavailable until Mapbox token is ready.');
        if (!itinerarySearchToken) setItinerarySearchToken(token);
        const options = await loadSmartResupplyOptions({
          accessToken: token,
          sessionToken: roadSearchSessionTokenRef.current,
          query: SMART_RESUPPLY_SUPPLY_QUERY,
          category: 'food_supplies',
          routeStart: selectedRouteStartCoordinate,
        });
        if (cancelled) return;
        setSmartResupplySupplyOptions(options);
        if (options.length === 0) {
          setSmartResupplyError('No grocery or supply options were found near the route start. Verify manually before departure.');
        }
      } catch (searchError) {
        if (!cancelled) {
          setSmartResupplySupplyOptions([]);
          setSmartResupplyError(searchError instanceof Error ? searchError.message : 'Supply search unavailable.');
        }
      } finally {
        if (!cancelled) setSmartResupplyLoading(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itinerarySearchToken, selectedRouteStartCoordinate, selectedSmartFuel, smartResupplyPreference, tripSetupStarted]);

  useEffect(() => {
    setSelectedBailoutPoint(null);
    setBailoutOptions([]);
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
      setBailoutOptionsError(null);
      return;
    }
    const routePoints = selectedPreparedRoutePoints.length >= 2
      ? selectedPreparedRoutePoints
      : [selectedRouteStartCoordinate, selectedRouteEndCoordinate].filter(isValidMapCoordinate);
    if (routePoints.length < 2) {
      setBailoutOptions([]);
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
        });
        if (!cancelled) setBailoutOptions(options);
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
    setSelectedRouteId(routeId);
    setTripSetupStarted(false);
    setPreparedTripRoutePreview(null);
    setPlan(null);
    setPlanMapScope(null);
    setPlanModalVisible(false);
    setRouteImportState({ status: 'idle', message: null });
    setSelectedSmartFuel(null);
    setSelectedSmartSupply(null);
    setSmartResupplyError(null);
    setSelectedBailoutPoint(null);
    setBailoutPickerVisible(false);
    setResupplyOverrides({});
    lastTripBuilderPlanState = {
      selectedRouteId: routeId,
      plan: null,
      visible: false,
      itinerarySaved: false,
    };
  };

  const handleImportRouteFile = async () => {
    if (routeImportState.status === 'loading') return;
    hapticMicro();
    setRouteImportState({ status: 'loading', message: 'Opening route file picker...' });
    try {
      const DocumentPicker = await import('expo-document-picker');
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
      setSelectedSmartFuel(null);
      setSelectedSmartSupply(null);
      setSmartResupplyError(null);
      setSelectedBailoutPoint(null);
      setBailoutPickerVisible(false);
      setResupplyOverrides({});
      setRouteImportState({ status: 'success', message: `${fileName} ready for Trip Builder.` });
      lastTripBuilderPlanState = {
        selectedRouteId: importedRoute.id,
        plan: null,
        visible: false,
        itinerarySaved: false,
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

  const togglePriority = (priority: TripPriority) => {
    setPriorities((current) => {
      if (current.includes(priority)) return current.filter((item) => item !== priority);
      if (current.length >= 2) return [current[1], priority];
      return [...current, priority];
    });
  };

  const setCampingNeeded = (needed: boolean) => {
    setPriorities((current) => {
      if (needed) {
        if (current.includes('camping')) return current;
        if (current.length >= 2) return ['camping', current[1]];
        return ['camping', ...current];
      }
      return current.filter((item) => item !== 'camping');
    });
  };

  const setTripTypeAndDefaults = (next: TripType) => {
    hapticMicro();
    setTripType(next);
    if (campingImplied(next)) {
      setPriorities((current) => current.filter((item) => item !== 'camping').slice(0, 2));
    }
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
    try {
      setGenerating(true);
      setError(null);
      const selectedPreRouteResupplyPoints = [
        selectedSmartFuel ? smartResupplyPointForPlan(selectedSmartFuel) : null,
        smartResupplyPreference === 'fuel_supplies' && selectedSmartSupply
          ? smartResupplyPointForPlan(selectedSmartSupply)
          : null,
      ].filter((point): point is ResupplyPoint => !!point);
      const selectedBailoutExitPoints = selectedBailoutPoint ? [bailoutExitPointForPlan(selectedBailoutPoint)] : null;
      const input: TripBuilderInput = {
        tripType,
        timeWindow: timeWindowForTripType(tripType),
        groupType,
        priorities,
        smartResupplyPreference,
        bailoutPlanRequested: bailoutPlanPreference === 'yes',
      };
      const nextPlan = buildTripPlan({
        route: selectedRoute as unknown as TripBuilderRouteInput,
        input,
        vehicleProfile,
        readiness: readinessReference,
        campsiteCandidates: routeToCampCandidates(selectedRoute),
        exitPoints: selectedBailoutExitPoints,
        resupplyPoints: selectedPreRouteResupplyPoints,
      });
      const finalizedPlan = appendBailoutStopToPlan(nextPlan, selectedBailoutPoint);
      setPlan(finalizedPlan);
      setPlanModalVisible(true);
      setPlanMapScope(null);
      setItineraryEditMode(false);
      setDraftItineraryStops([]);
      setInsertState(null);
      setItinerarySaved(false);
      setResupplyOverrides({});
      lastTripBuilderPlanState = {
        selectedRouteId: String(selectedRoute.id),
        plan: finalizedPlan,
        visible: true,
        itinerarySaved: false,
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
    setInsertState(null);
    setItinerarySearchSuggestions([]);
    setItinerarySearchError(null);
    setItineraryEditMode(true);
  };

  const handleCancelItineraryEdit = () => {
    hapticMicro();
    setDraftItineraryStops([]);
    setInsertState(null);
    setItinerarySearchSuggestions([]);
    setItinerarySearchError(null);
    setItineraryEditMode(false);
  };

  const handleSaveItineraryEdit = () => {
    if (!plan) return;
    hapticMicro();
    const nextPlan = updateTripPlanStops(plan, draftItineraryStops);
    setPlan(nextPlan);
    setDraftItineraryStops([]);
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
    };
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
      saveOfflinePrepPackHandoff({
        route,
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
                  Open Suggested Routes, or import your own GPX/KML/GeoJSON route file.
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
                  <Text style={styles.primaryButtonText}>Suggested Routes</Text>
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
                      ECS OR IMPORTED: Select one of the current Suggested Routes filters or import a route file, then open Trip Builder to start setup.
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
                      <Text style={styles.groupLabel}>Trip Type</Text>
                      <View style={styles.optionGrid}>
                        {TRIP_TYPE_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            style={[styles.tripTypeCard, tripType === option.value && styles.tripTypeCardSelected]}
                            activeOpacity={0.82}
                            onPress={() => setTripTypeAndDefaults(option.value)}
                            accessibilityRole="button"
                            accessibilityLabel={`Trip type ${option.label}`}
                            accessibilityState={{ selected: tripType === option.value }}
                            testID={`trip-builder-trip-type-${option.value}`}
                          >
                            <Text style={[styles.tripTypeLabel, tripType === option.value && styles.tripTypeLabelSelected]}>{option.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.groupLabel}>Group Type</Text>
                      <View style={styles.chipRow}>
                        {GROUP_OPTIONS.map((option) => (
                          <OptionChip
                            key={option.value}
                            label={option.label}
                            selected={groupType === option.value}
                            onPress={() => {
                              hapticMicro();
                              setGroupType(option.value);
                            }}
                            testID={`trip-builder-group-${option.value}`}
                          />
                        ))}
                      </View>

                  <View
                    style={styles.campingToggleRow}
                    accessibilityLabel={campingImplied(tripType) ? 'Camping included for this trip type' : 'Camping needed'}
                    testID="trip-builder-camping-needed"
                  >
                    <View style={styles.campingToggleCopy}>
                      <Text style={styles.groupLabel}>Include Camping</Text>
                      <Text style={styles.campingToggleHint}>
                        {campingImplied(tripType)
                          ? 'Included for this trip type.'
                          : 'Adds camp checks and camp candidate priority.'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.togglePill,
                        (campingImplied(tripType) || priorities.includes('camping')) && styles.togglePillOn,
                        campingImplied(tripType) && styles.togglePillLocked,
                      ]}
                      activeOpacity={campingImplied(tripType) ? 1 : 0.82}
                      disabled={campingImplied(tripType)}
                      onPress={() => setCampingNeeded(!priorities.includes('camping'))}
                      accessibilityRole="switch"
                      accessibilityState={{
                        checked: campingImplied(tripType) || priorities.includes('camping'),
                        disabled: campingImplied(tripType),
                      }}
                      testID="trip-builder-camping-needed-toggle"
                    >
                      <Ionicons
                        name={(campingImplied(tripType) || priorities.includes('camping')) ? 'checkmark' : 'remove'}
                        size={13}
                        color={(campingImplied(tripType) || priorities.includes('camping')) ? '#081014' : TACTICAL.textMuted}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.priorityHeader}>
                    <Text style={styles.groupLabel}>Priorities</Text>
                    <Text style={styles.priorityLimit}>Choose up to 2</Text>
                  </View>
                  <View style={styles.chipRow}>
                    {PRIORITY_OPTIONS.filter((option) => !campingImplied(tripType) || option.value !== 'camping').map((option) => (
                      <OptionChip
                        key={option.value}
                        label={option.label}
                        icon={option.icon}
                        selected={priorities.includes(option.value)}
                        onPress={() => togglePriority(option.value)}
                        testID={`trip-builder-priority-${option.value}`}
                      />
                    ))}
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
                            <Text style={styles.smartResupplyPickerTitle}>Fuel Near Route Start</Text>
                            <Text style={styles.smartResupplyPickerMeta}>PICK 1 OF UP TO 5</Text>
                          </View>
                          <Text style={styles.smartResupplyPickerHint}>
                            ECS uses the actual route start to stage fuel before the first trail mile.
                          </Text>
                          {smartResupplyLoading === 'fuel' ? (
                            <View style={styles.smartResupplyLoadingRow}>
                              <ActivityIndicator size="small" color={TACTICAL.amber} />
                              <Text style={styles.smartResupplyPickerHint}>Finding fuel options...</Text>
                            </View>
                          ) : null}
                          <View style={styles.smartResupplyOptionList}>
                            {smartResupplyFuelOptions.map((option) => (
                              <SmartResupplyOptionCard
                                key={option.id}
                                option={option}
                                selected={selectedSmartFuel?.id === option.id}
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
                                <Text style={styles.smartResupplyPickerTitle}>Groceries / Supplies Near Start</Text>
                                <Text style={styles.smartResupplyPickerMeta}>NEXT STOP B</Text>
                              </View>
                              {smartResupplyLoading === 'supplies' ? (
                                <View style={styles.smartResupplyLoadingRow}>
                                  <ActivityIndicator size="small" color={TACTICAL.amber} />
                                  <Text style={styles.smartResupplyPickerHint}>Finding grocery and supply options...</Text>
                                </View>
                              ) : null}
                              <View style={styles.smartResupplyOptionList}>
                                {smartResupplySupplyOptions.map((option) => (
                                  <SmartResupplyOptionCard
                                    key={option.id}
                                    option={option}
                                    selected={selectedSmartSupply?.id === option.id}
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
                  </View>

                    </ScrollView>

                    <TouchableOpacity
                      style={[styles.primaryButton, (!selectedRoute || generating || !smartResupplyReady || !bailoutPlanReady) && styles.primaryButtonDisabled]}
                      activeOpacity={!selectedRoute || generating || !smartResupplyReady || !bailoutPlanReady ? 1 : 0.84}
                      disabled={!selectedRoute || generating || !smartResupplyReady || !bailoutPlanReady}
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
