import { parseGeoFile, type GpxWaypoint } from './gpxParser';
import { getPinTypeMeta, type PinSeverity, type PinType } from '../components/navigate/PinTypes';

export interface GpxPinImportWaypoint {
  type: PinType;
  lat: number;
  lng: number;
  title: string;
  notes: string;
  sourceType: 'gpx_waypoint';
  originalType: string | null;
  originalSymbol: string | null;
  recordedAt: string | null;
  elevationFt: number | null;
  severity: PinSeverity | null;
}

export interface GpxPinImportResult {
  fileName: string;
  parsedName: string;
  pins: GpxPinImportWaypoint[];
  waypointCount: number;
  routeCount: number;
  trackCount: number;
  ignoredRoutePointCount: number;
  ignoredTrackPointCount: number;
  sourceApp: string | null;
}

const TYPE_KEYWORDS: Array<{ type: PinType; keywords: string[] }> = [
  {
    type: 'medical',
    keywords: ['medical', 'medic', 'medkit', 'first aid', 'hospital', 'clinic', 'injury'],
  },
  {
    type: 'mechanical',
    keywords: ['mechanical', 'repair', 'mechanic', 'garage', 'tire', 'tyre', 'breakdown', 'service'],
  },
  {
    type: 'recovery',
    keywords: ['recovery', 'winch', 'tow', 'stuck', 'extract', 'extraction'],
  },
  {
    type: 'hazard',
    keywords: ['hazard', 'danger', 'warning', 'washout', 'blocked', 'closed', 'slide', 'ledge', 'caution'],
  },
  {
    type: 'camp',
    keywords: ['camp', 'campsite', 'campground', 'tent', 'shelter', 'lodge', 'bivouac'],
  },
  {
    type: 'fuel',
    keywords: ['fuel', 'gas', 'diesel', 'petrol', 'station', 'propane'],
  },
  {
    type: 'water',
    keywords: ['water', 'spring', 'creek', 'river', 'well', 'hydration', 'potable'],
  },
  {
    type: 'poi',
    keywords: ['poi', 'view', 'vista', 'overlook', 'photo', 'trailhead', 'point of interest'],
  },
];

function isFiniteLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isFiniteLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function waypointSearchText(waypoint: GpxWaypoint): string {
  return [
    waypoint.name,
    waypoint.description,
    waypoint.symbol,
    waypoint.type,
  ]
    .map((value) => clean(value)?.toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function inferPinType(waypoint: GpxWaypoint): PinType {
  const text = waypointSearchText(waypoint);
  if (!text) return 'poi';

  const match = TYPE_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => text.includes(keyword)),
  );
  return match?.type ?? 'poi';
}

function inferSeverity(type: PinType, waypoint: GpxWaypoint): PinSeverity | null {
  if (!['hazard', 'recovery', 'medical', 'mechanical'].includes(type)) return null;

  const text = waypointSearchText(waypoint);
  if (['critical', 'severe', 'danger', 'blocked', 'closed', 'injury'].some((term) => text.includes(term))) {
    return 'high';
  }
  if (['warning', 'caution', 'washout', 'stuck', 'repair'].some((term) => text.includes(term))) {
    return 'med';
  }
  return 'low';
}

function buildNotes(
  fileName: string,
  waypoint: GpxWaypoint,
  sourceApp: string | null,
  ignoredRoutePointCount: number,
  ignoredTrackPointCount: number,
): string {
  const lines = [
    `Imported from ${fileName}`,
    sourceApp ? `Source app: ${sourceApp}` : null,
    clean(waypoint.description),
    waypoint.eleFt != null ? `Elevation: ${Math.round(waypoint.eleFt)} ft` : null,
    clean(waypoint.symbol) ? `GPX symbol: ${clean(waypoint.symbol)}` : null,
    clean(waypoint.type) ? `GPX type: ${clean(waypoint.type)}` : null,
    waypoint.time ? `Recorded: ${waypoint.time}` : null,
    ignoredRoutePointCount > 0 || ignoredTrackPointCount > 0
      ? 'Route and track geometry in this file was ignored by the Pins import.'
      : null,
  ];
  return lines.filter(Boolean).join('\n');
}

export function parseGpxPinWaypoints(fileName: string, content: string): GpxPinImportResult {
  const parsed = parseGeoFile(fileName, content);
  const ignoredRoutePointCount = parsed.routes.reduce((total, route) => total + route.points.length, 0);
  const ignoredTrackPointCount = parsed.tracks.reduce(
    (total, track) => total + track.segments.reduce((segmentTotal, segment) => segmentTotal + segment.points.length, 0),
    0,
  );
  const sourceApp = parsed.source.detectedApp ?? null;

  const pins = parsed.waypoints
    .filter((waypoint) => isFiniteLatitude(waypoint.lat) && isFiniteLongitude(waypoint.lon))
    .map((waypoint) => {
      const type = inferPinType(waypoint);
      const meta = getPinTypeMeta(type);
      return {
        type,
        lat: waypoint.lat,
        lng: waypoint.lon,
        title: clean(waypoint.name) ?? meta.defaultTitle,
        notes: buildNotes(fileName, waypoint, sourceApp, ignoredRoutePointCount, ignoredTrackPointCount),
        sourceType: 'gpx_waypoint' as const,
        originalType: clean(waypoint.type),
        originalSymbol: clean(waypoint.symbol),
        recordedAt: waypoint.time,
        elevationFt: waypoint.eleFt,
        severity: inferSeverity(type, waypoint),
      };
    });

  return {
    fileName,
    parsedName: parsed.name,
    pins,
    waypointCount: parsed.waypoints.length,
    routeCount: parsed.routes.length,
    trackCount: parsed.tracks.length,
    ignoredRoutePointCount,
    ignoredTrackPointCount,
    sourceApp,
  };
}
