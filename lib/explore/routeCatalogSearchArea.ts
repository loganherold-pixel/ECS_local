export type RouteCatalogPresetSearchAreaKey = 'tahoe_nf' | 'mendocino_nf';

export type RouteCatalogSearchAreaSource = 'selected_search_area' | 'manual_search_center' | 'live_gps';

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

export const ROUTE_CATALOG_PRESET_SEARCH_AREAS: RouteCatalogPresetSearchArea[] = [
  {
    key: 'tahoe_nf',
    label: 'Tahoe National Forest',
    shortLabel: 'Tahoe NF',
    latitude: 39.305,
    longitude: -120.49,
    source: 'selected_search_area',
    coveragePosture: 'verified_recommendation',
  },
  {
    key: 'mendocino_nf',
    label: 'Mendocino National Forest',
    shortLabel: 'Mendocino NF',
    latitude: 39.605,
    longitude: -122.835,
    source: 'selected_search_area',
    coveragePosture: 'verified_recommendation',
  },
];

export const ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS = ROUTE_CATALOG_PRESET_SEARCH_AREAS
  .filter((area) => area.coveragePosture === 'verified_recommendation')
  .map((area) => area.label);

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
    return `Verified recommendation coverage: ${ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS.join(', ')}. Select GPS or a CONUS search center to search within radius.`;
  }

  if (area.source === 'selected_search_area') {
    return `Verified recommendation coverage is active for ${area.label}.`;
  }

  if (area.source === 'manual_search_center') {
    return 'Manual CONUS center searches the live catalog within radius. Verified routes only appear where ECS has synced and reviewed source-backed coverage. No demo routes are used.';
  }

  return 'GPS searches the live catalog within radius. Verified routes only appear where ECS has synced and reviewed source-backed coverage. No demo routes are used.';
}
