/**
 * GeoJSON Import Parser — Expedition Command System
 *
 * Parses RFC 7946 GeoJSON FeatureCollections and converts them
 * into ECS-compatible waypoints and routes. Handles:
 *
 *   - Point features → EcsWaypoint records
 *   - LineString / MultiLineString features → EcsRoute with GeoJSON geometry
 *   - Polygon features → EcsRoute (outer boundary as route path)
 *   - ECS metadata extraction from feature properties
 *   - simplestyle-spec properties (marker-color, stroke, etc.)
 *   - Mapbox/Maki symbol name mapping
 *   - Nested GeometryCollection handling
 *
 * Sources supported:
 *   - ECS exports (round-trip with ecs: prefixed properties)
 *   - Mapbox Studio / Mapbox GL JS
 *   - Leaflet / GeoJSON.io
 *   - QGIS / ArcGIS GeoJSON exports
 *   - D3.js generated GeoJSON
 *   - Turf.js output
 *   - GitHub rendered GeoJSON
 *   - Kepler.gl / deck.gl exports
 *   - CalTopo GeoJSON exports
 *   - Any RFC 7946 compliant producer
 *
 * Returns a structured GeoJsonParseResult with computed stats,
 * bounds, and pre-mapped waypoint kinds for direct import.
 */

import type { EcsWaypointKind } from './expeditionTypes';

// ── Types ───────────────────────────────────────────────────

export interface GeoJsonWaypoint {
  lat: number;
  lon: number;
  ele: number | null;
  eleFt: number | null;
  name: string | null;
  description: string | null;
  kind: EcsWaypointKind;
  color: string | null;
  symbol: string | null;
  featureIndex: number;
  properties: Record<string, any>;
}

export interface GeoJsonRoute {
  name: string | null;
  description: string | null;
  source: string | null;
  distanceMi: number | null;
  etaHours: number | null;
  color: string | null;
  lineWidth: number | null;
  featureIndex: number;
  geometry: Record<string, any>;
  properties: Record<string, any>;
  pointCount: number;
}

export interface GeoJsonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface GeoJsonSourceInfo {
  generator: string | null;
  detectedApp: string | null;
  appIcon: string;
  appColor: string;
  isEcsExport: boolean;
}

export interface GeoJsonParseResult {
  // Metadata
  name: string;
  description: string | null;
  source: GeoJsonSourceInfo;

  // Parsed features
  waypoints: GeoJsonWaypoint[];
  routes: GeoJsonRoute[];

  // Stats
  totalFeatures: number;
  totalPointFeatures: number;
  totalLineFeatures: number;
  totalPolygonFeatures: number;
  totalCoordinates: number;
  bounds: GeoJsonBounds | null;

  // Original GeoJSON (for passthrough)
  raw: Record<string, any>;

  // ECS metadata if present
  ecsExpedition: Record<string, any> | null;
  ecsReadiness: Record<string, any> | null;
}

// ── Constants ───────────────────────────────────────────────

const EARTH_RADIUS_MI = 3958.8;
const M_TO_FT = 3.28084;

// ── Haversine ───────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Source Detection ────────────────────────────────────────

const GEOJSON_SOURCE_PATTERNS: Array<{
  pattern: RegExp;
  app: string;
  icon: string;
  color: string;
}> = [
  { pattern: /expedition\s*command/i, app: 'ECS', icon: 'shield-outline', color: '#C48A2C' },
  { pattern: /mapbox/i, app: 'Mapbox', icon: 'map-outline', color: '#4264FB' },
  { pattern: /leaflet/i, app: 'Leaflet', icon: 'leaf-outline', color: '#199900' },
  { pattern: /geojson\.io/i, app: 'geojson.io', icon: 'globe-outline', color: '#333333' },
  { pattern: /qgis/i, app: 'QGIS', icon: 'layers-outline', color: '#589632' },
  { pattern: /arcgis/i, app: 'ArcGIS', icon: 'globe-outline', color: '#2C7AC3' },
  { pattern: /kepler\.gl/i, app: 'Kepler.gl', icon: 'analytics-outline', color: '#2C51BE' },
  { pattern: /deck\.gl/i, app: 'deck.gl', icon: 'layers-outline', color: '#00ACD7' },
  { pattern: /turf/i, app: 'Turf.js', icon: 'code-outline', color: '#4CAF50' },
  { pattern: /d3/i, app: 'D3.js', icon: 'bar-chart-outline', color: '#F9A03C' },
  { pattern: /caltopo/i, app: 'CalTopo', icon: 'layers-outline', color: '#2E7D32' },
  { pattern: /gaia\s*gps/i, app: 'Gaia GPS', icon: 'compass-outline', color: '#FF6B35' },
  { pattern: /google/i, app: 'Google Maps', icon: 'map-outline', color: '#34A853' },
  { pattern: /garmin/i, app: 'Garmin', icon: 'navigate-outline', color: '#007DC3' },
  { pattern: /onx/i, app: 'onX Maps', icon: 'map-outline', color: '#E85D04' },
  { pattern: /alltrails/i, app: 'AllTrails', icon: 'trail-sign-outline', color: '#428813' },
  { pattern: /strava/i, app: 'Strava', icon: 'fitness-outline', color: '#FC4C02' },
  { pattern: /overpass/i, app: 'OpenStreetMap', icon: 'globe-outline', color: '#7EBC6F' },
  { pattern: /osm/i, app: 'OpenStreetMap', icon: 'globe-outline', color: '#7EBC6F' },
];

function detectGeoJsonSource(geojson: Record<string, any>): GeoJsonSourceInfo {
  // Check for ECS export metadata
  const ecsMeta = geojson['ecs:exportMeta'];
  if (ecsMeta) {
    return {
      generator: ecsMeta.generator || 'Expedition Command System',
      detectedApp: 'ECS',
      appIcon: 'shield-outline',
      appColor: '#C48A2C',
      isEcsExport: true,
    };
  }

  // Check for generator in common locations
  const generatorHints: string[] = [];

  // Top-level foreign members
  if (geojson.generator) generatorHints.push(String(geojson.generator));
  if (geojson.source) generatorHints.push(String(geojson.source));
  if (geojson.creator) generatorHints.push(String(geojson.creator));

  // Check feature properties for source hints
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const feature of geojson.features.slice(0, 5)) {
      const props = feature?.properties || {};
      if (props.source) generatorHints.push(String(props.source));
      if (props.generator) generatorHints.push(String(props.generator));
      if (props['ecs:featureSource']) {
        return {
          generator: 'Expedition Command System',
          detectedApp: 'ECS',
          appIcon: 'shield-outline',
          appColor: '#C48A2C',
          isEcsExport: true,
        };
      }
    }
  }

  // Check all hints against patterns
  const allHints = generatorHints.join(' ');
  for (const sp of GEOJSON_SOURCE_PATTERNS) {
    if (sp.pattern.test(allHints)) {
      return {
        generator: generatorHints[0] || null,
        detectedApp: sp.app,
        appIcon: sp.icon,
        appColor: sp.color,
        isEcsExport: false,
      };
    }
  }

  // Check the full JSON string for patterns (expensive, only if needed)
  const jsonSnippet = JSON.stringify(geojson).substring(0, 2000);
  for (const sp of GEOJSON_SOURCE_PATTERNS) {
    if (sp.pattern.test(jsonSnippet)) {
      return {
        generator: generatorHints[0] || null,
        detectedApp: sp.app,
        appIcon: sp.icon,
        appColor: sp.color,
        isEcsExport: false,
      };
    }
  }

  return {
    generator: generatorHints[0] || null,
    detectedApp: generatorHints[0] || 'GeoJSON File',
    appIcon: 'code-slash-outline',
    appColor: '#78909C',
    isEcsExport: false,
  };
}

// ── Waypoint Kind Mapping ───────────────────────────────────

/** Map Maki/Mapbox symbol names to EcsWaypointKind */
const SYMBOL_TO_KIND: Record<string, EcsWaypointKind> = {
  campsite: 'camp',
  camping: 'camp',
  shelter: 'camp',
  lodging: 'camp',
  fuel: 'fuel',
  'gas-station': 'fuel',
  gas: 'fuel',
  'drinking-water': 'water',
  water: 'water',
  dam: 'water',
  danger: 'hazard',
  warning: 'hazard',
  caution: 'hazard',
  'road-closure': 'hazard',
  information: 'note',
  'information-outline': 'note',
  library: 'note',
  'emergency-phone': 'incident',
  hospital: 'incident',
  fire: 'incident',
  marker: 'waypoint',
  pin: 'waypoint',
  circle: 'waypoint',
};

/** Map color strings to EcsWaypointKind */
function kindFromColor(color: string | null): EcsWaypointKind | null {
  if (!color) return null;
  const c = color.toLowerCase().replace('#', '');

  // Common color associations
  if (c.startsWith('ff') && c.length >= 4) return null; // Too ambiguous
  if (['ef5350', 'f44336', 'e53935', 'ff5722', 'ff0000', 'red'].includes(c)) return 'hazard';
  if (['4caf50', '66bb6a', '2e7d32', '00ff00', 'green'].includes(c)) return 'camp';
  if (['2196f3', '42a5f5', '4fc3f7', '0000ff', 'blue'].includes(c)) return 'water';
  if (['ff9800', 'ffb74d', 'ff7043', 'ffc107', 'orange', 'yellow'].includes(c)) return 'fuel';
  if (['9c27b0', 'ce93d8', '7b1fa2', 'purple'].includes(c)) return 'note';

  return null;
}

/** Map a GeoJSON Point feature's properties to an EcsWaypointKind */
export function mapGeoJsonToWaypointKind(properties: Record<string, any>): EcsWaypointKind {
  // 1. Direct ECS kind property (round-trip)
  const ecsKind = properties['ecs:waypointKind'] || properties['ecs_kind'];
  if (ecsKind && ['waypoint', 'camp', 'fuel', 'water', 'hazard', 'note', 'incident'].includes(ecsKind)) {
    return ecsKind as EcsWaypointKind;
  }

  // 2. ECS field log source → note
  if (properties['ecs:featureSource'] === 'fieldLog') {
    return 'note';
  }

  // 3. Maki/Mapbox symbol
  const symbol = properties['marker-symbol'] || properties.symbol || properties.icon || '';
  if (symbol) {
    const symbolLower = String(symbol).toLowerCase();
    for (const [key, kind] of Object.entries(SYMBOL_TO_KIND)) {
      if (symbolLower.includes(key)) return kind;
    }
  }

  // 4. Name-based heuristics
  const name = String(properties.name || properties.title || properties.Name || '').toLowerCase();
  if (name.includes('camp') || name.includes('tent') || name.includes('shelter') || name.includes('lodge')) return 'camp';
  if (name.includes('fuel') || name.includes('gas') || name.includes('station')) return 'fuel';
  if (name.includes('water') || name.includes('spring') || name.includes('creek') || name.includes('well')) return 'water';
  if (name.includes('hazard') || name.includes('danger') || name.includes('warning') || name.includes('caution')) return 'hazard';
  if (name.includes('note') || name.includes('info') || name.includes('photo') || name.includes('viewpoint')) return 'note';
  if (name.includes('incident') || name.includes('emergency') || name.includes('accident')) return 'incident';

  // 5. Type/category property
  const type = String(properties.type || properties.category || properties.featureType || '').toLowerCase();
  if (type.includes('camp')) return 'camp';
  if (type.includes('fuel') || type.includes('gas')) return 'fuel';
  if (type.includes('water')) return 'water';
  if (type.includes('hazard') || type.includes('danger')) return 'hazard';
  if (type.includes('note') || type.includes('info')) return 'note';

  // 6. Color-based heuristic (last resort)
  const markerColor = properties['marker-color'];
  const colorKind = kindFromColor(markerColor);
  if (colorKind) return colorKind;

  return 'waypoint';
}

// ── Coordinate Extraction ───────────────────────────────────

interface CoordStats {
  totalCoords: number;
  bounds: GeoJsonBounds | null;
}

function computeCoordStats(geojson: Record<string, any>): CoordStats {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let totalCoords = 0;
  let hasCoords = false;

  function addCoord(lon: number, lat: number): void {
    if (!isFinite(lon) || !isFinite(lat)) return;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    totalCoords++;
    hasCoords = true;
  }

  function processCoords(coords: any, depth: number): void {
    if (!Array.isArray(coords)) return;

    if (depth === 0) {
      // Single coordinate: [lon, lat, ele?]
      if (coords.length >= 2 && typeof coords[0] === 'number') {
        addCoord(coords[0], coords[1]);
      }
    } else {
      for (const item of coords) {
        processCoords(item, depth - 1);
      }
    }
  }

  function processGeometry(geom: Record<string, any>): void {
    if (!geom || !geom.type) return;

    switch (geom.type) {
      case 'Point':
        processCoords(geom.coordinates, 0);
        break;
      case 'MultiPoint':
      case 'LineString':
        processCoords(geom.coordinates, 1);
        break;
      case 'MultiLineString':
      case 'Polygon':
        processCoords(geom.coordinates, 2);
        break;
      case 'MultiPolygon':
        processCoords(geom.coordinates, 3);
        break;
      case 'GeometryCollection':
        if (Array.isArray(geom.geometries)) {
          for (const g of geom.geometries) processGeometry(g);
        }
        break;
    }
  }

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const feature of geojson.features) {
      if (feature?.geometry) processGeometry(feature.geometry);
    }
  } else if (geojson.type === 'Feature' && geojson.geometry) {
    processGeometry(geojson.geometry);
  } else {
    processGeometry(geojson);
  }

  return {
    totalCoords,
    bounds: hasCoords ? {
      minLat: parseFloat(minLat.toFixed(6)),
      maxLat: parseFloat(maxLat.toFixed(6)),
      minLon: parseFloat(minLon.toFixed(6)),
      maxLon: parseFloat(maxLon.toFixed(6)),
    } : null,
  };
}

// ── Line Distance Computation ───────────────────────────────

function computeLineDistance(coordinates: number[][]): number {
  let totalMi = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    if (prev.length >= 2 && curr.length >= 2) {
      totalMi += haversine(prev[1], prev[0], curr[1], curr[0]);
    }
  }
  return Math.round(totalMi * 100) / 100;
}

function countLinePoints(geometry: Record<string, any>): number {
  if (!geometry || !geometry.coordinates) return 0;

  switch (geometry.type) {
    case 'LineString':
      return Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
    case 'MultiLineString':
      if (!Array.isArray(geometry.coordinates)) return 0;
      return geometry.coordinates.reduce((sum: number, line: any[]) =>
        sum + (Array.isArray(line) ? line.length : 0), 0);
    case 'Polygon':
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return 0;
      return Array.isArray(geometry.coordinates[0]) ? geometry.coordinates[0].length : 0;
    default:
      return 0;
  }
}

function computeGeometryDistance(geometry: Record<string, any>): number {
  if (!geometry || !geometry.coordinates) return 0;

  switch (geometry.type) {
    case 'LineString':
      return computeLineDistance(geometry.coordinates);
    case 'MultiLineString': {
      let total = 0;
      for (const line of geometry.coordinates) {
        if (Array.isArray(line)) total += computeLineDistance(line);
      }
      return Math.round(total * 100) / 100;
    }
    case 'Polygon':
      if (geometry.coordinates.length > 0) {
        return computeLineDistance(geometry.coordinates[0]);
      }
      return 0;
    default:
      return 0;
  }
}

// ── ETA Estimation ──────────────────────────────────────────

function estimateEta(distanceMi: number): number | null {
  if (distanceMi <= 0) return null;
  // Rough overland estimate: 20 mph average
  return Math.round((distanceMi / 20) * 10) / 10;
}

// ── Feature Processing ──────────────────────────────────────

function isPointGeometry(type: string): boolean {
  return type === 'Point' || type === 'MultiPoint';
}

function isLineGeometry(type: string): boolean {
  return type === 'LineString' || type === 'MultiLineString';
}

function isPolygonGeometry(type: string): boolean {
  return type === 'Polygon' || type === 'MultiPolygon';
}

function processFeatures(geojson: Record<string, any>): {
  waypoints: GeoJsonWaypoint[];
  routes: GeoJsonRoute[];
  pointCount: number;
  lineCount: number;
  polygonCount: number;
} {
  const waypoints: GeoJsonWaypoint[] = [];
  const routes: GeoJsonRoute[] = [];
  let pointCount = 0;
  let lineCount = 0;
  let polygonCount = 0;

  const features: Array<{ feature: Record<string, any>; index: number }> = [];

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (let i = 0; i < geojson.features.length; i++) {
      const f = geojson.features[i];
      if (f && f.geometry) {
        features.push({ feature: f, index: i });
      }
    }
  } else if (geojson.type === 'Feature' && geojson.geometry) {
    features.push({ feature: geojson, index: 0 });
  } else if (geojson.type && geojson.coordinates) {
    // Bare geometry
    features.push({
      feature: { type: 'Feature', geometry: geojson, properties: {} },
      index: 0,
    });
  }

  for (const { feature, index } of features) {
    const geom = feature.geometry;
    const props = feature.properties || {};

    if (!geom || !geom.type) continue;

    // Handle GeometryCollection by splitting into sub-features
    if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const subGeom of geom.geometries) {
        processGeometry(subGeom, props, index, waypoints, routes);
        if (isPointGeometry(subGeom.type)) pointCount++;
        else if (isLineGeometry(subGeom.type)) lineCount++;
        else if (isPolygonGeometry(subGeom.type)) polygonCount++;
      }
    } else {
      processGeometry(geom, props, index, waypoints, routes);
      if (isPointGeometry(geom.type)) pointCount++;
      else if (isLineGeometry(geom.type)) lineCount++;
      else if (isPolygonGeometry(geom.type)) polygonCount++;
    }
  }

  return { waypoints, routes, pointCount, lineCount, polygonCount };
}

function processGeometry(
  geometry: Record<string, any>,
  properties: Record<string, any>,
  featureIndex: number,
  waypoints: GeoJsonWaypoint[],
  routes: GeoJsonRoute[],
): void {
  if (!geometry || !geometry.type) return;

  switch (geometry.type) {
    case 'Point': {
      const coords = geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) break;

      const lon = coords[0];
      const lat = coords[1];
      const ele = coords.length > 2 && isFinite(coords[2]) ? coords[2] : null;

      if (!isFinite(lon) || !isFinite(lat)) break;

      const name = properties.name || properties.title || properties.Name || properties.Title || null;
      const description = properties.description || properties.desc || properties.Description || null;
      const kind = mapGeoJsonToWaypointKind(properties);
      const color = properties['marker-color'] || null;
      const symbol = properties['marker-symbol'] || properties.symbol || null;

      waypoints.push({
        lat,
        lon,
        ele,
        eleFt: ele != null ? Math.round(ele * M_TO_FT) : null,
        name: name ? String(name) : null,
        description: description ? String(description) : null,
        kind,
        color: color ? String(color) : null,
        symbol: symbol ? String(symbol) : null,
        featureIndex,
        properties,
      });
      break;
    }

    case 'MultiPoint': {
      if (!Array.isArray(geometry.coordinates)) break;
      for (let pi = 0; pi < geometry.coordinates.length; pi++) {
        const coords = geometry.coordinates[pi];
        if (!Array.isArray(coords) || coords.length < 2) continue;

        const lon = coords[0];
        const lat = coords[1];
        const ele = coords.length > 2 && isFinite(coords[2]) ? coords[2] : null;

        if (!isFinite(lon) || !isFinite(lat)) continue;

        const baseName = properties.name || properties.title || null;
        const name = baseName ? `${baseName} (${pi + 1})` : null;
        const kind = mapGeoJsonToWaypointKind(properties);

        waypoints.push({
          lat,
          lon,
          ele,
          eleFt: ele != null ? Math.round(ele * M_TO_FT) : null,
          name,
          description: properties.description || null,
          kind,
          color: properties['marker-color'] || null,
          symbol: properties['marker-symbol'] || null,
          featureIndex,
          properties,
        });
      }
      break;
    }

    case 'LineString':
    case 'MultiLineString': {
      const name = properties.name || properties.title || properties.Name ||
        properties['ecs:routeName'] || null;
      const description = properties.description || properties.desc || null;
      const source = properties['ecs:routeSource'] || properties.source || null;
      const distanceMi = properties['ecs:distanceMi'] != null
        ? Number(properties['ecs:distanceMi'])
        : computeGeometryDistance(geometry);
      const etaHours = properties['ecs:etaHours'] != null
        ? Number(properties['ecs:etaHours'])
        : estimateEta(distanceMi);
      const color = properties.stroke || properties['stroke-color'] || null;
      const lineWidth = properties['stroke-width'] != null ? Number(properties['stroke-width']) : null;

      routes.push({
        name: name ? String(name) : null,
        description: description ? String(description) : null,
        source: source ? String(source) : null,
        distanceMi,
        etaHours,
        color: color ? String(color) : null,
        lineWidth,
        featureIndex,
        geometry,
        properties,
        pointCount: countLinePoints(geometry),
      });
      break;
    }

    case 'Polygon':
    case 'MultiPolygon': {
      const name = properties.name || properties.title || properties.Name || null;
      const description = properties.description || properties.desc || null;
      const distanceMi = computeGeometryDistance(geometry);

      routes.push({
        name: name ? `${String(name)} (boundary)` : 'Polygon Boundary',
        description: description ? String(description) : null,
        source: properties.source || null,
        distanceMi,
        etaHours: null,
        color: properties.stroke || properties.fill || null,
        lineWidth: properties['stroke-width'] != null ? Number(properties['stroke-width']) : null,
        featureIndex,
        geometry,
        properties,
        pointCount: countLinePoints(geometry),
      });
      break;
    }
  }
}

// ── Name Extraction ─────────────────────────────────────────

function extractCollectionName(geojson: Record<string, any>): string {
  // ECS expedition name
  if (geojson['ecs:expedition']?.title) return geojson['ecs:expedition'].title;

  // Top-level name
  if (geojson.name) return String(geojson.name);
  if (geojson.title) return String(geojson.title);

  // First feature name
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      const props = f?.properties || {};
      const name = props.name || props.title || props.Name;
      if (name) return String(name);
    }
  }

  return 'Imported GeoJSON';
}

function extractCollectionDescription(geojson: Record<string, any>): string | null {
  if (geojson.description) return String(geojson.description);
  if (geojson['ecs:expedition']?.notes) return geojson['ecs:expedition'].notes;
  return null;
}

// ── Main Parse Function ─────────────────────────────────────

export function parseGeoJSON(jsonString: string): GeoJsonParseResult {
  if (!jsonString || typeof jsonString !== 'string') {
    throw new Error('INVALID INPUT — Expected a GeoJSON string.');
  }

  let geojson: Record<string, any>;
  try {
    geojson = JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error(`INVALID JSON — ${err.message || 'Failed to parse JSON.'}`);
  }

  if (!geojson || typeof geojson !== 'object') {
    throw new Error('INVALID GEOJSON — Parsed result is not an object.');
  }

  // Validate GeoJSON type
  const validTypes = ['FeatureCollection', 'Feature', 'Point', 'MultiPoint',
    'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];

  if (!geojson.type || !validTypes.includes(geojson.type)) {
    throw new Error(
      `INVALID GEOJSON — Expected a valid GeoJSON type (FeatureCollection, Feature, etc.) ` +
      `but got "${geojson.type || 'undefined'}".`
    );
  }

  // Detect source
  const source = detectGeoJsonSource(geojson);

  // Process features
  const { waypoints, routes, pointCount, lineCount, polygonCount } = processFeatures(geojson);

  if (waypoints.length === 0 && routes.length === 0) {
    throw new Error('GeoJSON contains no importable features (no Point, LineString, or Polygon geometries found).');
  }

  // Compute stats
  const { totalCoords, bounds } = computeCoordStats(geojson);

  // Count total features
  let totalFeatures = 0;
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    totalFeatures = geojson.features.length;
  } else if (geojson.type === 'Feature') {
    totalFeatures = 1;
  } else {
    totalFeatures = 1; // bare geometry
  }

  // Extract metadata
  const name = extractCollectionName(geojson);
  const description = extractCollectionDescription(geojson);

  return {
    name,
    description,
    source,

    waypoints,
    routes,

    totalFeatures,
    totalPointFeatures: pointCount,
    totalLineFeatures: lineCount,
    totalPolygonFeatures: polygonCount,
    totalCoordinates: totalCoords,
    bounds,

    raw: geojson,

    ecsExpedition: geojson['ecs:expedition'] || null,
    ecsReadiness: geojson['ecs:readiness'] || null,
  };
}

// ── Validation ──────────────────────────────────────────────

export function validateGeoJsonFile(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'File content is empty or invalid.' };
  }

  const trimmed = content.trim();

  // Must start with { (JSON object)
  if (!trimmed.startsWith('{')) {
    if (trimmed.startsWith('[')) {
      return { valid: false, error: 'File is a JSON array, not a GeoJSON object. Expected a FeatureCollection or Feature.' };
    }
    if (trimmed.startsWith('<')) {
      return { valid: false, error: 'File appears to be XML (GPX or KML?), not GeoJSON. Please select a .geojson file.' };
    }
    return { valid: false, error: 'File is not valid JSON. Expected a GeoJSON object.' };
  }

  // Try to parse
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    return { valid: false, error: `Invalid JSON: ${err.message || 'parse error'}` };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'Parsed JSON is not an object.' };
  }

  // Check for GeoJSON type
  if (!parsed.type) {
    return { valid: false, error: 'JSON object has no "type" property. Not a valid GeoJSON file.' };
  }

  const validTypes = ['FeatureCollection', 'Feature', 'Point', 'MultiPoint',
    'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];

  if (!validTypes.includes(parsed.type)) {
    return { valid: false, error: `Unrecognized GeoJSON type: "${parsed.type}". Expected FeatureCollection, Feature, or a geometry type.` };
  }

  // Check for features or coordinates
  if (parsed.type === 'FeatureCollection') {
    if (!Array.isArray(parsed.features)) {
      return { valid: false, error: 'FeatureCollection has no "features" array.' };
    }
    if (parsed.features.length === 0) {
      return { valid: false, error: 'FeatureCollection is empty (0 features).' };
    }
    // Check that at least one feature has geometry
    const hasGeometry = parsed.features.some((f: any) => f?.geometry?.type);
    if (!hasGeometry) {
      return { valid: false, error: 'No features in the FeatureCollection have geometry data.' };
    }
  } else if (parsed.type === 'Feature') {
    if (!parsed.geometry || !parsed.geometry.type) {
      return { valid: false, error: 'Feature has no geometry.' };
    }
  } else {
    // Bare geometry
    if (!parsed.coordinates && parsed.type !== 'GeometryCollection') {
      return { valid: false, error: `Geometry type "${parsed.type}" has no coordinates.` };
    }
  }

  return { valid: true };
}

// ── File Detection Helper ───────────────────────────────────

/**
 * Quick check if a file is likely GeoJSON based on extension and/or content.
 */
export function isGeoJsonFile(fileName: string, content?: string): boolean {
  const ext = (fileName || '').toLowerCase().split('.').pop() || '';
  if (ext === 'geojson' || ext === 'json') {
    if (content) {
      const trimmed = content.trim();
      return trimmed.startsWith('{') && (
        trimmed.includes('"FeatureCollection"') ||
        trimmed.includes('"Feature"') ||
        trimmed.includes('"Point"') ||
        trimmed.includes('"LineString"') ||
        trimmed.includes('"Polygon"')
      );
    }
    return ext === 'geojson';
  }
  return false;
}

