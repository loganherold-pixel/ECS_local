/**
 * Offline-First Route Store
 *
 * Stores imported routes (GPX/KML/GeoJSON) locally.
 * Supports setting active route, basic GPX parsing,
 * KML import via kmlParser, GeoJSON import via geojsonParser,
 * and sync to cloud when authenticated.
 *
 * All routes work offline.
 */
import { Platform } from 'react-native';
import type { LocalSyncStatus } from './loadoutStore';
import type { RouteWaypointType } from './waypointTypes';
import { parseKML, type KmlParseResult } from './kmlParser';
import { parseGeoJSON, type GeoJsonParseResult, type GeoJsonWaypoint, type GeoJsonRoute } from './geojsonParser';


// ── Storage helpers ─────────────────────────────────────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  memoryStore[key] = value;
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceId(): string {
  const key = 'ecs_device_id';
  let id = lsGet(key);
  if (!id) {
    id = generateId();
    lsSet(key, id);
  }
  return id;
}

const nowISO = () => new Date().toISOString();

// ── Types ───────────────────────────────────────────────

export interface RouteWaypoint {
  lat: number;
  lon: number;
  ele: number | null;
  name: string | null;
  time: string | null;
  /** Optional waypoint type classification */
  waypointType?: RouteWaypointType | null;
}


export interface RouteSegment {
  points: { lat: number; lon: number; ele: number | null }[];
}

export type RouteSourceFormat = 'gpx' | 'kml' | 'kmz' | 'fit' | 'geojson' | 'custom';

export type RouteCategory = 'imported' | 'custom';

export interface ImportedRoute {
  id: string;
  user_id: string | null;
  device_id: string;
  name: string;
  description: string | null;
  source_format: RouteSourceFormat;

  source_app: string | null;
  route_category?: RouteCategory;
  linked_run_id?: string | null;
  total_distance_miles: number;
  elevation_gain_ft: number | null;
  waypoint_count: number;
  segment_count: number;
  waypoints: RouteWaypoint[];
  segments: RouteSegment[];
  is_active: boolean;
  sync_status: LocalSyncStatus;
  created_at: string;
  updated_at: string;
}

export type CustomRouteSegmentInput = {
  coordinates: [number, number][] | { latitude: number; longitude: number }[];
};

// ── Storage keys ────────────────────────────────────────
const LS_ROUTES = 'ecs_local_routes';

export type RouteStoreListener = () => void;

const routeStoreListeners = new Set<RouteStoreListener>();

function notifyRouteStoreListeners(): void {
  for (const listener of Array.from(routeStoreListeners)) {
    try {
      listener();
    } catch (error) {
      console.warn('[routeStore] route listener failed', error);
    }
  }
}

function subscribeRouteStore(listener: RouteStoreListener): () => void {
  routeStoreListeners.add(listener);
  return () => {
    routeStoreListeners.delete(listener);
  };
}

function getLocalRoutes(): ImportedRoute[] {
  const raw = lsGet(LS_ROUTES);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveLocalRoutes(routes: ImportedRoute[]): void {
  const nextValue = JSON.stringify(routes);
  const previousValue = lsGet(LS_ROUTES);
  lsSet(LS_ROUTES, nextValue);
  if (previousValue !== nextValue) {
    notifyRouteStoreListeners();
  }
}

function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function normalizeCustomRouteSegment(input: CustomRouteSegmentInput): RouteSegment | null {
  const points: RouteSegment['points'] = [];
  for (const raw of input.coordinates || []) {
    const lon = Array.isArray(raw) ? Number(raw[0]) : Number(raw.longitude);
    const lat = Array.isArray(raw) ? Number(raw[1]) : Number(raw.latitude);
    if (!isValidLatLon(lat, lon)) continue;

    const previous = points[points.length - 1];
    if (previous && previous.lat === lat && previous.lon === lon) continue;

    points.push({ lat, lon, ele: null });
  }

  return points.length > 1 ? { points } : null;
}

function countRoutePoints(segments: RouteSegment[]): number {
  return segments.reduce((count, segment) => count + segment.points.length, 0);
}

function computeRouteDistanceMiles(segments: RouteSegment[]): number {
  let totalDistanceMiles = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.points.length; index += 1) {
      const previous = segment.points[index - 1];
      const next = segment.points[index];
      totalDistanceMiles += haversineDistance(previous.lat, previous.lon, next.lat, next.lon);
    }
  }
  return Math.round(totalDistanceMiles * 100) / 100;
}

function nextCustomRouteName(): string {
  const existingNames = new Set(
    getLocalRoutes()
      .filter((route) => route.route_category === 'custom' || route.source_format === 'custom')
      .map((route) => route.name.trim().toLowerCase()),
  );

  let index = 1;
  while (index < 1000) {
    const candidate = `Custom Route ${String(index).padStart(2, '0')}`;
    if (!existingNames.has(candidate.toLowerCase())) return candidate;
    index += 1;
  }

  return `Custom Route ${new Date().toISOString().slice(0, 10)}`;
}

// ── GPX Parser ──────────────────────────────────────────

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseGPX(xmlString: string): {
  name: string;
  waypoints: RouteWaypoint[];
  segments: RouteSegment[];
  totalDistanceMiles: number;
  elevationGainFt: number | null;
} {
  // Simple XML parsing without DOMParser dependency issues
  const getName = (xml: string): string => {
    const match = xml.match(/<metadata[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/);
    if (match) return match[1].trim();
    const nameMatch = xml.match(/<trk[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/);
    if (nameMatch) return nameMatch[1].trim();
    return 'Imported Route';
  };

  const name = getName(xmlString);

  // Parse waypoints (<wpt>)
  const waypoints: RouteWaypoint[] = [];
  const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/gi;
  let wptMatch;
  while ((wptMatch = wptRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(wptMatch[1]);
    const lon = parseFloat(wptMatch[2]);
    const inner = wptMatch[3];
    const eleMatch = inner.match(/<ele>([\s\S]*?)<\/ele>/);
    const nameMatch = inner.match(/<name>([\s\S]*?)<\/name>/);
    const timeMatch = inner.match(/<time>([\s\S]*?)<\/time>/);
    waypoints.push({
      lat, lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) : null,
      name: nameMatch ? nameMatch[1].trim() : null,
      time: timeMatch ? timeMatch[1].trim() : null,
    });
  }

  // Parse track segments (<trkseg>)
  const segments: RouteSegment[] = [];
  const segRegex = /<trkseg>([\s\S]*?)<\/trkseg>/gi;
  let segMatch;
  while ((segMatch = segRegex.exec(xmlString)) !== null) {
    const segContent = segMatch[1];
    const points: { lat: number; lon: number; ele: number | null }[] = [];
    const ptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
    let ptMatch;
    while ((ptMatch = ptRegex.exec(segContent)) !== null) {
      const lat = parseFloat(ptMatch[1]);
      const lon = parseFloat(ptMatch[2]);
      const inner = ptMatch[3];
      const eleMatch = inner.match(/<ele>([\s\S]*?)<\/ele>/);
      points.push({
        lat, lon,
        ele: eleMatch ? parseFloat(eleMatch[1]) : null,
      });
    }
    if (points.length > 0) segments.push({ points });
  }

  // Also parse <rte> (route points)
  const rteRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/gi;
  const rtePoints: { lat: number; lon: number; ele: number | null }[] = [];
  let rteMatch;
  while ((rteMatch = rteRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(rteMatch[1]);
    const lon = parseFloat(rteMatch[2]);
    const inner = rteMatch[3];
    const eleMatch = inner.match(/<ele>([\s\S]*?)<\/ele>/);
    rtePoints.push({
      lat, lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) : null,
    });
  }
  if (rtePoints.length > 0) segments.push({ points: rtePoints });

  // Calculate total distance
  let totalDistanceMiles = 0;
  let elevationGainFt: number | null = null;
  let totalEleGain = 0;
  let hasElevation = false;

  for (const seg of segments) {
    for (let i = 1; i < seg.points.length; i++) {
      const p1 = seg.points[i - 1];
      const p2 = seg.points[i];
      totalDistanceMiles += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);

      if (p1.ele != null && p2.ele != null) {
        hasElevation = true;
        const diff = p2.ele - p1.ele;
        if (diff > 0) totalEleGain += diff;
      }
    }
  }

  if (hasElevation) {
    elevationGainFt = Math.round(totalEleGain * 3.281); // meters to feet
  }

  return {
    name,
    waypoints,
    segments,
    totalDistanceMiles: Math.round(totalDistanceMiles * 100) / 100,
    elevationGainFt,
  };
}

// ── Route Store ─────────────────────────────────────────

export const routeStore = {
  subscribe: subscribeRouteStore,

  getAll: (): ImportedRoute[] => {
    return getLocalRoutes().sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  },

  getCustomRoutes: (): ImportedRoute[] => {
    return getLocalRoutes()
      .filter((route) => route.route_category === 'custom' || route.source_format === 'custom')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  },

  getActive: (): ImportedRoute | null => {
    return getLocalRoutes().find(r => r.is_active) || null;
  },

  getById: (id: string): ImportedRoute | null => {
    return getLocalRoutes().find(r => r.id === id) || null;
  },

  createCustomRoute: (
    segmentsInput: CustomRouteSegmentInput[],
    options?: { name?: string; description?: string | null },
  ): ImportedRoute => {
    const segments = segmentsInput
      .map(normalizeCustomRouteSegment)
      .filter((segment): segment is RouteSegment => !!segment);

    if (segments.length === 0 || countRoutePoints(segments) < 2) {
      throw new Error('Custom route requires at least two valid points.');
    }

    const now = nowISO();
    const deviceId = getDeviceId();
    const route: ImportedRoute = {
      id: generateId(),
      user_id: null,
      device_id: deviceId,
      name: options?.name?.trim() || nextCustomRouteName(),
      description: options?.description ?? 'User-built route traced in ECS Build Route.',
      source_format: 'custom',
      source_app: 'ecs_route_builder',
      route_category: 'custom',
      linked_run_id: null,
      total_distance_miles: computeRouteDistanceMiles(segments),
      elevation_gain_ft: null,
      waypoint_count: 0,
      segment_count: segments.length,
      waypoints: [],
      segments,
      is_active: false,
      sync_status: 'local',
      created_at: now,
      updated_at: now,
    };

    const routes = getLocalRoutes();
    routes.push(route);
    saveLocalRoutes(routes);

    return route;
  },

  /**
   * Import a GPX file and save locally
   */
  importGPX: (gpxContent: string, sourceApp?: string): ImportedRoute => {
    const parsed = parseGPX(gpxContent);
    const now = nowISO();
    const deviceId = getDeviceId();

    const route: ImportedRoute = {
      id: generateId(),
      user_id: null,
      device_id: deviceId,
      name: parsed.name,
      description: null,
      source_format: 'gpx',
      source_app: sourceApp || null,
      total_distance_miles: parsed.totalDistanceMiles,
      elevation_gain_ft: parsed.elevationGainFt,
      waypoint_count: parsed.waypoints.length,
      segment_count: parsed.segments.length,
      waypoints: parsed.waypoints,
      segments: parsed.segments,
      is_active: false,
      sync_status: 'local',
      created_at: now,
      updated_at: now,
    };

    const routes = getLocalRoutes();
    routes.push(route);
    saveLocalRoutes(routes);

    return route;
  },

  /**
   * Import a KML file and save locally.
   *
   * Parses the KML via kmlParser.parseKML(), converts KmlWaypoint[]
   * → RouteWaypoint[] and KmlRoute[] → RouteSegment[], computes
   * distance/elevation, and persists as an ImportedRoute with
   * source_format 'kml'.
   *
   * KML coordinates are [lon, lat, alt] — this method swaps to
   * the RouteWaypoint/RouteSegment convention of { lat, lon, ele }.
   */
  importKML: (kmlContent: string, sourceApp?: string): ImportedRoute => {
    const parsed: KmlParseResult = parseKML(kmlContent);
    const now = nowISO();
    const deviceId = getDeviceId();

    // ── Convert KmlWaypoint[] → RouteWaypoint[] ─────────
    const waypoints: RouteWaypoint[] = parsed.waypoints.map(wp => ({
      lat: wp.lat,
      lon: wp.lon,
      ele: wp.ele,
      name: wp.name,
      time: null,
      waypointType: null,
    }));

    // ── Convert KmlRoute[] → RouteSegment[] ─────────────
    // Each KmlRoute becomes one RouteSegment. KML coordinates
    // are stored as [lon, lat, alt] arrays.
    const segments: RouteSegment[] = parsed.routes.map(kmlRoute => ({
      points: kmlRoute.coordinates.map(coord => ({
        lat: coord[1],       // KML coord[1] = latitude
        lon: coord[0],       // KML coord[0] = longitude
        ele: coord.length > 2 && isFinite(coord[2]) ? coord[2] : null,
      })),
    }));

    // ── Compute total distance and elevation gain ───────
    let totalDistanceMiles = 0;
    let totalEleGain = 0;
    let hasElevation = false;

    for (const seg of segments) {
      for (let i = 1; i < seg.points.length; i++) {
        const p1 = seg.points[i - 1];
        const p2 = seg.points[i];
        totalDistanceMiles += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);

        if (p1.ele != null && p2.ele != null) {
          hasElevation = true;
          const diff = p2.ele - p1.ele;
          if (diff > 0) totalEleGain += diff;
        }
      }
    }

    const elevationGainFt = hasElevation
      ? Math.round(totalEleGain * 3.281)
      : null;

    const route: ImportedRoute = {
      id: generateId(),
      user_id: null,
      device_id: deviceId,
      name: parsed.name || 'Imported KML',
      description: parsed.description || null,
      source_format: 'kml',
      source_app: sourceApp || parsed.source.detectedApp || null,
      total_distance_miles: Math.round(totalDistanceMiles * 100) / 100,
      elevation_gain_ft: elevationGainFt,
      waypoint_count: waypoints.length,
      segment_count: segments.length,
      waypoints,
      segments,
      is_active: false,
      sync_status: 'local',
      created_at: now,
      updated_at: now,
    };

    const routes = getLocalRoutes();
    routes.push(route);
    saveLocalRoutes(routes);

    return route;
  },

  /**
   * Import a GeoJSON file and save locally.
   *
   * Parses the GeoJSON via geojsonParser.parseGeoJSON(), converts
   * GeoJsonWaypoint[] (Point features) → RouteWaypoint[] and
   * GeoJsonRoute[] (LineString/MultiLineString/Polygon features)
   * → RouteSegment[], computes distance/elevation, and persists
   * as an ImportedRoute with source_format 'geojson'.
   *
   * GeoJSON coordinates are [lon, lat, ele?] per RFC 7946 — this
   * method swaps to the RouteWaypoint/RouteSegment convention of
   * { lat, lon, ele }.
   */
  importGeoJSON: (geojsonContent: string, sourceApp?: string): ImportedRoute => {
    const parsed: GeoJsonParseResult = parseGeoJSON(geojsonContent);
    const now = nowISO();
    const deviceId = getDeviceId();

    // ── Convert GeoJsonWaypoint[] → RouteWaypoint[] ─────
    // Point features become waypoints with ele in meters
    const waypoints: RouteWaypoint[] = parsed.waypoints.map((wp: GeoJsonWaypoint) => ({
      lat: wp.lat,
      lon: wp.lon,
      ele: wp.ele,                     // already in meters (or null)
      name: wp.name,
      time: null,
      waypointType: null,
    }));

    // ── Convert GeoJsonRoute[] → RouteSegment[] ─────────
    // Each GeoJsonRoute has a raw GeoJSON geometry. We extract
    // coordinate arrays from LineString, MultiLineString, and
    // Polygon geometries and convert [lon, lat, ele?] → { lat, lon, ele }.
    const segments: RouteSegment[] = [];

    for (const gjRoute of parsed.routes) {
      const geom = gjRoute.geometry;
      if (!geom || !geom.type || !geom.coordinates) continue;

      switch (geom.type) {
        case 'LineString': {
          // coordinates: number[][] — each [lon, lat, ele?]
          const points = (geom.coordinates as number[][]).map((coord: number[]) => ({
            lat: coord[1],
            lon: coord[0],
            ele: coord.length > 2 && isFinite(coord[2]) ? coord[2] : null,
          }));
          if (points.length > 0) segments.push({ points });
          break;
        }

        case 'MultiLineString': {
          // coordinates: number[][][] — array of line arrays
          for (const line of geom.coordinates as number[][][]) {
            const points = line.map((coord: number[]) => ({
              lat: coord[1],
              lon: coord[0],
              ele: coord.length > 2 && isFinite(coord[2]) ? coord[2] : null,
            }));
            if (points.length > 0) segments.push({ points });
          }
          break;
        }

        case 'Polygon': {
          // coordinates: number[][][] — first ring is outer boundary
          const outerRing = (geom.coordinates as number[][][])[0];
          if (outerRing && outerRing.length > 0) {
            const points = outerRing.map((coord: number[]) => ({
              lat: coord[1],
              lon: coord[0],
              ele: coord.length > 2 && isFinite(coord[2]) ? coord[2] : null,
            }));
            segments.push({ points });
          }
          break;
        }

        case 'MultiPolygon': {
          // coordinates: number[][][][] — array of polygon arrays
          for (const polygon of geom.coordinates as number[][][][]) {
            const outerRing = polygon[0];
            if (outerRing && outerRing.length > 0) {
              const points = outerRing.map((coord: number[]) => ({
                lat: coord[1],
                lon: coord[0],
                ele: coord.length > 2 && isFinite(coord[2]) ? coord[2] : null,
              }));
              segments.push({ points });
            }
          }
          break;
        }
      }
    }

    // ── Compute total distance and elevation gain ───────
    let totalDistanceMiles = 0;
    let totalEleGain = 0;
    let hasElevation = false;

    for (const seg of segments) {
      for (let i = 1; i < seg.points.length; i++) {
        const p1 = seg.points[i - 1];
        const p2 = seg.points[i];
        totalDistanceMiles += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);

        if (p1.ele != null && p2.ele != null) {
          hasElevation = true;
          const diff = p2.ele - p1.ele;
          if (diff > 0) totalEleGain += diff;
        }
      }
    }

    const elevationGainFt = hasElevation
      ? Math.round(totalEleGain * 3.281)  // meters → feet
      : null;

    const route: ImportedRoute = {
      id: generateId(),
      user_id: null,
      device_id: deviceId,
      name: parsed.name || 'Imported GeoJSON',
      description: parsed.description || null,
      source_format: 'geojson',
      source_app: sourceApp || parsed.source.detectedApp || null,
      total_distance_miles: Math.round(totalDistanceMiles * 100) / 100,
      elevation_gain_ft: elevationGainFt,
      waypoint_count: waypoints.length,
      segment_count: segments.length,
      waypoints,
      segments,
      is_active: false,
      sync_status: 'local',
      created_at: now,
      updated_at: now,
    };

    const routes = getLocalRoutes();
    routes.push(route);
    saveLocalRoutes(routes);

    return route;
  },


  /**
   * Set a route as active (deactivates all others)
   */

  setActive: (routeId: string): void => {
    const routes = getLocalRoutes();
    for (const r of routes) {
      r.is_active = r.id === routeId;
      if (r.id === routeId) r.updated_at = nowISO();
    }
    saveLocalRoutes(routes);
  },

  /**
   * Deactivate all routes
   */
  deactivateAll: (): void => {
    const routes = getLocalRoutes();
    for (const r of routes) r.is_active = false;
    saveLocalRoutes(routes);
  },

  /**
   * Delete a route
   */
  delete: (routeId: string): void => {
    const routes = getLocalRoutes().filter(r => r.id !== routeId);
    saveLocalRoutes(routes);
  },


  /**
   * Update route name/description
   */
  update: (routeId: string, changes: { name?: string; description?: string }): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;

    if (changes.name) routes[idx].name = changes.name;
    if (changes.description !== undefined) routes[idx].description = changes.description;
    routes[idx].updated_at = nowISO();
    routes[idx].sync_status = routes[idx].sync_status === 'synced' ? 'pending' : routes[idx].sync_status;

    saveLocalRoutes(routes);
    return routes[idx];
  },

  attachRun: (routeId: string, runId: string): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;

    routes[idx].linked_run_id = runId;
    routes[idx].updated_at = nowISO();
    saveLocalRoutes(routes);
    return routes[idx];
  },

  /**
   * Rename a waypoint within a route
   */
  renameWaypoint: (routeId: string, waypointIndex: number, newName: string): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;
    const route = routes[idx];
    if (waypointIndex < 0 || waypointIndex >= route.waypoints.length) return null;

    route.waypoints[waypointIndex].name = newName || null;
    route.updated_at = nowISO();
    route.sync_status = route.sync_status === 'synced' ? 'pending' : route.sync_status;

    saveLocalRoutes(routes);
    return route;
  },

  /**
   * Set the type classification of a waypoint within a route
   */
  setWaypointType: (
    routeId: string,
    waypointIndex: number,
    waypointType: RouteWaypointType | null
  ): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;
    const route = routes[idx];
    if (waypointIndex < 0 || waypointIndex >= route.waypoints.length) return null;

    route.waypoints[waypointIndex].waypointType = waypointType;
    route.updated_at = nowISO();
    route.sync_status = route.sync_status === 'synced' ? 'pending' : route.sync_status;

    saveLocalRoutes(routes);
    return route;
  },

  /**
   * Bulk set waypoint type for multiple waypoints at once.
   * More efficient than calling setWaypointType in a loop (single read/write).
   */
  bulkSetWaypointType: (
    routeId: string,
    waypointIndices: number[],
    waypointType: RouteWaypointType | null
  ): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;
    const route = routes[idx];

    let changed = false;
    for (const wpIdx of waypointIndices) {
      if (wpIdx >= 0 && wpIdx < route.waypoints.length) {
        route.waypoints[wpIdx].waypointType = waypointType;
        changed = true;
      }
    }

    if (changed) {
      route.updated_at = nowISO();
      route.sync_status = route.sync_status === 'synced' ? 'pending' : route.sync_status;
      saveLocalRoutes(routes);
    }

    return route;
  },




  /**
   * Delete a waypoint from a route
   */
  deleteWaypoint: (routeId: string, waypointIndex: number): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;
    const route = routes[idx];
    if (waypointIndex < 0 || waypointIndex >= route.waypoints.length) return null;

    route.waypoints.splice(waypointIndex, 1);
    route.waypoint_count = route.waypoints.length;
    route.updated_at = nowISO();
    route.sync_status = route.sync_status === 'synced' ? 'pending' : route.sync_status;

    saveLocalRoutes(routes);
    return route;
  },

  /**
   * Reorder waypoints — move waypoint from one index to another
   */
  reorderWaypoint: (routeId: string, fromIndex: number, toIndex: number): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;
    const route = routes[idx];
    if (fromIndex < 0 || fromIndex >= route.waypoints.length) return null;
    if (toIndex < 0 || toIndex >= route.waypoints.length) return null;
    if (fromIndex === toIndex) return route;

    const [moved] = route.waypoints.splice(fromIndex, 1);
    route.waypoints.splice(toIndex, 0, moved);
    route.updated_at = nowISO();
    route.sync_status = route.sync_status === 'synced' ? 'pending' : route.sync_status;

    saveLocalRoutes(routes);
    return route;
  },

  /**

   * Add a new waypoint to a route at a specific index (or append at end)
   */
  addWaypoint: (
    routeId: string,
    waypoint: RouteWaypoint,
    insertAtIndex?: number
  ): ImportedRoute | null => {
    const routes = getLocalRoutes();
    const idx = routes.findIndex(r => r.id === routeId);
    if (idx === -1) return null;
    const route = routes[idx];

    const insertIdx =
      insertAtIndex !== undefined &&
      insertAtIndex >= 0 &&
      insertAtIndex <= route.waypoints.length
        ? insertAtIndex
        : route.waypoints.length;

    route.waypoints.splice(insertIdx, 0, waypoint);
    route.waypoint_count = route.waypoints.length;
    route.updated_at = nowISO();
    route.sync_status = route.sync_status === 'synced' ? 'pending' : route.sync_status;

    saveLocalRoutes(routes);
    return route;
  },

  /**
   * Get route count
   */
  count: (): number => getLocalRoutes().length,
};


