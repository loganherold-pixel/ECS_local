/* eslint-disable import/no-unresolved */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type SupportedCategory = 'day-trips' | 'weekend-trips' | 'expeditions' | 'remote-routes';
type RegionGroupId =
  | 'utah-canyonlands'
  | 'california-desert'
  | 'colorado-high-country'
  | 'southern-appalachians'
  | 'upper-midwest'
  | 'arkansas-ozarks'
  | 'sierra-nevada'
  | 'pacific-northwest'
  | 'arizona-desert'
  | 'texas-hill-country'
  | 'idaho-montana'
  | 'great-basin'
  | 'oregon-cascades'
  | 'new-mexico'
  | 'kentucky-appalachians';
type AIRouteConfidence = 'high' | 'good' | 'explore';
type AIRouteSuggestedLabel =
  | 'AI Suggested'
  | 'AI Suggested Route'
  | 'Expedition Idea'
  | 'Hidden Gem Candidate'
  | 'Remote Trip Option';

interface RouteSeed {
  id: string;
  name: string;
  region: string;
  regionGroup: RegionGroupId;
  categories: SupportedCategory[];
  distanceMiles: number;
  terrainType: string;
  remotenessScore: number;
  estimatedFuelRequired: number;
  suggestedCamps: number;
  description: string;
  highlights: string[];
  elevationGainFt: number;
  estimatedDays: number;
  bestSeason: string;
  permitRequired: boolean;
  imageTag: string;
  startLat: number;
  startLng: number;
  recommendedTireSize?: number;
  recommendedLift?: number;
  terrainDifficulty?: number;
  popularityScore?: number;
  estimatedTravelHours?: number;
}

interface ResponseRoute extends RouteSeed {
  isAIGenerated: true;
  confidence: AIRouteConfidence;
  suggestedLabel: AIRouteSuggestedLabel;
  expeditionSummary: string;
  cautionNotes: string;
  campSuitability: string;
  generatedAt: string;
  distanceFromUserMiles: number;
  hiddenGem?: boolean;
}

interface RequestBody {
  latitude?: number;
  longitude?: number;
  category?: string;
  radiusMiles?: number;
  vehicleType?: string;
  vehicleBuild?: string;
  count?: number;
  existingRouteNames?: string[];
}

const MAX_COUNT = 6;
const DEFAULT_RADIUS_MILES = 250;

const CATEGORY_ALIASES: Record<string, SupportedCategory> = {
  'day-trip': 'day-trips',
  'day-trips': 'day-trips',
  day_trips: 'day-trips',
  daytrips: 'day-trips',
  'weekend-trip': 'weekend-trips',
  'weekend-trips': 'weekend-trips',
  weekend_trips: 'weekend-trips',
  weekendtrips: 'weekend-trips',
  expedition: 'expeditions',
  expeditions: 'expeditions',
  remote: 'remote-routes',
  'remote-route': 'remote-routes',
  'remote-routes': 'remote-routes',
  remote_routes: 'remote-routes',
  remoteroutes: 'remote-routes',
};

const CATEGORY_LABELS: Record<SupportedCategory, AIRouteSuggestedLabel> = {
  'day-trips': 'AI Suggested',
  'weekend-trips': 'Hidden Gem Candidate',
  expeditions: 'Expedition Idea',
  'remote-routes': 'Remote Trip Option',
};

const ROUTE_CATALOG: RouteSeed[] = [
  {
    id: 'shafer-trail',
    name: 'Shafer Trail',
    region: 'Canyonlands, Utah',
    regionGroup: 'utah-canyonlands',
    categories: ['day-trips'],
    distanceMiles: 15,
    terrainType: 'Desert Canyon',
    remotenessScore: 7,
    estimatedFuelRequired: 3,
    suggestedCamps: 0,
    description: 'A dramatic switchback descent from Island in the Sky mesa to the canyon floor with exposed shelf-road driving.',
    highlights: ['Cliff-edge switchbacks', 'Colorado River views', 'Mesa-top panoramas'],
    elevationGainFt: 1400,
    estimatedDays: 1,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'desert-canyon',
    startLat: 38.42,
    startLng: -109.86,
    recommendedTireSize: 31,
    recommendedLift: 2,
    terrainDifficulty: 6,
    popularityScore: 55,
    estimatedTravelHours: 2,
  },
  {
    id: 'cathedral-valley-loop',
    name: 'Cathedral Valley Loop',
    region: 'Capitol Reef, Utah',
    regionGroup: 'utah-canyonlands',
    categories: ['day-trips', 'weekend-trips'],
    distanceMiles: 58,
    terrainType: 'Desert Canyon',
    remotenessScore: 8,
    estimatedFuelRequired: 7,
    suggestedCamps: 1,
    description: 'A remote loop through Capitol Reef with monoliths, bentonite hills, and a long isolated run across the valley floor.',
    highlights: ['Temple of the Sun', 'Temple of the Moon', 'Bentonite hills'],
    elevationGainFt: 2200,
    estimatedDays: 1,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'desert-canyon',
    startLat: 38.35,
    startLng: -111.2,
    recommendedTireSize: 31,
    recommendedLift: 0,
    terrainDifficulty: 4,
    popularityScore: 20,
    estimatedTravelHours: 5,
  },
  {
    id: 'hole-in-the-rock',
    name: 'Hole in the Rock Road',
    region: 'Grand Staircase, Utah',
    regionGroup: 'utah-canyonlands',
    categories: ['day-trips', 'weekend-trips'],
    distanceMiles: 62,
    terrainType: 'Desert Sand / Rock',
    remotenessScore: 8,
    estimatedFuelRequired: 8,
    suggestedCamps: 1,
    description: 'A historic desert road through Grand Staircase with long washboard stretches, slot canyon access, and huge empty country.',
    highlights: ['Devils Garden', 'Dance Hall Rock', 'Petrified wood fields'],
    elevationGainFt: 1800,
    estimatedDays: 1,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'desert-sand',
    startLat: 37.67,
    startLng: -111.4,
    recommendedTireSize: 31,
    recommendedLift: 0,
    terrainDifficulty: 4,
    popularityScore: 30,
    estimatedTravelHours: 5,
  },
  {
    id: 'lassen-backcountry',
    name: 'Lassen Backcountry Loop',
    region: 'Northern California',
    regionGroup: 'sierra-nevada',
    categories: ['weekend-trips', 'expeditions'],
    distanceMiles: 78,
    terrainType: 'Forest / Mountain',
    remotenessScore: 7,
    estimatedFuelRequired: 10,
    suggestedCamps: 2,
    description: 'A volcanic backcountry loop through Lassen National Forest with alpine lakes, pumice roads, and long forest corridors.',
    highlights: ['Volcanic mud pots', 'Hot springs', 'Alpine lake camping'],
    elevationGainFt: 5600,
    estimatedDays: 2,
    bestSeason: 'Summer / Early Fall',
    permitRequired: false,
    imageTag: 'forest-mountain',
    startLat: 40.49,
    startLng: -121.51,
    recommendedTireSize: 31,
    recommendedLift: 2,
    terrainDifficulty: 5,
    popularityScore: 15,
    estimatedTravelHours: 7,
  },
  {
    id: 'daniel-boone-backcountry',
    name: 'Daniel Boone Backcountry',
    region: 'Eastern Kentucky',
    regionGroup: 'kentucky-appalachians',
    categories: ['weekend-trips'],
    distanceMiles: 95,
    terrainType: 'Forest / Mountain',
    remotenessScore: 4,
    estimatedFuelRequired: 11,
    suggestedCamps: 2,
    description: 'A web of forest roads through Daniel Boone National Forest with ridgelines, creek crossings, and Appalachian hollows.',
    highlights: ['Red River Gorge approach', 'Creek fords', 'Remote hollow camping'],
    elevationGainFt: 5400,
    estimatedDays: 2,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'forest-mountain',
    startLat: 37.8,
    startLng: -83.67,
    recommendedTireSize: 31,
    recommendedLift: 2,
    terrainDifficulty: 4,
    popularityScore: 20,
    estimatedTravelHours: 8,
  },
  {
    id: 'gila-river-route',
    name: 'Gila River Route',
    region: 'Gila National Forest, New Mexico',
    regionGroup: 'new-mexico',
    categories: ['weekend-trips', 'expeditions'],
    distanceMiles: 110,
    terrainType: 'Desert Canyon',
    remotenessScore: 8,
    estimatedFuelRequired: 14,
    suggestedCamps: 2,
    description: 'A remote route through the Gila following river canyons, hot springs, and high-desert forest transitions.',
    highlights: ['Gila Cliff Dwellings', 'Natural hot springs', 'River canyon crossings'],
    elevationGainFt: 6800,
    estimatedDays: 2,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'desert-canyon',
    startLat: 33.23,
    startLng: -108.21,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 6,
    popularityScore: 15,
    estimatedTravelHours: 9,
  },
  {
    id: 'oregon-bdr-south',
    name: 'Oregon BDR (South Section)',
    region: 'Southern Oregon',
    regionGroup: 'oregon-cascades',
    categories: ['expeditions'],
    distanceMiles: 280,
    terrainType: 'Forest / Mountain',
    remotenessScore: 7,
    estimatedFuelRequired: 28,
    suggestedCamps: 5,
    description: 'A long backcountry section through Cascade volcanic country, forests, and high-desert transitions.',
    highlights: ['Crater Lake approach', 'Cascade peaks', 'High desert plateaus'],
    elevationGainFt: 14000,
    estimatedDays: 5,
    bestSeason: 'Summer / Early Fall',
    permitRequired: false,
    imageTag: 'forest-mountain',
    startLat: 42.15,
    startLng: -122.15,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 5,
    popularityScore: 35,
    estimatedTravelHours: 24,
  },
  {
    id: 'nevada-bdr',
    name: 'Nevada BDR',
    region: 'Central Nevada',
    regionGroup: 'great-basin',
    categories: ['expeditions', 'remote-routes'],
    distanceMiles: 350,
    terrainType: 'Desert Sand / Rock',
    remotenessScore: 9,
    estimatedFuelRequired: 35,
    suggestedCamps: 6,
    description: 'A full-scale backcountry traverse across Nevada basin-and-range country, ghost towns, and broad empty valleys.',
    highlights: ['Ghost towns', 'Dark-sky basins', 'Big mileage desert corridors'],
    elevationGainFt: 18000,
    estimatedDays: 6,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'desert-sand',
    startLat: 39.5,
    startLng: -117.5,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 6,
    popularityScore: 25,
    estimatedTravelHours: 30,
  },
  {
    id: 'montana-bdr-north',
    name: 'Montana BDR (North Section)',
    region: 'Northern Montana',
    regionGroup: 'idaho-montana',
    categories: ['expeditions', 'remote-routes'],
    distanceMiles: 240,
    terrainType: 'Forest / Mountain',
    remotenessScore: 8,
    estimatedFuelRequired: 24,
    suggestedCamps: 4,
    description: 'A northern Rockies section with long forest miles, mountain rivers, and serious isolation.',
    highlights: ['Glacier approach roads', 'Pristine rivers', 'Northern Rockies panoramas'],
    elevationGainFt: 16000,
    estimatedDays: 4,
    bestSeason: 'Summer',
    permitRequired: false,
    imageTag: 'alpine-mountain',
    startLat: 48.2,
    startLng: -113.5,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 6,
    popularityScore: 30,
    estimatedTravelHours: 20,
  },
  {
    id: 'canyonlands-maze',
    name: 'Canyonlands Maze District',
    region: 'Maze District, Utah',
    regionGroup: 'utah-canyonlands',
    categories: ['remote-routes'],
    distanceMiles: 48,
    terrainType: 'Desert Canyon',
    remotenessScore: 10,
    estimatedFuelRequired: 8,
    suggestedCamps: 2,
    description: 'An extremely isolated Canyonlands route with permit controls, true self-sufficiency requirements, and technical desert travel.',
    highlights: ['Maze Overlook', 'Harvest Scene pictographs', 'Absolute desert solitude'],
    elevationGainFt: 3200,
    estimatedDays: 2,
    bestSeason: 'Spring / Fall',
    permitRequired: true,
    imageTag: 'desert-canyon',
    startLat: 38.32,
    startLng: -110.18,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 7,
    popularityScore: 15,
    estimatedTravelHours: 8,
  },
  {
    id: 'owyhee-canyonlands',
    name: 'Owyhee Canyonlands',
    region: 'Owyhee County, Idaho',
    regionGroup: 'idaho-montana',
    categories: ['remote-routes'],
    distanceMiles: 180,
    terrainType: 'Desert Canyon',
    remotenessScore: 9,
    estimatedFuelRequired: 20,
    suggestedCamps: 3,
    description: 'A vast desert canyon landscape with rhyolite walls, hot springs, and long stretches of zero-service country.',
    highlights: ['Bruneau Canyon overlook', 'Natural hot springs', 'Zero cell coverage'],
    elevationGainFt: 7600,
    estimatedDays: 3,
    bestSeason: 'Spring / Fall',
    permitRequired: false,
    imageTag: 'desert-canyon',
    startLat: 42.75,
    startLng: -116.1,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 6,
    popularityScore: 8,
    estimatedTravelHours: 16,
  },
  {
    id: 'alvord-desert-loop',
    name: 'Alvord Desert Loop',
    region: 'Southeastern Oregon',
    regionGroup: 'oregon-cascades',
    categories: ['weekend-trips', 'remote-routes'],
    distanceMiles: 120,
    terrainType: 'Desert Sand / Rock',
    remotenessScore: 9,
    estimatedFuelRequired: 15,
    suggestedCamps: 2,
    description: 'A remote desert loop mixing playa miles, hot springs, and the high escarpment around Steens Mountain.',
    highlights: ['Alvord playa', 'Steens summit', 'Wildhorse hot springs'],
    elevationGainFt: 6400,
    estimatedDays: 2,
    bestSeason: 'Summer / Fall',
    permitRequired: false,
    imageTag: 'desert-sand',
    startLat: 42.55,
    startLng: -118.55,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 5,
    popularityScore: 12,
    estimatedTravelHours: 10,
  },
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeCategory(raw: unknown): SupportedCategory | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? null;
}

function clampCount(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 4;
  return Math.min(Math.max(Math.round(value), 1), MAX_COUNT);
}

function clampRadius(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_RADIUS_MILES;
  return Math.min(Math.max(Math.round(value), 25), 750);
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeVehicleScore(route: RouteSeed, vehicleType: string, vehicleBuild: string) {
  const normalizedType = vehicleType.trim().toLowerCase();
  const normalizedBuild = vehicleBuild.trim().toLowerCase();
  let score = 0;

  if (normalizedType.includes('jeep') || normalizedType.includes('bronco')) score += 7;
  if (normalizedType.includes('truck')) score += 5;
  if (normalizedType.includes('van')) score -= 4;
  if (normalizedBuild.includes('overland')) score += 4;
  if (normalizedBuild.includes('lift')) score += 3;
  if (normalizedBuild.includes('stock')) score -= 2;

  const difficulty = route.terrainDifficulty ?? 5;
  if ((normalizedType.includes('van') || normalizedBuild.includes('stock')) && difficulty >= 7) score -= 6;
  if ((normalizedType.includes('jeep') || normalizedType.includes('truck')) && difficulty >= 6) score += 2;

  return score;
}

function confidenceForRoute(route: RouteSeed, distanceFromUserMiles: number): AIRouteConfidence {
  if (route.remotenessScore >= 9 || route.permitRequired) return 'good';
  if (distanceFromUserMiles <= 180 && (route.popularityScore ?? 30) <= 35) return 'high';
  if ((route.popularityScore ?? 30) <= 20) return 'good';
  return 'explore';
}

function buildCautionNotes(route: RouteSeed) {
  const notes: string[] = [];
  if (route.permitRequired) notes.push('Permit window and district access rules should be confirmed before departure.');
  if ((route.terrainDifficulty ?? 0) >= 7) notes.push('Technical terrain or exposure may require higher-clearance recovery planning.');
  if (route.remotenessScore >= 9) notes.push('Fuel, water, and communications margins should be treated as critical.');
  if (!notes.length) notes.push('Verify seasonal access, recent trail conditions, and service availability before committing.');
  return notes.join(' ');
}

function buildCampSuitability(route: RouteSeed) {
  if (route.suggestedCamps >= 4) {
    return 'Strong camp potential with multiple dispersed-stop options across the route.';
  }
  if (route.suggestedCamps >= 2) {
    return 'Good overnight suitability with a few practical camp windows and recovery margin.';
  }
  if (route.suggestedCamps === 1) {
    return 'Limited but workable camp opportunity; plan the overnight stop deliberately.';
  }
  return 'Best treated as a push route or paired with camp plans outside the main trail corridor.';
}

function buildSummary(route: RouteSeed, category: SupportedCategory) {
  const categoryLead =
    category === 'day-trips'
      ? 'A focused day route with fast payoff and low setup friction.'
      : category === 'weekend-trips'
      ? 'A balanced overnight-ready route with enough depth to feel like a real escape.'
      : category === 'expeditions'
      ? 'A longer-form backcountry run with enough scale for a true expedition push.'
      : 'A high-isolation route where self-sufficiency and conservative planning matter.';

  return `${categoryLead} ${route.description}`;
}

function scoreRoute(
  route: RouteSeed,
  category: SupportedCategory,
  latitude: number,
  longitude: number,
  vehicleType: string,
  vehicleBuild: string,
) {
  const distanceFromUserMiles = haversineDistanceMiles(latitude, longitude, route.startLat, route.startLng);
  const distancePenalty = Math.min(distanceFromUserMiles / 30, 18);
  const categoryAffinity = route.categories.includes(category) ? 18 : 0;
  const remotenessAffinity =
    category === 'remote-routes'
      ? route.remotenessScore * 3
      : category === 'expeditions'
      ? route.estimatedDays * 4 + route.remotenessScore
      : category === 'weekend-trips'
      ? Math.max(0, 14 - Math.abs(route.estimatedDays - 2) * 5)
      : Math.max(0, 12 - Math.abs(route.estimatedDays - 1) * 6);
  const vehicleScore = computeVehicleScore(route, vehicleType, vehicleBuild);
  const popularityBoost = Math.max(0, 18 - (route.popularityScore ?? 35) / 3);
  const totalScore = categoryAffinity + remotenessAffinity + vehicleScore + popularityBoost - distancePenalty;

  return { distanceFromUserMiles, totalScore };
}

function toResponseRoute(
  route: RouteSeed,
  category: SupportedCategory,
  generatedAt: string,
  distanceFromUserMiles: number,
): ResponseRoute {
  const confidence = confidenceForRoute(route, distanceFromUserMiles);
  return {
    ...route,
    hiddenGem: (route.popularityScore ?? 100) <= 20,
    isAIGenerated: true,
    confidence,
    suggestedLabel: CATEGORY_LABELS[category],
    expeditionSummary: buildSummary(route, category),
    cautionNotes: buildCautionNotes(route),
    campSuitability: buildCampSuitability(route),
    generatedAt,
    distanceFromUserMiles: Math.round(distanceFromUserMiles),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const requestId = crypto.randomUUID();

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const category = normalizeCategory(body.category);
    const radiusMiles = clampRadius(body.radiusMiles);
    const count = clampCount(body.count);
    const vehicleType = typeof body.vehicleType === 'string' ? body.vehicleType : '';
    const vehicleBuild = typeof body.vehicleBuild === 'string' ? body.vehicleBuild : '';
    const existingRouteNames = new Set(normalizeStringArray(body.existingRouteNames).map(normalizeName));

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return jsonResponse({ ok: false, error: 'Invalid latitude', requestId }, 400);
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return jsonResponse({ ok: false, error: 'Invalid longitude', requestId }, 400);
    }
    if (!category) {
      return jsonResponse(
        {
          ok: false,
          error: 'Unsupported category. Expected day-trips, weekend-trips, expeditions, or remote-routes.',
          requestId,
        },
        400,
      );
    }

    const generatedAt = new Date().toISOString();
    const ranked = ROUTE_CATALOG
      .filter((route) => route.categories.includes(category))
      .filter((route) => !existingRouteNames.has(normalizeName(route.name)))
      .map((route) => ({
        route,
        ...scoreRoute(route, category, latitude, longitude, vehicleType, vehicleBuild),
      }))
      .filter((entry) => entry.distanceFromUserMiles <= Math.max(radiusMiles * 2.25, 120))
      .sort((left, right) => {
        if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
        return left.distanceFromUserMiles - right.distanceFromUserMiles;
      })
      .slice(0, count);

    const routes = ranked.map((entry) =>
      toResponseRoute(entry.route, category, generatedAt, entry.distanceFromUserMiles),
    );

    return jsonResponse({
      routes,
      category,
      radiusMiles,
      generatedAt,
      meta: {
        mode: 'catalog-recovery',
        reason: routes.length > 0 ? 'curated_hidden_gems' : 'no_candidates_after_filters',
        requestId,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected AI route suggestion failure';
    return jsonResponse({ ok: false, error: message, requestId }, 500);
  }
});
