/**
 * GPX / KML Import Parser — Expedition Command System
 *
 * Comprehensive GPX 1.1 parser that handles files from:
 *   - Garmin (Connect, BaseCamp, inReach)
 *   - Gaia GPS
 *   - CalTopo / SARTopo
 *   - AllTrails
 *   - Komoot
 *   - Strava
 *   - onX Offroad / Hunt
 *   - Google Earth (KML→GPX conversions)
 *   - OsmAnd
 *   - Avenza Maps
 *
 * Extracts:
 *   - Waypoints (<wpt>) with name, elevation, description, symbol
 *   - Track segments (<trk>/<trkseg>/<trkpt>) with elevation
 *   - Route points (<rte>/<rtept>)
 *   - Metadata (name, description, author, time, bounds)
 *   - Source app detection from <creator> and extensions
 *
 * Computes:
 *   - Total distance (haversine, miles)
 *   - Elevation gain / loss (feet)
 *   - Min / max elevation (feet)
 *   - Bounding box
 *   - Elevation profile sample points
 *   - GeoJSON conversion for EcsRoute storage
 */

// ── Types ───────────────────────────────────────────────────

export interface GpxWaypoint {
  lat: number;
  lon: number;
  ele: number | null;       // meters
  eleFt: number | null;     // feet
  name: string | null;
  description: string | null;
  time: string | null;
  symbol: string | null;
  type: string | null;
}

export interface GpxTrackPoint {
  lat: number;
  lon: number;
  ele: number | null;       // meters
  time: string | null;
}

export interface GpxTrackSegment {
  points: GpxTrackPoint[];
}

export interface GpxTrack {
  name: string | null;
  description: string | null;
  segments: GpxTrackSegment[];
}

export interface GpxRoute {
  name: string | null;
  description: string | null;
  points: GpxTrackPoint[];
}

export interface GpxBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ElevationProfilePoint {
  distanceMi: number;
  elevationFt: number | null;
}

export interface GpxSourceInfo {
  creator: string | null;
  detectedApp: string | null;
  appIcon: string;          // Ionicons name
  appColor: string;
}

export interface GpxParseResult {
  // Metadata
  name: string;
  description: string | null;
  author: string | null;
  time: string | null;
  source: GpxSourceInfo;

  // Data
  waypoints: GpxWaypoint[];
  tracks: GpxTrack[];
  routes: GpxRoute[];

  // Computed stats
  totalDistanceMi: number;
  elevationGainFt: number | null;
  elevationLossFt: number | null;
  minElevationFt: number | null;
  maxElevationFt: number | null;
  bounds: GpxBounds | null;
  totalTrackPoints: number;
  totalSegments: number;
  elevationProfile: ElevationProfilePoint[];

  // Conversion helpers
  geojson: Record<string, any>;
  estimatedEtaHours: number | null;
}

// ── Constants ───────────────────────────────────────────────

const EARTH_RADIUS_MI = 3958.8;
const M_TO_FT = 3.28084;
const MAX_ELEVATION_PROFILE_POINTS = 100;

// ── Haversine ───────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── XML Helpers ─────────────────────────────────────────────

function getTagContent(xml: string, tag: string): string | null {
  const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<(?:[\\w-]+:)?${safeTag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${safeTag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function getAttr(tag: string, attr: string): string | null {
  const safeAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${safeAttr}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = tag.match(regex);
  return match ? match[1] : null;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── Source App Detection ────────────────────────────────────

const SOURCE_PATTERNS: Array<{
  pattern: RegExp;
  app: string;
  icon: string;
  color: string;
}> = [
  { pattern: /garmin\s*connect/i, app: 'Garmin Connect', icon: 'watch-outline', color: '#007DC3' },
  { pattern: /garmin\s*basecamp/i, app: 'Garmin BaseCamp', icon: 'map-outline', color: '#007DC3' },
  { pattern: /garmin\s*inreach/i, app: 'Garmin inReach', icon: 'radio-outline', color: '#007DC3' },
  { pattern: /garmin/i, app: 'Garmin', icon: 'navigate-outline', color: '#007DC3' },
  { pattern: /gaia\s*gps/i, app: 'Gaia GPS', icon: 'compass-outline', color: '#FF6B35' },
  { pattern: /caltopo/i, app: 'CalTopo', icon: 'layers-outline', color: '#2E7D32' },
  { pattern: /sartopo/i, app: 'SARTopo', icon: 'layers-outline', color: '#2E7D32' },
  { pattern: /alltrails/i, app: 'AllTrails', icon: 'trail-sign-outline', color: '#428813' },
  { pattern: /komoot/i, app: 'Komoot', icon: 'bicycle-outline', color: '#6AA127' },
  { pattern: /strava/i, app: 'Strava', icon: 'fitness-outline', color: '#FC4C02' },
  { pattern: /onx\s*offroad/i, app: 'onX Offroad', icon: 'car-sport-outline', color: '#E85D04' },
  { pattern: /onx\s*hunt/i, app: 'onX Hunt', icon: 'leaf-outline', color: '#4A7C2E' },
  { pattern: /onx/i, app: 'onX Maps', icon: 'map-outline', color: '#E85D04' },
  { pattern: /google\s*earth/i, app: 'Google Earth', icon: 'earth-outline', color: '#4285F4' },
  { pattern: /osmand/i, app: 'OsmAnd', icon: 'globe-outline', color: '#2196F3' },
  { pattern: /avenza/i, app: 'Avenza Maps', icon: 'document-outline', color: '#1565C0' },
  { pattern: /expedition\s*command/i, app: 'ECS', icon: 'shield-outline', color: '#C48A2C' },
  { pattern: /gpx\.studio/i, app: 'GPX Studio', icon: 'create-outline', color: '#9C27B0' },
  { pattern: /ride\s*with\s*gps/i, app: 'Ride with GPS', icon: 'bicycle-outline', color: '#FF5722' },
];

function detectSource(xml: string): GpxSourceInfo {
  const creatorMatch = xml.match(/<(?:[\w-]+:)?gpx[^>]*creator\s*=\s*["']([^"']+)["']/i);
  const creator = creatorMatch ? unescapeXml(creatorMatch[1]) : null;

  if (creator) {
    for (const sp of SOURCE_PATTERNS) {
      if (sp.pattern.test(creator)) {
        return { creator, detectedApp: sp.app, appIcon: sp.icon, appColor: sp.color };
      }
    }
  }

  for (const sp of SOURCE_PATTERNS) {
    if (sp.pattern.test(xml)) {
      return { creator, detectedApp: sp.app, appIcon: sp.icon, appColor: sp.color };
    }
  }

  return {
    creator,
    detectedApp: creator || null,
    appIcon: 'document-outline',
    appColor: '#8A8A85',
  };
}

// ── Parse Waypoints ─────────────────────────────────────────

function parseWaypoints(xml: string): GpxWaypoint[] {
  const waypoints: GpxWaypoint[] = [];
  const wptRegex = /<(?:[\w-]+:)?wpt\b\s+([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?wpt>/gi;
  let match: RegExpExecArray | null;

  while ((match = wptRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const inner = match[2];

    const latStr = getAttr(attrs, 'lat');
    const lonStr = getAttr(attrs, 'lon');
    if (!latStr || !lonStr) continue;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    const eleStr = getTagContent(inner, 'ele');
    const ele = eleStr ? parseFloat(eleStr) : null;
    const eleFt = (ele != null && !isNaN(ele)) ? Math.round(ele * M_TO_FT) : null;

    const name = getTagContent(inner, 'name');
    const desc = getTagContent(inner, 'desc');
    const time = getTagContent(inner, 'time');
    const sym = getTagContent(inner, 'sym');
    const type = getTagContent(inner, 'type');

    waypoints.push({
      lat,
      lon,
      ele: (ele != null && !isNaN(ele)) ? ele : null,
      eleFt,
      name: name ? unescapeXml(name) : null,
      description: desc ? unescapeXml(desc) : null,
      time,
      symbol: sym,
      type,
    });
  }

  return waypoints;
}

// ── Normalize Track Points ──────────────────────────────────

function normalizeTrackPoints(points: GpxTrackPoint[]): GpxTrackPoint[] {
  const cleaned: GpxTrackPoint[] = [];
  let lastKey: string | null = null;

  for (const pt of points) {
    if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) continue;

    const key = `${pt.lat.toFixed(6)},${pt.lon.toFixed(6)}`;
    if (key === lastKey) continue;

    cleaned.push(pt);
    lastKey = key;
  }

  return cleaned;
}

// ── Parse Track Points ──────────────────────────────────────

function parseTrackPoints(segContent: string): GpxTrackPoint[] {
  const points: GpxTrackPoint[] = [];
  const ptRegex = /<(?:[\w-]+:)?trkpt\b\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?trkpt>)/gi;
  let match: RegExpExecArray | null;

  while ((match = ptRegex.exec(segContent)) !== null) {
    const attrs = match[1];
    const inner = match[2] || '';

    const latStr = getAttr(attrs, 'lat');
    const lonStr = getAttr(attrs, 'lon');
    if (!latStr || !lonStr) continue;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    const eleStr = getTagContent(inner, 'ele');
    const ele = eleStr ? parseFloat(eleStr) : null;

    points.push({
      lat,
      lon,
      ele: (ele != null && !isNaN(ele)) ? ele : null,
      time: getTagContent(inner, 'time'),
    });
  }

  return normalizeTrackPoints(points);
}

// ── Parse Tracks ────────────────────────────────────────────

function parseTracks(xml: string): GpxTrack[] {
  const tracks: GpxTrack[] = [];
  const trkRegex = /<(?:[\w-]+:)?trk\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?trk>/gi;
  let trkMatch: RegExpExecArray | null;

  while ((trkMatch = trkRegex.exec(xml)) !== null) {
    const trkContent = trkMatch[1];
    const name = getTagContent(trkContent, 'name');
    const desc = getTagContent(trkContent, 'desc');

    const segments: GpxTrackSegment[] = [];
    const segRegex = /<(?:[\w-]+:)?trkseg\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?trkseg>/gi;
    let segMatch: RegExpExecArray | null;

    while ((segMatch = segRegex.exec(trkContent)) !== null) {
      const points = normalizeTrackPoints(parseTrackPoints(segMatch[1]));
      if (points.length > 0) {
        segments.push({ points });
      }
    }

    if (segments.length > 0) {
      tracks.push({
        name: name ? unescapeXml(name) : null,
        description: desc ? unescapeXml(desc) : null,
        segments,
      });
    }
  }

  return tracks;
}

// ── Parse Routes (<rte>) ────────────────────────────────────

function parseRoutes(xml: string): GpxRoute[] {
  const routes: GpxRoute[] = [];
  const rteRegex = /<(?:[\w-]+:)?rte\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?rte>/gi;
  let rteMatch: RegExpExecArray | null;

  while ((rteMatch = rteRegex.exec(xml)) !== null) {
    const rteContent = rteMatch[1];
    const name = getTagContent(rteContent, 'name');
    const desc = getTagContent(rteContent, 'desc');

    const points: GpxTrackPoint[] = [];
    const ptRegex = /<(?:[\w-]+:)?rtept\b\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?rtept>)/gi;
    let ptMatch: RegExpExecArray | null;

    while ((ptMatch = ptRegex.exec(rteContent)) !== null) {
      const attrs = ptMatch[1];
      const inner = ptMatch[2] || '';

      const latStr = getAttr(attrs, 'lat');
      const lonStr = getAttr(attrs, 'lon');
      if (!latStr || !lonStr) continue;

      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (isNaN(lat) || isNaN(lon)) continue;

      const eleStr = getTagContent(inner, 'ele');
      const ele = eleStr ? parseFloat(eleStr) : null;

      points.push({
        lat,
        lon,
        ele: (ele != null && !isNaN(ele)) ? ele : null,
        time: getTagContent(inner, 'time'),
      });
    }

    const normalizedPoints = normalizeTrackPoints(points);
    if (normalizedPoints.length > 0) {
      routes.push({
        name: name ? unescapeXml(name) : null,
        description: desc ? unescapeXml(desc) : null,
        points: normalizedPoints,
      });
    }
  }

  return routes;
}

// ── Compute Stats ───────────────────────────────────────────

interface TrackStats {
  totalDistanceMi: number;
  elevationGainFt: number | null;
  elevationLossFt: number | null;
  minElevationFt: number | null;
  maxElevationFt: number | null;
  totalTrackPoints: number;
  totalSegments: number;
  elevationProfile: ElevationProfilePoint[];
}

function computeTrackStats(tracks: GpxTrack[], routes: GpxRoute[]): TrackStats {
  let totalDistanceMi = 0;
  let totalGainM = 0;
  let totalLossM = 0;
  let minEleM = Infinity;
  let maxEleM = -Infinity;
  let hasElevation = false;
  let totalTrackPoints = 0;
  let totalSegments = 0;

  const allPoints: Array<{ lat: number; lon: number; ele: number | null; cumulativeDist: number }> = [];

  for (const trk of tracks) {
    for (const seg of trk.segments) {
      totalSegments++;
      totalTrackPoints += seg.points.length;

      for (let i = 0; i < seg.points.length; i++) {
        const pt = seg.points[i];

        if (i > 0) {
          const prev = seg.points[i - 1];
          const dist = haversine(prev.lat, prev.lon, pt.lat, pt.lon);
          totalDistanceMi += dist;

          if (prev.ele != null && pt.ele != null) {
            hasElevation = true;
            const diff = pt.ele - prev.ele;
            if (diff > 0) totalGainM += diff;
            else totalLossM += Math.abs(diff);
          }
        }

        if (pt.ele != null) {
          hasElevation = true;
          minEleM = Math.min(minEleM, pt.ele);
          maxEleM = Math.max(maxEleM, pt.ele);
        }

        allPoints.push({
          lat: pt.lat,
          lon: pt.lon,
          ele: pt.ele,
          cumulativeDist: totalDistanceMi,
        });
      }
    }
  }

  for (const rte of routes) {
    totalSegments++;
    totalTrackPoints += rte.points.length;

    for (let i = 0; i < rte.points.length; i++) {
      const pt = rte.points[i];

      if (i > 0) {
        const prev = rte.points[i - 1];
        const dist = haversine(prev.lat, prev.lon, pt.lat, pt.lon);
        totalDistanceMi += dist;

        if (prev.ele != null && pt.ele != null) {
          hasElevation = true;
          const diff = pt.ele - prev.ele;
          if (diff > 0) totalGainM += diff;
          else totalLossM += Math.abs(diff);
        }
      }

      if (pt.ele != null) {
        hasElevation = true;
        minEleM = Math.min(minEleM, pt.ele);
        maxEleM = Math.max(maxEleM, pt.ele);
      }

      allPoints.push({
        lat: pt.lat,
        lon: pt.lon,
        ele: pt.ele,
        cumulativeDist: totalDistanceMi,
      });
    }
  }

  const elevationProfile: ElevationProfilePoint[] = [];
  if (allPoints.length > 0 && hasElevation) {
    const step = Math.max(1, Math.floor(allPoints.length / MAX_ELEVATION_PROFILE_POINTS));
    for (let i = 0; i < allPoints.length; i += step) {
      const pt = allPoints[i];
      elevationProfile.push({
        distanceMi: Math.round(pt.cumulativeDist * 100) / 100,
        elevationFt: pt.ele != null ? Math.round(pt.ele * M_TO_FT) : null,
      });
    }

    const last = allPoints[allPoints.length - 1];
    const lastDistance = Math.round(last.cumulativeDist * 100) / 100;
    if (elevationProfile.length === 0 || elevationProfile[elevationProfile.length - 1].distanceMi !== lastDistance) {
      elevationProfile.push({
        distanceMi: lastDistance,
        elevationFt: last.ele != null ? Math.round(last.ele * M_TO_FT) : null,
      });
    }
  }

  return {
    totalDistanceMi: Math.round(totalDistanceMi * 100) / 100,
    elevationGainFt: hasElevation ? Math.round(totalGainM * M_TO_FT) : null,
    elevationLossFt: hasElevation ? Math.round(totalLossM * M_TO_FT) : null,
    minElevationFt: hasElevation && minEleM !== Infinity ? Math.round(minEleM * M_TO_FT) : null,
    maxElevationFt: hasElevation && maxEleM !== -Infinity ? Math.round(maxEleM * M_TO_FT) : null,
    totalTrackPoints,
    totalSegments,
    elevationProfile,
  };
}

// ── Compute Bounds ──────────────────────────────────────────

function computeBounds(waypoints: GpxWaypoint[], tracks: GpxTrack[], routes: GpxRoute[]): GpxBounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let hasPoints = false;

  const addPoint = (lat: number, lon: number) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    hasPoints = true;
  };

  for (const wp of waypoints) addPoint(wp.lat, wp.lon);
  for (const trk of tracks) {
    for (const seg of trk.segments) {
      for (const pt of seg.points) addPoint(pt.lat, pt.lon);
    }
  }
  for (const rte of routes) {
    for (const pt of rte.points) addPoint(pt.lat, pt.lon);
  }

  if (!hasPoints) return null;

  return {
    minLat: parseFloat(minLat.toFixed(6)),
    maxLat: parseFloat(maxLat.toFixed(6)),
    minLon: parseFloat(minLon.toFixed(6)),
    maxLon: parseFloat(maxLon.toFixed(6)),
  };
}

// ── GeoJSON Conversion ──────────────────────────────────────

function toGeoJSON(tracks: GpxTrack[], routes: GpxRoute[], waypoints: GpxWaypoint[]): Record<string, any> {
  const features: any[] = [];

  for (const trk of tracks) {
    if (trk.segments.length === 1) {
      const coords = trk.segments[0].points.map(pt =>
        pt.ele != null ? [pt.lon, pt.lat, pt.ele] : [pt.lon, pt.lat]
      );
      features.push({
        type: 'Feature',
        properties: {
          name: trk.name,
          description: trk.description,
          featureType: 'track',
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      });
    } else if (trk.segments.length > 1) {
      const coords = trk.segments.map(seg =>
        seg.points.map(pt =>
          pt.ele != null ? [pt.lon, pt.lat, pt.ele] : [pt.lon, pt.lat]
        )
      );
      features.push({
        type: 'Feature',
        properties: {
          name: trk.name,
          description: trk.description,
          featureType: 'track',
        },
        geometry: {
          type: 'MultiLineString',
          coordinates: coords,
        },
      });
    }
  }

  for (const rte of routes) {
    const coords = rte.points.map(pt =>
      pt.ele != null ? [pt.lon, pt.lat, pt.ele] : [pt.lon, pt.lat]
    );
    features.push({
      type: 'Feature',
      properties: {
        name: rte.name,
        description: rte.description,
        featureType: 'route',
      },
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    });
  }

  for (const wp of waypoints) {
    const coords = wp.ele != null ? [wp.lon, wp.lat, wp.ele] : [wp.lon, wp.lat];
    features.push({
      type: 'Feature',
      properties: {
        name: wp.name,
        description: wp.description,
        symbol: wp.symbol,
        waypointType: wp.type,
        featureType: 'waypoint',
      },
      geometry: {
        type: 'Point',
        coordinates: coords,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

// ── Estimate ETA ────────────────────────────────────────────

function estimateEta(distanceMi: number, elevationGainFt: number | null): number | null {
  if (distanceMi <= 0) return null;

  const baseSpeed = 20;
  let hours = distanceMi / baseSpeed;

  if (elevationGainFt && elevationGainFt > 0) {
    hours += elevationGainFt / 3000;
  }

  return Math.round(hours * 10) / 10;
}

// ── Preferred Route Coordinates Helper ──────────────────────

export function getPrimaryRouteCoordinates(parsed: GpxParseResult): Array<[number, number]> {
  const trackCoords =
    parsed.tracks.flatMap(trk =>
      trk.segments.flatMap(seg =>
        seg.points
          .filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lon))
          .map(pt => [pt.lon, pt.lat] as [number, number])
      )
    );

  if (trackCoords.length >= 2) return trackCoords;

  const routeCoords =
    parsed.routes.flatMap(rte =>
      rte.points
        .filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lon))
        .map(pt => [pt.lon, pt.lat] as [number, number])
    );

  if (routeCoords.length >= 2) return routeCoords;

  return [];
}

// ── Main Parse Function ─────────────────────────────────────

export function parseGPX(xmlString: string): GpxParseResult {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('INVALID INPUT — Expected a GPX XML string.');
  }

  const trimmed = xmlString.trim();
  if (!trimmed.includes('<gpx') && !trimmed.includes('<GPX')) {
    throw new Error('INVALID GPX FORMAT — File does not contain GPX data.');
  }

  const source = detectSource(xmlString);

  const metadataBlock = getTagContent(xmlString, 'metadata') || '';
  const metaName = getTagContent(metadataBlock, 'name');
  const metaDesc = getTagContent(metadataBlock, 'desc');
  const metaAuthor = getTagContent(metadataBlock, 'author');
  const metaTime = getTagContent(metadataBlock, 'time');

  const waypoints = parseWaypoints(xmlString);
  const tracks = parseTracks(xmlString);
  const routes = parseRoutes(xmlString);

  let name = metaName ? unescapeXml(metaName) : null;
  if (!name && tracks.length > 0 && tracks[0].name) name = tracks[0].name;
  if (!name && routes.length > 0 && routes[0].name) name = routes[0].name;
  if (!name) name = 'Imported GPX Route';

  const stats = computeTrackStats(tracks, routes);
  const bounds = computeBounds(waypoints, tracks, routes);
  const geojson = toGeoJSON(tracks, routes, waypoints);
  const eta = estimateEta(stats.totalDistanceMi, stats.elevationGainFt);

  let author: string | null = null;
  if (metaAuthor) {
    const authorName = getTagContent(metaAuthor, 'name');
    author = authorName ? unescapeXml(authorName) : unescapeXml(metaAuthor);
  }

  return {
    name,
    description: metaDesc ? unescapeXml(metaDesc) : null,
    author,
    time: metaTime,
    source,

    waypoints,
    tracks,
    routes,

    totalDistanceMi: stats.totalDistanceMi,
    elevationGainFt: stats.elevationGainFt,
    elevationLossFt: stats.elevationLossFt,
    minElevationFt: stats.minElevationFt,
    maxElevationFt: stats.maxElevationFt,
    bounds,
    totalTrackPoints: stats.totalTrackPoints,
    totalSegments: stats.totalSegments,
    elevationProfile: stats.elevationProfile,

    geojson,
    estimatedEtaHours: eta,
  };
}

// ── Waypoint Kind Mapping ───────────────────────────────────

export function mapToWaypointKind(wp: GpxWaypoint): 'waypoint' | 'camp' | 'fuel' | 'water' | 'hazard' | 'note' {
  const sym = (wp.symbol || '').toLowerCase();
  const type = (wp.type || '').toLowerCase();
  const name = (wp.name || '').toLowerCase();

  if (
    sym.includes('camp') || type.includes('camp') || name.includes('camp') ||
    sym.includes('tent') || sym.includes('shelter') || sym.includes('lodge')
  ) {
    return 'camp';
  }

  if (
    sym.includes('gas') || sym.includes('fuel') || type.includes('fuel') ||
    name.includes('fuel') || name.includes('gas station')
  ) {
    return 'fuel';
  }

  if (
    sym.includes('water') || sym.includes('drinking') || type.includes('water') ||
    name.includes('water') || name.includes('spring') || name.includes('creek')
  ) {
    return 'water';
  }

  if (
    sym.includes('danger') || sym.includes('hazard') || sym.includes('warning') ||
    type.includes('hazard') || name.includes('hazard') || name.includes('danger')
  ) {
    return 'hazard';
  }

  return 'waypoint';
}

// ── Validation ──────────────────────────────────────────────

export function validateGpxFile(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'File content is empty or invalid.' };
  }

  const trimmed = content.trim();

  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<gpx') && !trimmed.startsWith('<GPX')) {
    return { valid: false, error: 'File is not valid XML. Expected GPX format.' };
  }

  if (!trimmed.includes('<gpx') && !trimmed.includes('<GPX')) {
    return { valid: false, error: 'File does not contain a <gpx> root element.' };
  }

  const hasWpt = /<(?:[\w-]+:)?wpt\b/i.test(trimmed);
  const hasTrk = /<(?:[\w-]+:)?trkpt\b/i.test(trimmed);
  const hasRte = /<(?:[\w-]+:)?rtept\b/i.test(trimmed);

  if (!hasWpt && !hasTrk && !hasRte) {
    return { valid: false, error: 'GPX file contains no waypoints, tracks, or routes.' };
  }

  return { valid: true };
}

// ╔════════════════════════════════════════════════════════════╗
// ║  KML / KMZ IMPORT PARSER                                  ║
// ╚════════════════════════════════════════════════════════════╝

// ── KML Source Detection ────────────────────────────────────

const KML_SOURCE_PATTERNS: Array<{
  pattern: RegExp;
  app: string;
  icon: string;
  color: string;
}> = [
  { pattern: /google\s*earth\s*pro/i, app: 'Google Earth Pro', icon: 'earth-outline', color: '#4285F4' },
  { pattern: /google\s*earth/i, app: 'Google Earth', icon: 'earth-outline', color: '#4285F4' },
  { pattern: /google\s*my\s*maps/i, app: 'Google My Maps', icon: 'map-outline', color: '#34A853' },
  { pattern: /google\s*maps/i, app: 'Google Maps', icon: 'map-outline', color: '#34A853' },
  { pattern: /arcgis/i, app: 'ArcGIS', icon: 'globe-outline', color: '#2C7AC3' },
  { pattern: /qgis/i, app: 'QGIS', icon: 'layers-outline', color: '#589632' },
  { pattern: /caltopo/i, app: 'CalTopo', icon: 'layers-outline', color: '#2E7D32' },
  { pattern: /sartopo/i, app: 'SARTopo', icon: 'layers-outline', color: '#2E7D32' },
  { pattern: /avenza/i, app: 'Avenza Maps', icon: 'document-outline', color: '#1565C0' },
  { pattern: /gps\s*visualizer/i, app: 'GPS Visualizer', icon: 'analytics-outline', color: '#FF6F00' },
  { pattern: /simplekml/i, app: 'SimpleKML', icon: 'code-outline', color: '#7B1FA2' },
  { pattern: /libkml/i, app: 'libkml', icon: 'code-outline', color: '#7B1FA2' },
  { pattern: /garmin/i, app: 'Garmin', icon: 'navigate-outline', color: '#007DC3' },
  { pattern: /gaia\s*gps/i, app: 'Gaia GPS', icon: 'compass-outline', color: '#FF6B35' },
  { pattern: /alltrails/i, app: 'AllTrails', icon: 'trail-sign-outline', color: '#428813' },
  { pattern: /onx/i, app: 'onX Maps', icon: 'map-outline', color: '#E85D04' },
  { pattern: /expedition\s*command/i, app: 'ECS', icon: 'shield-outline', color: '#C48A2C' },
];

function detectKmlSource(xml: string): GpxSourceInfo {
  const generatorMatch = xml.match(/<(?:atom:)?generator[^>]*>([^<]+)/i);
  const authorMatch = xml.match(/<(?:atom:)?(?:author|name)>([^<]+)/i);
  const creatorHint = generatorMatch?.[1] || authorMatch?.[1] || null;

  if (creatorHint) {
    for (const sp of KML_SOURCE_PATTERNS) {
      if (sp.pattern.test(creatorHint)) {
        return { creator: creatorHint, detectedApp: sp.app, appIcon: sp.icon, appColor: sp.color };
      }
    }
  }

  for (const sp of KML_SOURCE_PATTERNS) {
    if (sp.pattern.test(xml)) {
      return { creator: creatorHint, detectedApp: sp.app, appIcon: sp.icon, appColor: sp.color };
    }
  }

  if (xml.includes('xmlns="http://www.opengis.net/kml')) {
    return { creator: creatorHint, detectedApp: 'KML File', appIcon: 'earth-outline', appColor: '#4285F4' };
  }

  return {
    creator: creatorHint,
    detectedApp: creatorHint || 'KML File',
    appIcon: 'earth-outline',
    appColor: '#4285F4',
  };
}

// ── KML Coordinate Parsing ──────────────────────────────────

interface KmlCoord {
  lon: number;
  lat: number;
  alt: number | null;
}

function parseKmlCoordinates(coordStr: string): KmlCoord[] {
  if (!coordStr) return [];

  const coords: KmlCoord[] = [];
  const tuples = coordStr.trim().split(/\s+/);

  for (const tuple of tuples) {
    const parts = tuple.split(',');
    if (parts.length < 2) continue;

    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;

    if (isNaN(lon) || isNaN(lat)) continue;
    if (lon === 0 && lat === 0) continue;

    coords.push({
      lon,
      lat,
      alt: (alt != null && !isNaN(alt) && alt !== 0) ? alt : null,
    });
  }

  return coords;
}

// ── KML Geometry Extraction ─────────────────────────────────

interface KmlGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiGeometry';
  coordinates: KmlCoord[];
  children?: KmlGeometry[];
}

function extractKmlGeometries(placemarkContent: string): KmlGeometry[] {
  const geometries: KmlGeometry[] = [];

  const pointRegex = /<Point>([\s\S]*?)<\/Point>/gi;
  let m: RegExpExecArray | null;
  while ((m = pointRegex.exec(placemarkContent)) !== null) {
    const coordStr = getTagContent(m[1], 'coordinates');
    if (coordStr) {
      const coords = parseKmlCoordinates(coordStr);
      if (coords.length > 0) {
        geometries.push({ type: 'Point', coordinates: [coords[0]] });
      }
    }
  }

  const lineRegex = /<LineString>([\s\S]*?)<\/LineString>/gi;
  while ((m = lineRegex.exec(placemarkContent)) !== null) {
    const coordStr = getTagContent(m[1], 'coordinates');
    if (coordStr) {
      const coords = parseKmlCoordinates(coordStr);
      if (coords.length >= 2) {
        geometries.push({ type: 'LineString', coordinates: coords });
      }
    }
  }

  const polyRegex = /<Polygon>([\s\S]*?)<\/Polygon>/gi;
  while ((m = polyRegex.exec(placemarkContent)) !== null) {
    const outerBoundary = getTagContent(m[1], 'outerBoundaryIs');
    if (outerBoundary) {
      const linearRing = getTagContent(outerBoundary, 'LinearRing');
      if (linearRing) {
        const coordStr = getTagContent(linearRing, 'coordinates');
        if (coordStr) {
          const coords = parseKmlCoordinates(coordStr);
          if (coords.length >= 3) {
            geometries.push({ type: 'Polygon', coordinates: coords });
          }
        }
      }
    }
  }

  const multiRegex = /<MultiGeometry>([\s\S]*?)<\/MultiGeometry>/gi;
  while ((m = multiRegex.exec(placemarkContent)) !== null) {
    const children = extractKmlGeometries(m[1]);
    if (children.length > 0) {
      geometries.push({ type: 'MultiGeometry', coordinates: [], children });
    }
  }

  return geometries;
}

// ── KML Placemark Parsing ───────────────────────────────────

interface KmlPlacemark {
  name: string | null;
  description: string | null;
  styleUrl: string | null;
  geometries: KmlGeometry[];
  folderName: string | null;
}

function extractPlacemarks(xml: string, folderName: string | null = null): KmlPlacemark[] {
  const placemarks: KmlPlacemark[] = [];
  const pmRegex = /<Placemark(?:\s[^>]*)?>([\s\S]*?)<\/Placemark>/gi;
  let m: RegExpExecArray | null;

  while ((m = pmRegex.exec(xml)) !== null) {
    const content = m[1];
    const name = getTagContent(content, 'name');
    const desc = getTagContent(content, 'description');
    const styleUrl = getTagContent(content, 'styleUrl');
    const geometries = extractKmlGeometries(content);

    if (geometries.length > 0) {
      placemarks.push({
        name: name ? unescapeXml(name.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : null,
        description: desc ? unescapeXml(desc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim()) : null,
        styleUrl: styleUrl ? styleUrl.trim() : null,
        geometries,
        folderName: folderName ? unescapeXml(folderName) : null,
      });
    }
  }

  return placemarks;
}

function extractAllPlacemarks(xml: string): KmlPlacemark[] {
  const allPlacemarks: KmlPlacemark[] = [];
  const folderRegex = /<Folder(?:\s[^>]*)?>([\s\S]*?)<\/Folder>/gi;
  let fm: RegExpExecArray | null;

  while ((fm = folderRegex.exec(xml)) !== null) {
    const folderContent = fm[1];
    const folderName = getTagContent(folderContent, 'name');
    const folderPlacemarks = extractPlacemarks(folderContent, folderName);
    allPlacemarks.push(...folderPlacemarks);
  }

  const topLevelPlacemarks = extractPlacemarks(xml, null);

  const existingKeys = new Set(
    allPlacemarks.map(p => {
      const firstCoord = p.geometries[0]?.coordinates[0];
      return `${p.name}|${firstCoord?.lat}|${firstCoord?.lon}`;
    })
  );

  for (const pm of topLevelPlacemarks) {
    const firstCoord = pm.geometries[0]?.coordinates[0];
    const key = `${pm.name}|${firstCoord?.lat}|${firstCoord?.lon}`;
    if (!existingKeys.has(key)) {
      allPlacemarks.push(pm);
      existingKeys.add(key);
    }
  }

  return allPlacemarks;
}

// ── KML → GpxParseResult Conversion ────────────────────────

function kmlPlacemarksToResult(
  placemarks: KmlPlacemark[],
  source: GpxSourceInfo,
  docName: string | null,
  docDesc: string | null,
): GpxParseResult {
  const waypoints: GpxWaypoint[] = [];
  const tracks: GpxTrack[] = [];
  const routes: GpxRoute[] = [];

  for (const pm of placemarks) {
    for (const geom of pm.geometries) {
      processGeometry(geom, pm, waypoints, tracks);
    }
  }

  const stats = computeTrackStats(tracks, routes);
  const bounds = computeBounds(waypoints, tracks, routes);
  const geojson = toGeoJSON(tracks, routes, waypoints);
  const eta = estimateEta(stats.totalDistanceMi, stats.elevationGainFt);

  let name = docName || null;
  if (!name && tracks.length > 0 && tracks[0].name) name = tracks[0].name;
  if (!name && waypoints.length > 0 && waypoints[0].name) name = waypoints[0].name;
  if (!name) name = 'Imported KML';

  return {
    name,
    description: docDesc || null,
    author: null,
    time: null,
    source,

    waypoints,
    tracks,
    routes,

    totalDistanceMi: stats.totalDistanceMi,
    elevationGainFt: stats.elevationGainFt,
    elevationLossFt: stats.elevationLossFt,
    minElevationFt: stats.minElevationFt,
    maxElevationFt: stats.maxElevationFt,
    bounds,
    totalTrackPoints: stats.totalTrackPoints,
    totalSegments: stats.totalSegments,
    elevationProfile: stats.elevationProfile,

    geojson,
    estimatedEtaHours: eta,
  };
}

function processGeometry(
  geom: KmlGeometry,
  pm: KmlPlacemark,
  waypoints: GpxWaypoint[],
  tracks: GpxTrack[],
): void {
  switch (geom.type) {
    case 'Point': {
      const coord = geom.coordinates[0];
      if (coord) {
        waypoints.push({
          lat: coord.lat,
          lon: coord.lon,
          ele: coord.alt,
          eleFt: coord.alt != null ? Math.round(coord.alt * M_TO_FT) : null,
          name: pm.name,
          description: pm.description,
          time: null,
          symbol: mapKmlStyleToSymbol(pm.styleUrl, pm.name),
          type: pm.folderName || null,
        });
      }
      break;
    }

    case 'LineString': {
      const points: GpxTrackPoint[] = geom.coordinates.map(c => ({
        lat: c.lat,
        lon: c.lon,
        ele: c.alt,
        time: null,
      }));
      if (points.length >= 2) {
        tracks.push({
          name: pm.name,
          description: pm.description,
          segments: [{ points }],
        });
      }
      break;
    }

    case 'Polygon': {
      const points: GpxTrackPoint[] = geom.coordinates.map(c => ({
        lat: c.lat,
        lon: c.lon,
        ele: c.alt,
        time: null,
      }));
      if (points.length >= 3) {
        tracks.push({
          name: pm.name ? `${pm.name} (boundary)` : 'Polygon Boundary',
          description: pm.description,
          segments: [{ points }],
        });
      }
      break;
    }

    case 'MultiGeometry': {
      if (geom.children) {
        for (const child of geom.children) {
          processGeometry(child, pm, waypoints, tracks);
        }
      }
      break;
    }
  }
}

// ── KML Style → Symbol Mapping ──────────────────────────────

function mapKmlStyleToSymbol(styleUrl: string | null, name: string | null): string | null {
  const style = (styleUrl || '').toLowerCase();
  const nm = (name || '').toLowerCase();

  if (style.includes('camping') || nm.includes('camp')) return 'Campground';
  if (style.includes('gas') || style.includes('fuel') || nm.includes('fuel') || nm.includes('gas')) return 'Gas Station';
  if (style.includes('water') || nm.includes('water') || nm.includes('spring')) return 'Drinking Water';
  if (style.includes('danger') || style.includes('caution') || nm.includes('hazard')) return 'Danger Area';
  if (style.includes('parking') || nm.includes('trailhead')) return 'Parking Area';
  if (style.includes('info') || nm.includes('info')) return 'Information';
  if (style.includes('flag') || nm.includes('start') || nm.includes('finish')) return 'Flag';
  if (style.includes('photo') || nm.includes('photo') || nm.includes('viewpoint')) return 'Scenic Area';

  return null;
}

// ── KML Waypoint Kind Mapping ───────────────────────────────

export function mapKmlToWaypointKind(wp: GpxWaypoint): 'waypoint' | 'camp' | 'fuel' | 'water' | 'hazard' | 'note' {
  const gpxKind = mapToWaypointKind(wp);
  if (gpxKind !== 'waypoint') return gpxKind;

  const folder = (wp.type || '').toLowerCase();
  if (folder.includes('camp') || folder.includes('overnight')) return 'camp';
  if (folder.includes('fuel') || folder.includes('gas') || folder.includes('resupply')) return 'fuel';
  if (folder.includes('water')) return 'water';
  if (folder.includes('hazard') || folder.includes('danger') || folder.includes('warning')) return 'hazard';
  if (folder.includes('note') || folder.includes('info') || folder.includes('photo')) return 'note';

  return 'waypoint';
}

// ── Main KML Parse Function ─────────────────────────────────

export function parseKML(xmlString: string): GpxParseResult {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('INVALID INPUT — Expected a KML XML string.');
  }

  const trimmed = xmlString.trim();
  if (!trimmed.includes('<kml') && !trimmed.includes('<KML') && !trimmed.includes('<kml:kml')) {
    throw new Error('INVALID KML FORMAT — File does not contain KML data.');
  }

  const source = detectKmlSource(xmlString);

  const docBlock = getTagContent(xmlString, 'Document') || xmlString;
  const docName = getTagContent(docBlock, 'name');
  const docDesc = getTagContent(docBlock, 'description');

  const placemarks = extractAllPlacemarks(xmlString);
  if (placemarks.length === 0) {
    throw new Error('KML file contains no Placemarks with geographic data.');
  }

  return kmlPlacemarksToResult(
    placemarks,
    source,
    docName ? unescapeXml(docName.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : null,
    docDesc ? unescapeXml(docDesc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim()) : null,
  );
}

// ── KML Validation ──────────────────────────────────────────

export function validateKmlFile(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'File content is empty or invalid.' };
  }

  const trimmed = content.trim();

  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<kml') && !trimmed.startsWith('<KML')) {
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return { valid: false, error: 'File appears to be HTML, not KML. Please export as KML from your mapping application.' };
    }
    return { valid: false, error: 'File is not valid XML. Expected KML format.' };
  }

  if (!trimmed.includes('<kml') && !trimmed.includes('<KML') && !trimmed.includes('<kml:kml')) {
    return { valid: false, error: 'File does not contain a <kml> root element.' };
  }

  if (!/<Placemark/i.test(trimmed)) {
    return { valid: false, error: 'KML file contains no Placemarks.' };
  }

  const hasPoint = /<Point>/i.test(trimmed);
  const hasLine = /<LineString>/i.test(trimmed);
  const hasPoly = /<Polygon>/i.test(trimmed);
  const hasMulti = /<MultiGeometry>/i.test(trimmed);

  if (!hasPoint && !hasLine && !hasPoly && !hasMulti) {
    return { valid: false, error: 'KML Placemarks contain no geometry (Point, LineString, or Polygon).' };
  }

  return { valid: true };
}

// ── File Type Detection ─────────────────────────────────────

export type GeoFileType = 'gpx' | 'kml' | 'kmz' | 'unknown';

export function detectFileType(fileName: string, content?: string): GeoFileType {
  const ext = (fileName || '').toLowerCase().split('.').pop() || '';

  if (ext === 'gpx') return 'gpx';
  if (ext === 'kml') return 'kml';
  if (ext === 'kmz') return 'kmz';

  if (content) {
    const trimmed = content.trim().substring(0, 500);
    if (trimmed.includes('<gpx') || trimmed.includes('<GPX')) return 'gpx';
    if (trimmed.includes('<kml') || trimmed.includes('<KML')) return 'kml';
  }

  return 'unknown';
}

// ── Unified Parse Function ──────────────────────────────────

export function parseGeoFile(fileName: string, content: string): GpxParseResult {
  const fileType = detectFileType(fileName, content);

  switch (fileType) {
    case 'gpx':
      return parseGPX(content);
    case 'kml':
      return parseKML(content);
    case 'kmz':
      throw new Error(
        'KMZ files are compressed archives. Please extract the .kml file from the KMZ archive first, ' +
        'or export as .kml directly from your mapping application.'
      );
    default:
      throw new Error(
        'Unrecognized file format. Supported formats: .gpx (GPS Exchange Format) and .kml (Keyhole Markup Language).'
      );
  }
}

export function validateGeoFile(
  fileName: string,
  content: string,
): { valid: boolean; error?: string; fileType: GeoFileType } {
  const fileType = detectFileType(fileName, content);

  switch (fileType) {
    case 'gpx':
      return { ...validateGpxFile(content), fileType };
    case 'kml':
      return { ...validateKmlFile(content), fileType };
    case 'kmz':
      return {
        valid: false,
        error: 'KMZ files must be extracted first. Export as .kml from your mapping app, or unzip the .kmz to get the doc.kml file inside.',
        fileType,
      };
    default:
      return { valid: false, error: 'Unsupported file format. Please use .gpx or .kml files.', fileType };
  }
}
