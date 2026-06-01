export type RouteCatalogPresetSearchAreaKey =
  | 'tahoe_nf'
  | 'mendocino_nf'
  | 'san_juan_nf'
  | 'coconino_nf'
  | 'manti_la_sal_nf'
  | 'sawtooth_nf'
  | 'deschutes_nf'
  | 'kaibab_nf'
  | 'prescott_nf'
  | 'gila_nf'
  | 'santa_fe_nf'
  | 'carson_nf'
  | 'rio_grande_nf'
  | 'gmug_nf'
  | 'humboldt_toiyabe_nf'
  | 'pike_san_isabel_nf'
  | 'inyo_nf'
  | 'plumas_nf'
  | 'lassen_nf'
  | 'shasta_trinity_nf'
  | 'umpqua_nf'
  | 'fremont_winema_nf'
  | 'idaho_panhandle_nf'
  | 'helena_lewis_clark_nf'
  | 'fishlake_nf'
  | 'black_hills_nf'
  | 'uinta_wasatch_cache_nf'
  | 'caribou_targhee_nf'
  | 'klamath_nf'
  | 'willamette_nf'
  | 'boise_nf'
  | 'lolo_nf'
  | 'salmon_challis_nf'
  | 'stanislaus_nf'
  | 'dixie_nf'
  | 'bitterroot_nf'
  | 'mt_hood_nf'
  | 'coronado_nf'
  | 'sierra_nf'
  | 'blm_az_gtlf'
  | 'blm_ca_nv_gtlf'
  | 'blm_co_gtlf'
  | 'blm_id_gtlf'
  | 'blm_mt_gtlf'
  | 'blm_nm_gtlf'
  | 'blm_ut_gtlf';

export type RouteCatalogSearchAreaSource = 'selected_search_area' | 'manual_search_center' | 'live_gps';
export type RouteCatalogCoveragePosture =
  | 'verified_recommendation'
  | 'official_curation'
  | 'supplemental_context';

export type RouteCatalogSearchArea = {
  key: RouteCatalogPresetSearchAreaKey | 'manual_search_center' | 'live_gps';
  label: string;
  shortLabel: string;
  latitude: number;
  longitude: number;
  source: RouteCatalogSearchAreaSource;
};

export type RouteCatalogPresetSearchArea = Omit<RouteCatalogSearchArea, 'key' | 'source'> & {
  key: RouteCatalogPresetSearchAreaKey;
  source: 'selected_search_area';
  coveragePosture: 'verified_recommendation';
  publicRecommendation: true;
  sourceAdapters: string[];
};

export type RouteCatalogCoverageArea = {
  key: string;
  label: string;
  shortLabel: string;
  latitude: number | null;
  longitude: number | null;
  coveragePosture: RouteCatalogCoveragePosture;
  publicRecommendation: boolean;
  sourceAdapters: string[];
};

export type ManualRouteCatalogSearchAreaInput = {
  label?: string | null;
  coordinateText: string;
};

export type ManualRouteCatalogSearchAreaResult =
  | { ok: true; area: RouteCatalogSearchArea }
  | { ok: false; error: string };

const CONUS_BOUNDS = {
  minLatitude: 24.396308,
  maxLatitude: 49.384358,
  minLongitude: -124.848974,
  maxLongitude: -66.885444,
};

export const ROUTE_CATALOG_COVERAGE_AREAS: RouteCatalogCoverageArea[] = [
  {
    key: 'tahoe_nf',
    label: 'Tahoe National Forest',
    shortLabel: 'Tahoe NF',
    latitude: 39.305,
    longitude: -120.49,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'mendocino_nf',
    label: 'Mendocino National Forest',
    shortLabel: 'Mendocino NF',
    latitude: 39.605,
    longitude: -122.835,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'san_juan_nf',
    label: 'San Juan National Forest',
    shortLabel: 'San Juan NF',
    latitude: 37.45,
    longitude: -107.8,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'coconino_nf',
    label: 'Coconino National Forest',
    shortLabel: 'Coconino NF',
    latitude: 35.22,
    longitude: -111.65,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'manti_la_sal_nf',
    label: 'Manti-La Sal National Forest',
    shortLabel: 'Manti-La Sal NF',
    latitude: 38.55,
    longitude: -109.55,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'sawtooth_nf',
    label: 'Sawtooth National Forest',
    shortLabel: 'Sawtooth NF',
    latitude: 43.9,
    longitude: -114.8,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'deschutes_nf',
    label: 'Deschutes National Forest',
    shortLabel: 'Deschutes NF',
    latitude: 43.9,
    longitude: -121.6,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'kaibab_nf',
    label: 'Kaibab National Forest',
    shortLabel: 'Kaibab NF',
    latitude: 35.98,
    longitude: -112.15,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'prescott_nf',
    label: 'Prescott National Forest',
    shortLabel: 'Prescott NF',
    latitude: 34.64,
    longitude: -112.42,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'gila_nf',
    label: 'Gila National Forest',
    shortLabel: 'Gila NF',
    latitude: 33.37,
    longitude: -108.34,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'santa_fe_nf',
    label: 'Santa Fe National Forest',
    shortLabel: 'Santa Fe NF',
    latitude: 35.88,
    longitude: -106.11,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'carson_nf',
    label: 'Carson National Forest',
    shortLabel: 'Carson NF',
    latitude: 36.51,
    longitude: -106.19,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'rio_grande_nf',
    label: 'Rio Grande National Forest',
    shortLabel: 'Rio Grande NF',
    latitude: 37.72,
    longitude: -106.53,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'gmug_nf',
    label: 'Grand Mesa, Uncompahgre and Gunnison National Forests',
    shortLabel: 'GMUG NF',
    latitude: 38.42,
    longitude: -107.56,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'humboldt_toiyabe_nf',
    label: 'Humboldt-Toiyabe National Forest',
    shortLabel: 'Humboldt-Toiyabe NF',
    latitude: 38.95,
    longitude: -117.08,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'pike_san_isabel_nf',
    label: 'Pike and San Isabel National Forests',
    shortLabel: 'Pike-San Isabel NF',
    latitude: 38.43,
    longitude: -104.05,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'inyo_nf',
    label: 'Inyo National Forest',
    shortLabel: 'Inyo NF',
    latitude: 37.51,
    longitude: -118.55,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'plumas_nf',
    label: 'Plumas National Forest',
    shortLabel: 'Plumas NF',
    latitude: 39.9,
    longitude: -120.91,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'lassen_nf',
    label: 'Lassen National Forest',
    shortLabel: 'Lassen NF',
    latitude: 40.32,
    longitude: -121.47,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'shasta_trinity_nf',
    label: 'Shasta-Trinity National Forest',
    shortLabel: 'Shasta-Trinity NF',
    latitude: 40.88,
    longitude: -122.41,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'umpqua_nf',
    label: 'Umpqua National Forest',
    shortLabel: 'Umpqua NF',
    latitude: 43.28,
    longitude: -122.59,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'fremont_winema_nf',
    label: 'Fremont-Winema National Forest',
    shortLabel: 'Fremont-Winema NF',
    latitude: 42.52,
    longitude: -121.05,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'idaho_panhandle_nf',
    label: 'Idaho Panhandle National Forests',
    shortLabel: 'Idaho Panhandle NF',
    latitude: 47.94,
    longitude: -116.22,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'helena_lewis_clark_nf',
    label: 'Helena-Lewis and Clark National Forest',
    shortLabel: 'Helena-Lewis Clark NF',
    latitude: 46.6,
    longitude: -111.32,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'fishlake_nf',
    label: 'Fishlake National Forest',
    shortLabel: 'Fishlake NF',
    latitude: 38.59,
    longitude: -112.01,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'black_hills_nf',
    label: 'Black Hills National Forest',
    shortLabel: 'Black Hills NF',
    latitude: 44.02,
    longitude: -103.77,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'uinta_wasatch_cache_nf',
    label: 'Uinta-Wasatch-Cache National Forest',
    shortLabel: 'Uinta-Wasatch-Cache NF',
    latitude: 40.51,
    longitude: -111.41,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'caribou_targhee_nf',
    label: 'Caribou-Targhee National Forest',
    shortLabel: 'Caribou-Targhee NF',
    latitude: 43.64,
    longitude: -111.22,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'klamath_nf',
    label: 'Klamath National Forest',
    shortLabel: 'Klamath NF',
    latitude: 41.62,
    longitude: -123,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'willamette_nf',
    label: 'Willamette National Forest',
    shortLabel: 'Willamette NF',
    latitude: 44.25,
    longitude: -122.15,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'boise_nf',
    label: 'Boise National Forest',
    shortLabel: 'Boise NF',
    latitude: 44.08,
    longitude: -115.56,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'lolo_nf',
    label: 'Lolo National Forest',
    shortLabel: 'Lolo NF',
    latitude: 47.05,
    longitude: -114.75,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'salmon_challis_nf',
    label: 'Salmon-Challis National Forest',
    shortLabel: 'Salmon-Challis NF',
    latitude: 45.15,
    longitude: -114,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'stanislaus_nf',
    label: 'Stanislaus National Forest',
    shortLabel: 'Stanislaus NF',
    latitude: 38.24,
    longitude: -120,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'dixie_nf',
    label: 'Dixie National Forest',
    shortLabel: 'Dixie NF',
    latitude: 37.7,
    longitude: -112.65,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'bitterroot_nf',
    label: 'Bitterroot National Forest',
    shortLabel: 'Bitterroot NF',
    latitude: 45.85,
    longitude: -114.1,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'mt_hood_nf',
    label: 'Mt. Hood National Forest',
    shortLabel: 'Mt. Hood NF',
    latitude: 45.35,
    longitude: -121.75,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'coronado_nf',
    label: 'Coronado National Forest',
    shortLabel: 'Coronado NF',
    latitude: 32.36,
    longitude: -110.25,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'sierra_nf',
    label: 'Sierra National Forest',
    shortLabel: 'Sierra NF',
    latitude: 37.1,
    longitude: -119.2,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'michigan_orv',
    label: 'Michigan DNR ORV',
    shortLabel: 'Michigan ORV',
    latitude: null,
    longitude: null,
    coveragePosture: 'official_curation',
    publicRecommendation: false,
    sourceAdapters: ['michigan_dnr_orv_gpx'],
  },
  {
    key: 'minnesota_ohv',
    label: 'Minnesota DNR OHV',
    shortLabel: 'Minnesota OHV',
    latitude: null,
    longitude: null,
    coveragePosture: 'official_curation',
    publicRecommendation: false,
    sourceAdapters: ['minnesota_dnr_ohv_trails'],
  },
  {
    key: 'oregon_odf_ohv',
    label: 'Oregon ODF OHV',
    shortLabel: 'Oregon ODF',
    latitude: null,
    longitude: null,
    coveragePosture: 'official_curation',
    publicRecommendation: false,
    sourceAdapters: ['oregon_odf_ohv_gpx'],
  },
  {
    key: 'blm_az_gtlf',
    label: 'BLM GTLF Arizona',
    shortLabel: 'BLM AZ',
    latitude: 33.31,
    longitude: -111.73,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_ca_nv_gtlf',
    label: 'BLM GTLF CA/NV',
    shortLabel: 'BLM CA/NV',
    latitude: 36.45,
    longitude: -116.85,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_co_gtlf',
    label: 'BLM GTLF Colorado',
    shortLabel: 'BLM CO',
    latitude: 38.58,
    longitude: -105.89,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_id_gtlf',
    label: 'BLM GTLF Idaho',
    shortLabel: 'BLM ID',
    latitude: 43.11,
    longitude: -116.3,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_mt_gtlf',
    label: 'BLM GTLF Montana',
    shortLabel: 'BLM MT',
    latitude: 47.01,
    longitude: -109.82,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_nm_gtlf',
    label: 'BLM GTLF New Mexico',
    shortLabel: 'BLM NM',
    latitude: 33.65,
    longitude: -107.37,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_ut_gtlf',
    label: 'BLM GTLF Utah',
    shortLabel: 'BLM UT',
    latitude: 37.37,
    longitude: -111.78,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_wy_gtlf',
    label: 'BLM GTLF Wyoming',
    shortLabel: 'BLM WY',
    latitude: 44.51,
    longitude: -107.94,
    coveragePosture: 'official_curation',
    publicRecommendation: false,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'usgs_nps_context',
    label: 'USGS/NPS public trail context',
    shortLabel: 'USGS/NPS',
    latitude: null,
    longitude: null,
    coveragePosture: 'supplemental_context',
    publicRecommendation: false,
    sourceAdapters: ['usgs_trails', 'nps_public_trails'],
  },
];

export const ROUTE_CATALOG_PRESET_SEARCH_AREAS: RouteCatalogPresetSearchArea[] = ROUTE_CATALOG_COVERAGE_AREAS
  .filter((area): area is RouteCatalogCoverageArea & {
    key: RouteCatalogPresetSearchAreaKey;
    latitude: number;
    longitude: number;
    coveragePosture: 'verified_recommendation';
    publicRecommendation: true;
  } =>
    area.publicRecommendation === true &&
    area.coveragePosture === 'verified_recommendation' &&
    typeof area.latitude === 'number' &&
    typeof area.longitude === 'number',
  )
  .map((area) => ({
    key: area.key,
    label: area.label,
    shortLabel: area.shortLabel,
    latitude: area.latitude,
    longitude: area.longitude,
    source: 'selected_search_area',
    coveragePosture: area.coveragePosture,
    publicRecommendation: true,
    sourceAdapters: area.sourceAdapters,
  }));

export const ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS = ROUTE_CATALOG_PRESET_SEARCH_AREAS
  .filter((area) => area.coveragePosture === 'verified_recommendation')
  .map((area) => area.label);

export const ROUTE_CATALOG_CURATION_COVERAGE_LABELS = ROUTE_CATALOG_COVERAGE_AREAS
  .filter((area) => area.coveragePosture === 'official_curation')
  .map((area) => area.label);

function joinCoverageLabels(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none yet';
}

export function getRouteCatalogCoverageSummary(): string {
  return `Verified recommendation coverage: ${joinCoverageLabels(ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS)}. In curation: ${joinCoverageLabels(ROUTE_CATALOG_CURATION_COVERAGE_LABELS)}. No demo routes are used.`;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function cleanLabel(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function shortLabelForManualCenter(label: string, latitude: number, longitude: number): string {
  if (label) return label.slice(0, 24);
  return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}

export function isRouteCatalogCoordinateInConus(coordinate: {
  latitude: number;
  longitude: number;
}): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= CONUS_BOUNDS.minLatitude &&
    coordinate.latitude <= CONUS_BOUNDS.maxLatitude &&
    coordinate.longitude >= CONUS_BOUNDS.minLongitude &&
    coordinate.longitude <= CONUS_BOUNDS.maxLongitude
  );
}

export function parseRouteCatalogCoordinateText(value: string): { latitude: number; longitude: number } | null {
  const matches = String(value ?? '').match(/[-+]?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const latitude = Number(matches[0]);
  const longitude = Number(matches[1]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

export function buildManualRouteCatalogSearchArea(
  input: ManualRouteCatalogSearchAreaInput,
): ManualRouteCatalogSearchAreaResult {
  const coordinate = parseRouteCatalogCoordinateText(input.coordinateText);
  if (!coordinate) {
    return {
      ok: false,
      error: 'Enter coordinates as latitude, longitude.',
    };
  }

  if (!isRouteCatalogCoordinateInConus(coordinate)) {
    return {
      ok: false,
      error: 'Search center must be in the contiguous United States.',
    };
  }

  const label = cleanLabel(input.label) || 'Manual Search Center';
  return {
    ok: true,
    area: {
      key: 'manual_search_center',
      label,
      shortLabel: shortLabelForManualCenter(label, coordinate.latitude, coordinate.longitude),
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      source: 'manual_search_center',
    },
  };
}

export function getRouteCatalogCoverageNotice(area: RouteCatalogSearchArea | null | undefined): string {
  if (!area) {
    return `${getRouteCatalogCoverageSummary()} Select GPS or a CONUS search center to search within radius.`;
  }

  if (area.source === 'selected_search_area') {
    return `Verified recommendation coverage is active for ${area.label}.`;
  }

  if (area.source === 'manual_search_center') {
    return 'Manual CONUS center searches the live catalog within radius. Verified routes only appear where ECS has synced and reviewed source-backed coverage. No demo routes are used.';
  }

  return 'GPS searches the live catalog within radius. Verified routes only appear where ECS has synced and reviewed source-backed coverage. No demo routes are used.';
}
