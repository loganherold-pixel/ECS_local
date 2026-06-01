export type RouteCatalogPresetSearchAreaKey =
  | 'tahoe_nf'
  | 'mendocino_nf'
  | 'san_juan_nf'
  | 'coconino_nf'
  | 'manti_la_sal_nf'
  | 'sawtooth_nf'
  | 'deschutes_nf';

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
    key: 'blm_gtlf',
    label: 'BLM GTLF',
    shortLabel: 'BLM GTLF',
    latitude: null,
    longitude: null,
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
