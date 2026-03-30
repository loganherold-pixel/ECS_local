// ============================================================
// REMOTE EXPLORER ENGINE — Remote Zone Discovery
// ============================================================
// Returns remote exploration zones for the Discover tab.
// Zones represent areas with high remoteness, public land
// access, and potential expedition routes.
//
// Phase 4: Remote Explorer Integration
//
// Each zone includes:
//   - Isolation score (1–10)
//   - Nearest town distance
//   - Terrain type
//   - Suggested camps
//   - Optional rig compatibility (via Rig Compatibility Engine)
//
// Zones function independently — no route or expedition required.
// ============================================================

import {
  calculateRigCompatibility,
  type VehicleProfile,
  type CompatibilityResult,
  type CompatibilityExpedition,
} from './rigCompatibilityEngine';

const TAG = '[REMOTE-EXPLORER]';

// ── Remote Zone Model ────────────────────────────────────────
export interface RemoteZone {
  id: string;
  name: string;
  isolationScore: number;         // 1–10 scale
  nearestTownMiles: number;
  terrainType: string;
  suggestedCamps: number;
  rigCompatibility?: number;      // 0–100 (filled by engine)
  // ── Extended metadata ──
  region: string;
  description: string;
  highlights: string[];
  accessType: 'public' | 'blm' | 'usfs' | 'nps' | 'mixed';
  elevationRangeFt: [number, number];  // [min, max]
  bestSeason: string;
  waterSources: number;           // known water sources in zone
  cellCoverage: 'none' | 'minimal' | 'partial' | 'good';
  estimatedAcres: number;
  latitude: number;
  longitude: number;
  // ── Rig compatibility internals ──
  estimatedDistanceMiles: number; // typical traverse distance
  estimatedFuelRequired: number;  // gallons for typical traverse
  estimatedElevationGainFt: number;
  difficultyRating?: string;
}

// ── Seed Remote Zone Dataset ─────────────────────────────────
const SEED_REMOTE_ZONES: RemoteZone[] = [
  {
    id: 'utah-desert-basin',
    name: 'Utah Desert Basin',
    region: 'San Rafael Swell, Utah',
    isolationScore: 9.2,
    nearestTownMiles: 74,
    terrainType: 'Desert Wash',
    suggestedCamps: 4,
    description:
      'A vast expanse of eroded sandstone in central Utah. The San Rafael Swell offers deep slot canyons, ancient rock art, and complete isolation from developed infrastructure. BLM land with dispersed camping throughout.',
    highlights: [
      'Slot canyon networks',
      'Petroglyphs and pictographs',
      'Goblin Valley formations',
      'Black Dragon Wash',
    ],
    accessType: 'blm',
    elevationRangeFt: [4200, 7200],
    bestSeason: 'Spring / Fall',
    waterSources: 1,
    cellCoverage: 'none',
    estimatedAcres: 620000,
    latitude: 38.85,
    longitude: -110.68,
    estimatedDistanceMiles: 120,
    estimatedFuelRequired: 14,
    estimatedElevationGainFt: 4800,
  },
  {
    id: 'nevada-basin-range',
    name: 'Nevada Basin & Range',
    region: 'Central Nevada',
    isolationScore: 9.8,
    nearestTownMiles: 112,
    terrainType: 'Desert / Mountain',
    suggestedCamps: 5,
    description:
      'The loneliest stretch of the American West. Basin and range topography creates parallel mountain ridges separated by vast alkali flats. Minimal human presence, zero cell service, and the darkest night skies in the lower 48.',
    highlights: [
      'Extraterrestrial Highway corridor',
      'Hot springs in remote valleys',
      'Pristine dark sky viewing',
      'Historic mining ghost towns',
    ],
    accessType: 'blm',
    elevationRangeFt: [4800, 9400],
    bestSeason: 'Spring / Fall',
    waterSources: 2,
    cellCoverage: 'none',
    estimatedAcres: 1200000,
    latitude: 38.42,
    longitude: -116.85,
    estimatedDistanceMiles: 200,
    estimatedFuelRequired: 24,
    estimatedElevationGainFt: 7200,
  },
  {
    id: 'owyhee-canyonlands',
    name: 'Owyhee Canyonlands',
    region: 'Southwest Idaho / Oregon',
    isolationScore: 9.0,
    nearestTownMiles: 86,
    terrainType: 'Canyon / Desert',
    suggestedCamps: 3,
    description:
      'A labyrinth of deep basalt canyons carved by the Owyhee River system. One of the most remote and least-visited wilderness areas in the contiguous US. Rugged two-track access only.',
    highlights: [
      'Deep basalt river canyons',
      'Wild horse herds',
      'Natural hot springs',
      'Ancient volcanic formations',
    ],
    accessType: 'blm',
    elevationRangeFt: [3200, 6800],
    bestSeason: 'Late Spring / Early Fall',
    waterSources: 3,
    cellCoverage: 'none',
    estimatedAcres: 500000,
    latitude: 42.65,
    longitude: -116.95,
    estimatedDistanceMiles: 90,
    estimatedFuelRequired: 12,
    estimatedElevationGainFt: 5400,
  },
  {
    id: 'gila-wilderness',
    name: 'Gila Wilderness Fringe',
    region: 'Southwest New Mexico',
    isolationScore: 8.4,
    nearestTownMiles: 62,
    terrainType: 'Forest / Canyon',
    suggestedCamps: 3,
    description:
      'The perimeter of America\'s first designated wilderness area. Ponderosa pine forests transition to deep river canyons with natural hot springs. USFS roads provide access to the wilderness boundary.',
    highlights: [
      'Gila Cliff Dwellings approach',
      'Natural hot springs',
      'Ponderosa pine forests',
      'Middle Fork Gila River',
    ],
    accessType: 'usfs',
    elevationRangeFt: [5400, 8900],
    bestSeason: 'Spring / Fall',
    waterSources: 5,
    cellCoverage: 'minimal',
    estimatedAcres: 340000,
    latitude: 33.22,
    longitude: -108.55,
    estimatedDistanceMiles: 75,
    estimatedFuelRequired: 10,
    estimatedElevationGainFt: 6200,
  },
  {
    id: 'montana-breaks',
    name: 'Missouri Breaks',
    region: 'Central Montana',
    isolationScore: 8.8,
    nearestTownMiles: 78,
    terrainType: 'Grassland / Canyon',
    suggestedCamps: 4,
    description:
      'Dramatic badlands along the Wild and Scenic Missouri River. Lewis and Clark passed through this landscape, which remains largely unchanged. BLM backcountry roads wind through eroded coulees and prairie grasslands.',
    highlights: [
      'Lewis & Clark historic corridor',
      'Badlands formations',
      'Prairie wildlife viewing',
      'Missouri River access points',
    ],
    accessType: 'blm',
    elevationRangeFt: [2400, 4200],
    bestSeason: 'Summer / Early Fall',
    waterSources: 4,
    cellCoverage: 'minimal',
    estimatedAcres: 380000,
    latitude: 47.75,
    longitude: -109.40,
    estimatedDistanceMiles: 110,
    estimatedFuelRequired: 13,
    estimatedElevationGainFt: 3600,
  },
  {
    id: 'death-valley-backcountry',
    name: 'Death Valley Backcountry',
    region: 'Inyo County, California',
    isolationScore: 9.5,
    nearestTownMiles: 95,
    terrainType: 'Desert Sand / Rock',
    suggestedCamps: 3,
    description:
      'The extreme backcountry roads of Death Valley National Park. Titus Canyon, Racetrack Playa, and the remote Eureka Dunes offer some of the most challenging and rewarding overlanding in North America.',
    highlights: [
      'Racetrack Playa sailing stones',
      'Titus Canyon narrows',
      'Eureka Sand Dunes',
      'Ubehebe volcanic crater',
    ],
    accessType: 'nps',
    elevationRangeFt: [-282, 5100],
    bestSeason: 'Winter / Early Spring',
    waterSources: 0,
    cellCoverage: 'none',
    estimatedAcres: 3400000,
    latitude: 36.50,
    longitude: -117.08,
    estimatedDistanceMiles: 140,
    estimatedFuelRequired: 18,
    estimatedElevationGainFt: 6800,
  },
  {
    id: 'olympic-peninsula-backcountry',
    name: 'Olympic Peninsula Backcountry',
    region: 'Northwest Washington',
    isolationScore: 7.6,
    nearestTownMiles: 48,
    terrainType: 'Forest / Alpine',
    suggestedCamps: 3,
    description:
      'USFS roads penetrate deep into the temperate rainforest surrounding Olympic National Park. Moss-draped old-growth forests, alpine meadows, and wild Pacific coastline create a unique multi-terrain exploration zone.',
    highlights: [
      'Old-growth rainforest canopy',
      'Alpine wildflower meadows',
      'Wild Pacific coastline',
      'Quinault River valley',
    ],
    accessType: 'usfs',
    elevationRangeFt: [200, 6200],
    bestSeason: 'Summer / Early Fall',
    waterSources: 8,
    cellCoverage: 'partial',
    estimatedAcres: 280000,
    latitude: 47.80,
    longitude: -123.60,
    estimatedDistanceMiles: 85,
    estimatedFuelRequired: 10,
    estimatedElevationGainFt: 5800,
  },
  {
    id: 'big-bend-backcountry',
    name: 'Big Bend Backcountry',
    region: 'West Texas',
    isolationScore: 8.6,
    nearestTownMiles: 70,
    terrainType: 'Desert / Mountain',
    suggestedCamps: 4,
    description:
      'The remote desert backcountry roads of Big Bend National Park and the surrounding BLM lands along the Rio Grande. Chihuahuan Desert landscapes with dramatic mountain formations and river canyons.',
    highlights: [
      'Rio Grande river canyons',
      'Chisos Mountains basin',
      'Desert hot springs',
      'Mariscal Canyon overlooks',
    ],
    accessType: 'mixed',
    elevationRangeFt: [1800, 7800],
    bestSeason: 'Winter / Spring',
    waterSources: 2,
    cellCoverage: 'minimal',
    estimatedAcres: 800000,
    latitude: 29.25,
    longitude: -103.25,
    estimatedDistanceMiles: 100,
    estimatedFuelRequired: 13,
    estimatedElevationGainFt: 5200,
  },
];

// ============================================================
// LOAD REMOTE ZONES
// ============================================================

/**
 * Load all remote exploration zones (no vehicle scoring).
 */
export function loadRemoteZones(): RemoteZone[] {
  console.log(TAG, `Loading ${SEED_REMOTE_ZONES.length} remote zones`);
  return [...SEED_REMOTE_ZONES];
}

/**
 * Load remote zones with rig compatibility scoring.
 * Zones are sorted by isolation score (highest first) by default.
 */
export function loadRemoteZonesWithCompatibility(
  profile: VehicleProfile | null,
): {
  zones: RemoteZone[];
  results: Map<string, CompatibilityResult>;
} {
  const zones = [...SEED_REMOTE_ZONES];
  const results = new Map<string, CompatibilityResult>();

  if (!profile) {
    console.log(TAG, 'No vehicle profile — returning zones without compatibility');
    zones.sort((a, b) => b.isolationScore - a.isolationScore);
    return { zones, results };
  }

  // Score each zone against the vehicle
  for (const zone of zones) {
    const expedition: CompatibilityExpedition = {
      id: zone.id,
      name: zone.name,
      distanceMiles: zone.estimatedDistanceMiles,
      terrainType: zone.terrainType,
      remotenessScore: zone.isolationScore,
      estimatedFuelRequired: zone.estimatedFuelRequired,
      elevationGainFt: zone.estimatedElevationGainFt,
    };

    const result = calculateRigCompatibility(profile, expedition);
    results.set(zone.id, result);
    zone.rigCompatibility = result.score;
    zone.difficultyRating = result.difficultyRating;
  }

  // Sort by isolation score (highest first)
  zones.sort((a, b) => b.isolationScore - a.isolationScore);

  console.log(TAG, `Scored ${zones.length} zones — highest isolation: ${zones[0]?.name} (${zones[0]?.isolationScore})`);
  return { zones, results };
}

/**
 * Get a single remote zone by ID.
 */
export function getRemoteZoneById(id: string): RemoteZone | null {
  return SEED_REMOTE_ZONES.find(z => z.id === id) ?? null;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Get display label for access type.
 */
export function getAccessTypeLabel(accessType: RemoteZone['accessType']): string {
  switch (accessType) {
    case 'blm':   return 'BLM PUBLIC LAND';
    case 'usfs':  return 'USFS NATIONAL FOREST';
    case 'nps':   return 'NATIONAL PARK';
    case 'mixed': return 'MIXED ACCESS';
    default:      return 'PUBLIC LAND';
  }
}

/**
 * Get accent color for access type.
 */
export function getAccessTypeColor(accessType: RemoteZone['accessType']): string {
  switch (accessType) {
    case 'blm':   return 'rgba(200, 150, 60, 0.75)';
    case 'usfs':  return 'rgba(80, 170, 120, 0.75)';
    case 'nps':   return 'rgba(100, 160, 220, 0.75)';
    case 'mixed': return 'rgba(140, 140, 100, 0.75)';
    default:      return 'rgba(138, 138, 133, 0.60)';
  }
}

/**
 * Get cell coverage label.
 */
export function getCellCoverageLabel(coverage: RemoteZone['cellCoverage']): string {
  switch (coverage) {
    case 'none':    return 'NO SIGNAL';
    case 'minimal': return 'MINIMAL';
    case 'partial': return 'PARTIAL';
    case 'good':    return 'GOOD';
    default:        return 'UNKNOWN';
  }
}

/**
 * Get cell coverage color.
 */
export function getCellCoverageColor(coverage: RemoteZone['cellCoverage']): string {
  switch (coverage) {
    case 'none':    return '#E04030';
    case 'minimal': return '#E67E22';
    case 'partial': return '#D4A017';
    case 'good':    return '#66BB6A';
    default:        return '#8B949E';
  }
}

/**
 * Get isolation score color.
 */
export function getIsolationColor(score: number): string {
  if (score >= 9)  return '#E04030';
  if (score >= 8)  return '#E67E22';
  if (score >= 7)  return '#D4A017';
  if (score >= 5)  return '#8B949E';
  return '#5A6370';
}

/**
 * Get isolation label.
 */
export function getIsolationLabel(score: number): string {
  if (score >= 9)  return 'EXTREME';
  if (score >= 8)  return 'VERY HIGH';
  if (score >= 7)  return 'HIGH';
  if (score >= 5)  return 'MODERATE';
  return 'LOW';
}

/**
 * Filter zones by terrain type keyword.
 */
export function filterZonesByTerrain(zones: RemoteZone[], terrain: string): RemoteZone[] {
  const keyword = terrain.toLowerCase();
  return zones.filter(z => z.terrainType.toLowerCase().includes(keyword));
}

