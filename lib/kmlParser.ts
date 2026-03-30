/**
 * KML / KMZ Import Parser — Expedition Command System
 *
 * Parses OGC KML 2.2 documents and converts them into ECS-compatible
 * waypoints and routes. Handles:
 *
 *   - Placemark Point → EcsWaypoint records
 *   - Placemark LineString / LinearRing → EcsRoute with GeoJSON geometry
 *   - Placemark Polygon → EcsRoute (outer boundary as route path)
 *   - MultiGeometry → split into individual features
 *   - KML ExtendedData → ECS metadata properties
 *   - Folder hierarchy preservation
 *   - Style extraction (icon, color, line width)
 *   - KMZ archive support (ZIP containing doc.kml)
 *
 * Sources supported:
 *   - Google Earth Pro / Desktop
 *   - Google My Maps
 *   - ArcGIS Online / ArcGIS Pro
 *   - QGIS KML export
 *   - Garmin BaseCamp KML
 *   - CalTopo KML export
 *   - Gaia GPS KML export
 *   - onX Maps KML export
 *   - ECS round-trip exports
 *   - Any OGC KML 2.2 compliant producer
 *
 * Returns a structured KmlParseResult with computed stats,
 * bounds, folder tree, and pre-mapped waypoint kinds.
 */

import type { EcsWaypointKind } from './expeditionTypes';

// ── Types ───────────────────────────────────────────────────

export interface KmlWaypoint {
  lat: number;
  lon: number;
  ele: number | null;
  eleFt: number | null;
  name: string | null;
  description: string | null;
  kind: EcsWaypointKind;
  color: string | null;
  iconHref: string | null;
  folder: string | null;
  featureIndex: number;
  extendedData: Record<string, string>;
  properties: Record<string, any>;
}

export interface KmlRoute {
  name: string | null;
  description: string | null;
  source: string | null;
  distanceMi: number | null;
  etaHours: number | null;
  color: string | null;
  lineWidth: number | null;
  folder: string | null;
  featureIndex: number;
  geometryType: 'LineString' | 'LinearRing' | 'Polygon' | 'MultiGeometry';
  coordinates: number[][];
  properties: Record<string, any>;
  extendedData: Record<string, string>;
  pointCount: number;
}

export interface KmlFolder {
  name: string;
  depth: number;
  featureCount: number;
  waypointCount: number;
  routeCount: number;
}

export interface KmlBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface KmlSourceInfo {
  generator: string | null;
  detectedApp: string | null;
  appIcon: string;
  appColor: string;
  isEcsExport: boolean;
}

export interface KmlParseResult {
  // Metadata
  name: string;
  description: string | null;
  source: KmlSourceInfo;

  // Parsed features
  waypoints: KmlWaypoint[];
  routes: KmlRoute[];

  // Folder hierarchy
  folders: KmlFolder[];

  // Stats
  totalPlacemarks: number;
  totalPointFeatures: number;
  totalLineFeatures: number;
  totalPolygonFeatures: number;
  totalCoordinates: number;
  bounds: KmlBounds | null;

  // Original KML string (for passthrough)
  rawXml: string;

  // ECS metadata if present
  ecsMetadata: Record<string, any> | null;
}

// ── Constants ───────────────────────────────────────────────

const EARTH_RADIUS_MI = 3958.8;
const M_TO_FT = 3.28084;
const KML_COLOR = '#3B82F6';

// ── Haversine ───────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── XML Parsing Helpers ─────────────────────────────────────
// Lightweight XML tag extraction without a full DOM parser.
// Works for well-formed KML which is always valid XML.

function getTagContent(xml: string, tag: string): string | null {
  // Match <tag>...</tag> or <tag ...>...</tag>
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function getTagContentAll(xml: string, tag: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function getTagAttribute(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*?\\s${attr}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function getAllPlacemarks(xml: string): string[] {
  const results: string[] = [];
  const regex = /<Placemark(?:\s[^>]*)?>([\s\S]*?)<\/Placemark>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function getAllFolders(xml: string, depth: number = 0): KmlFolder[] {
  const folders: KmlFolder[] = [];
  const regex = /<Folder(?:\s[^>]*)?>([\s\S]*?)<\/Folder>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const content = match[1];
    const name = getTagContent(content, 'name') || 'Unnamed Folder';
    const placemarks = getAllPlacemarks(content);
    let wpCount = 0;
    let rtCount = 0;
    for (const pm of placemarks) {
      if (pm.includes('<Point>') || pm.includes('<Point ')) wpCount++;
      if (pm.includes('<LineString') || pm.includes('<LinearRing') || pm.includes('<Polygon')) rtCount++;
    }
    folders.push({
      name,
      depth,
      featureCount: placemarks.length,
      waypointCount: wpCount,
      routeCount: rtCount,
    });
    // Recurse into nested folders
    const nested = getAllFolders(content, depth + 1);
    folders.push(...nested);
  }
  return folders;
}

function stripCDATA(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

// ── KML Coordinate Parsing ──────────────────────────────────
// KML coordinates are: lon,lat,alt separated by whitespace

function parseKmlCoordinates(coordString: string): number[][] {
  if (!coordString) return [];
  const coords: number[][] = [];
  const tuples = coordString.trim().split(/\s+/);
  for (const tuple of tuples) {
    const parts = tuple.split(',');
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const alt = parts.length > 2 ? parseFloat(parts[2]) : 0;
      if (isFinite(lon) && isFinite(lat)) {
        coords.push([lon, lat, isFinite(alt) ? alt : 0]);
      }
    }
  }
  return coords;
}

// ── KML Color Parsing ───────────────────────────────────────
// KML colors are aabbggrr (alpha, blue, green, red) — reverse of HTML

function kmlColorToHex(kmlColor: string | null): string | null {
  if (!kmlColor || kmlColor.length < 6) return null;
  const c = kmlColor.replace('#', '').toLowerCase();
  if (c.length === 8) {
    // aabbggrr → #rrggbb
    const rr = c.substring(6, 8);
    const gg = c.substring(4, 6);
    const bb = c.substring(2, 4);
    return `#${rr}${gg}${bb}`;
  }
  if (c.length === 6) {
    // bbggrr → #rrggbb
    const rr = c.substring(4, 6);
    const gg = c.substring(2, 4);
    const bb = c.substring(0, 2);
    return `#${rr}${gg}${bb}`;
  }
  return null;
}

// ── KML ExtendedData Parsing ────────────────────────────────

function parseExtendedData(placemarkXml: string): Record<string, string> {
  const data: Record<string, string> = {};
  const extDataBlock = getTagContent(placemarkXml, 'ExtendedData');
  if (!extDataBlock) return data;

  // Parse <Data name="key"><value>val</value></Data>
  const dataRegex = /<Data\s+name\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/Data>/gi;
  let match: RegExpExecArray | null;
  while ((match = dataRegex.exec(extDataBlock)) !== null) {
    const key = match[1];
    const valueBlock = match[2];
    const value = getTagContent(valueBlock, 'value');
    if (key && value != null) {
      data[key] = stripCDATA(value);
    }
  }

  // Parse <SimpleData name="key">val</SimpleData> (Schema-based)
  const simpleRegex = /<SimpleData\s+name\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/SimpleData>/gi;
  while ((match = simpleRegex.exec(extDataBlock)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key && value != null) {
      data[key] = stripCDATA(value.trim());
    }
  }

  return data;
}

// ── Source Detection ────────────────────────────────────────

const KML_SOURCE_PATTERNS: Array<{
  pattern: RegExp;
  app: string;
  icon: string;
  color: string;
}> = [
  { pattern: /expedition\s*command/i, app: 'ECS', icon: 'shield-outline', color: '#C48A2C' },
  { pattern: /google\s*earth/i, app: 'Google Earth', icon: 'earth-outline', color: '#4285F4' },
  { pattern: /google\s*my\s*maps/i, app: 'Google My Maps', icon: 'map-outline', color: '#34A853' },
  { pattern: /google/i, app: 'Google Maps', icon: 'map-outline', color: '#34A853' },
  { pattern: /arcgis/i, app: 'ArcGIS', icon: 'globe-outline', color: '#2C7AC3' },
  { pattern: /esri/i, app: 'ArcGIS (Esri)', icon: 'globe-outline', color: '#2C7AC3' },
  { pattern: /qgis/i, app: 'QGIS', icon: 'layers-outline', color: '#589632' },
  { pattern: /garmin/i, app: 'Garmin', icon: 'navigate-outline', color: '#007DC3' },
  { pattern: /basecamp/i, app: 'Garmin BaseCamp', icon: 'navigate-outline', color: '#007DC3' },
  { pattern: /caltopo/i, app: 'CalTopo', icon: 'layers-outline', color: '#2E7D32' },
  { pattern: /gaia\s*gps/i, app: 'Gaia GPS', icon: 'compass-outline', color: '#FF6B35' },
  { pattern: /onx/i, app: 'onX Maps', icon: 'map-outline', color: '#E85D04' },
  { pattern: /alltrails/i, app: 'AllTrails', icon: 'trail-sign-outline', color: '#428813' },
  { pattern: /mapbox/i, app: 'Mapbox', icon: 'map-outline', color: '#4264FB' },
  { pattern: /avenza/i, app: 'Avenza Maps', icon: 'map-outline', color: '#E53935' },
  { pattern: /magellan/i, app: 'Magellan', icon: 'navigate-outline', color: '#1565C0' },
  { pattern: /trimble/i, app: 'Trimble', icon: 'locate-outline', color: '#0072CE' },
  { pattern: /fatmap/i, app: 'FATMAP', icon: 'layers-outline', color: '#FF5722' },
  { pattern: /earth\s*point/i, app: 'EarthPoint', icon: 'earth-outline', color: '#795548' },
  { pattern: /openstreetmap|osm/i, app: 'OpenStreetMap', icon: 'globe-outline', color: '#7EBC6F' },
];

function detectKmlSource(xml: string): KmlSourceInfo {
  // Check for ECS export metadata
  if (xml.includes('ecs:exportMeta') || xml.includes('Expedition Command System')) {
    return {
      generator: 'Expedition Command System',
      detectedApp: 'ECS',
      appIcon: 'shield-outline',
      appColor: '#C48A2C',
      isEcsExport: true,
    };
  }

  // Check <atom:generator>, <atom:author>, or top-level <description>
  const generator = getTagContent(xml, 'atom:generator')
    || getTagContent(xml, 'generator')
    || getTagAttribute(xml, 'kml', 'creator')
    || '';
  const description = getTagContent(xml, 'description') || '';
  const author = getTagContent(xml, 'atom:author') || '';

  const allHints = `${generator} ${description} ${author}`;

  for (const sp of KML_SOURCE_PATTERNS) {
    if (sp.pattern.test(allHints)) {
      return {
        generator: generator || null,
        detectedApp: sp.app,
        appIcon: sp.icon,
        appColor: sp.color,
        isEcsExport: false,
      };
    }
  }

  // Check the first 3000 chars for patterns
  const snippet = xml.substring(0, 3000);
  for (const sp of KML_SOURCE_PATTERNS) {
    if (sp.pattern.test(snippet)) {
      return {
        generator: generator || null,
        detectedApp: sp.app,
        appIcon: sp.icon,
        appColor: sp.color,
        isEcsExport: false,
      };
    }
  }

  // Google Earth is the most common KML producer
  if (xml.includes('xmlns="http://www.opengis.net/kml/2.2"') || xml.includes('xmlns="http://earth.google.com')) {
    return {
      generator: generator || null,
      detectedApp: 'Google Earth',
      appIcon: 'earth-outline',
      appColor: '#4285F4',
      isEcsExport: false,
    };
  }

  return {
    generator: generator || null,
    detectedApp: generator || 'KML File',
    appIcon: 'document-outline',
    appColor: '#78909C',
    isEcsExport: false,
  };
}

// ── Waypoint Kind Mapping ───────────────────────────────────

/** Map KML icon href to EcsWaypointKind */
const ICON_HREF_TO_KIND: Array<{ pattern: RegExp; kind: EcsWaypointKind }> = [
  { pattern: /campground|camping|tent|shelter|lodging/i, kind: 'camp' },
  { pattern: /gas|fuel|station|petrol/i, kind: 'fuel' },
  { pattern: /water|spring|creek|well|drink/i, kind: 'water' },
  { pattern: /caution|danger|warning|hazard|road.?closure|blocked/i, kind: 'hazard' },
  { pattern: /info|information|note|library|viewpoint|photo|camera/i, kind: 'note' },
  { pattern: /emergency|hospital|accident|fire|sos|medical/i, kind: 'incident' },
  { pattern: /flag|marker|pin|pushpin|paddle/i, kind: 'waypoint' },
];

/** Map KML Placemark properties to EcsWaypointKind */
export function mapKmlToWaypointKind(
  name: string | null,
  description: string | null,
  iconHref: string | null,
  color: string | null,
  extendedData: Record<string, string>,
): EcsWaypointKind {
  // 1. Direct ECS kind from ExtendedData (round-trip)
  const ecsKind = extendedData['ecs:waypointKind'] || extendedData['ecs_kind'];
  if (ecsKind && ['waypoint', 'camp', 'fuel', 'water', 'hazard', 'note', 'incident'].includes(ecsKind)) {
    return ecsKind as EcsWaypointKind;
  }

  // 2. Icon href matching
  if (iconHref) {
    for (const mapping of ICON_HREF_TO_KIND) {
      if (mapping.pattern.test(iconHref)) return mapping.kind;
    }
  }

  // 3. Name-based heuristics
  const n = (name || '').toLowerCase();
  if (n.includes('camp') || n.includes('tent') || n.includes('shelter') || n.includes('lodge')) return 'camp';
  if (n.includes('fuel') || n.includes('gas') || n.includes('station') || n.includes('petrol')) return 'fuel';
  if (n.includes('water') || n.includes('spring') || n.includes('creek') || n.includes('well')) return 'water';
  if (n.includes('hazard') || n.includes('danger') || n.includes('warning') || n.includes('caution')) return 'hazard';
  if (n.includes('note') || n.includes('info') || n.includes('photo') || n.includes('viewpoint')) return 'note';
  if (n.includes('incident') || n.includes('emergency') || n.includes('accident')) return 'incident';

  // 4. Description-based heuristics
  const d = (description || '').toLowerCase();
  if (d.includes('camp') || d.includes('tent')) return 'camp';
  if (d.includes('fuel') || d.includes('gas station')) return 'fuel';
  if (d.includes('water source') || d.includes('spring')) return 'water';
  if (d.includes('hazard') || d.includes('danger')) return 'hazard';

  // 5. ExtendedData type/category
  const type = (extendedData['type'] || extendedData['category'] || extendedData['Type'] || '').toLowerCase();
  if (type.includes('camp')) return 'camp';
  if (type.includes('fuel') || type.includes('gas')) return 'fuel';
  if (type.includes('water')) return 'water';
  if (type.includes('hazard') || type.includes('danger')) return 'hazard';
  if (type.includes('note') || type.includes('info')) return 'note';

  // 6. Color-based heuristic (last resort)
  if (color) {
    const c = color.toLowerCase();
    if (c.includes('ff0000') || c.includes('red')) return 'hazard';
    if (c.includes('00ff00') || c.includes('green')) return 'camp';
    if (c.includes('0000ff') || c.includes('blue')) return 'water';
    if (c.includes('ff9900') || c.includes('orange') || c.includes('yellow')) return 'fuel';
  }

  return 'waypoint';
}

// ── Style Extraction ────────────────────────────────────────

interface KmlStyle {
  iconHref: string | null;
  iconColor: string | null;
  lineColor: string | null;
  lineWidth: number | null;
  polyColor: string | null;
}

function extractStyles(xml: string): Map<string, KmlStyle> {
  const styles = new Map<string, KmlStyle>();

  // Parse <Style id="...">
  const styleRegex = /<Style\s+id\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/Style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(xml)) !== null) {
    const id = match[1];
    const content = match[2];
    styles.set(`#${id}`, parseStyleContent(content));
  }

  // Parse <StyleMap id="..."> → use normal style
  const styleMapRegex = /<StyleMap\s+id\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/StyleMap>/gi;
  while ((match = styleMapRegex.exec(xml)) !== null) {
    const id = match[1];
    const content = match[2];

    // Find the "normal" pair
    const pairRegex = /<Pair>([\s\S]*?)<\/Pair>/gi;
    let pairMatch: RegExpExecArray | null;
    while ((pairMatch = pairRegex.exec(content)) !== null) {
      const pairContent = pairMatch[1];
      const key = getTagContent(pairContent, 'key');
      if (key === 'normal') {
        const styleUrl = getTagContent(pairContent, 'styleUrl');
        if (styleUrl && styles.has(styleUrl)) {
          styles.set(`#${id}`, styles.get(styleUrl)!);
        }
        // Also check for inline Style
        const inlineStyle = getTagContent(pairContent, 'Style');
        if (inlineStyle) {
          styles.set(`#${id}`, parseStyleContent(inlineStyle));
        }
        break;
      }
    }
  }

  return styles;
}

function parseStyleContent(content: string): KmlStyle {
  const iconStyle = getTagContent(content, 'IconStyle');
  const lineStyle = getTagContent(content, 'LineStyle');
  const polyStyle = getTagContent(content, 'PolyStyle');

  let iconHref: string | null = null;
  let iconColor: string | null = null;
  let lineColor: string | null = null;
  let lineWidth: number | null = null;
  let polyColor: string | null = null;

  if (iconStyle) {
    const icon = getTagContent(iconStyle, 'Icon');
    if (icon) {
      iconHref = getTagContent(icon, 'href');
    }
    const colorStr = getTagContent(iconStyle, 'color');
    iconColor = kmlColorToHex(colorStr);
  }

  if (lineStyle) {
    const colorStr = getTagContent(lineStyle, 'color');
    lineColor = kmlColorToHex(colorStr);
    const widthStr = getTagContent(lineStyle, 'width');
    if (widthStr) lineWidth = parseFloat(widthStr) || null;
  }

  if (polyStyle) {
    const colorStr = getTagContent(polyStyle, 'color');
    polyColor = kmlColorToHex(colorStr);
  }

  return { iconHref, iconColor, lineColor, lineWidth, polyColor };
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

function estimateEta(distanceMi: number): number | null {
  if (distanceMi <= 0) return null;
  return Math.round((distanceMi / 20) * 10) / 10;
}

// ── Folder Path Extraction ──────────────────────────────────

function findPlacemarkFolder(xml: string, placemarkXml: string): string | null {
  // Walk up from the placemark to find the enclosing Folder name
  const idx = xml.indexOf(placemarkXml);
  if (idx < 0) return null;

  // Search backwards from the placemark for the nearest <Folder> → <name>
  const before = xml.substring(0, idx);
  const folderOpenings = before.split('<Folder');
  if (folderOpenings.length <= 1) return null;

  // Get the last folder opening before this placemark
  const lastFolderChunk = folderOpenings[folderOpenings.length - 1];
  // Check if there's a closing </Folder> between the folder opening and the placemark
  const closingsAfterOpen = (lastFolderChunk.match(/<\/Folder>/gi) || []).length;
  const openingsAfterOpen = (lastFolderChunk.match(/<Folder/gi) || []).length;

  // If the folder is still open (not closed before placemark), extract its name
  if (closingsAfterOpen <= openingsAfterOpen) {
    const nameMatch = lastFolderChunk.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
    if (nameMatch) return stripCDATA(nameMatch[1]).trim();
  }

  return null;
}

// ── Main Parse Function ─────────────────────────────────────

export function parseKML(xmlString: string): KmlParseResult {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('INVALID INPUT — Expected a KML XML string.');
  }

  const trimmed = xmlString.trim();

  // Basic XML validation
  if (!trimmed.startsWith('<') && !trimmed.startsWith('<?')) {
    if (trimmed.startsWith('{')) {
      throw new Error('WRONG FORMAT — File appears to be JSON (GeoJSON?), not KML. Please select a .kml file.');
    }
    throw new Error('INVALID KML — File does not appear to be XML.');
  }

  // Check for KML root element
  if (!trimmed.includes('<kml') && !trimmed.includes('<Kml') && !trimmed.includes('<KML')) {
    if (trimmed.includes('<gpx') || trimmed.includes('<GPX')) {
      throw new Error('WRONG FORMAT — File is GPX, not KML. Please select a .kml file or use the GPX importer.');
    }
    throw new Error('INVALID KML — No <kml> root element found.');
  }

  // Detect source
  const source = detectKmlSource(trimmed);

  // Extract styles
  const styleMap = extractStyles(trimmed);

  // Extract folders
  const folders = getAllFolders(trimmed);

  // Extract document name and description
  const docName = getTagContent(trimmed, 'Document')
    ? getTagContent(getTagContent(trimmed, 'Document')!, 'name')
    : getTagContent(trimmed, 'name');
  const docDescription = getTagContent(trimmed, 'Document')
    ? getTagContent(getTagContent(trimmed, 'Document')!, 'description')
    : getTagContent(trimmed, 'description');

  // Extract all placemarks
  const placemarkXmls = getAllPlacemarks(trimmed);

  if (placemarkXmls.length === 0) {
    throw new Error('KML contains no Placemark elements. Nothing to import.');
  }

  const waypoints: KmlWaypoint[] = [];
  const routes: KmlRoute[] = [];
  let totalCoords = 0;
  let pointCount = 0;
  let lineCount = 0;
  let polygonCount = 0;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let hasCoords = false;

  function addBoundsCoord(lon: number, lat: number): void {
    if (!isFinite(lon) || !isFinite(lat)) return;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    hasCoords = true;
  }

  for (let i = 0; i < placemarkXmls.length; i++) {
    const pm = placemarkXmls[i];
    const name = getTagContent(pm, 'name');
    const cleanName = name ? stripCDATA(name) : null;
    const descRaw = getTagContent(pm, 'description');
    const description = descRaw ? stripHtml(stripCDATA(descRaw)) : null;
    const extendedData = parseExtendedData(pm);
    const folder = findPlacemarkFolder(trimmed, pm);

    // Resolve style
    const styleUrl = getTagContent(pm, 'styleUrl');
    let style: KmlStyle = { iconHref: null, iconColor: null, lineColor: null, lineWidth: null, polyColor: null };
    if (styleUrl && styleMap.has(styleUrl)) {
      style = styleMap.get(styleUrl)!;
    }
    // Also check for inline Style
    const inlineStyleXml = getTagContent(pm, 'Style');
    if (inlineStyleXml) {
      const inlineStyle = parseStyleContent(inlineStyleXml);
      // Merge: inline overrides styleUrl
      if (inlineStyle.iconHref) style.iconHref = inlineStyle.iconHref;
      if (inlineStyle.iconColor) style.iconColor = inlineStyle.iconColor;
      if (inlineStyle.lineColor) style.lineColor = inlineStyle.lineColor;
      if (inlineStyle.lineWidth) style.lineWidth = inlineStyle.lineWidth;
      if (inlineStyle.polyColor) style.polyColor = inlineStyle.polyColor;
    }

    // Determine geometry type(s)
    const hasPoint = pm.includes('<Point>') || pm.includes('<Point ');
    const hasLineString = pm.includes('<LineString>') || pm.includes('<LineString ');
    const hasLinearRing = pm.includes('<LinearRing>') || pm.includes('<LinearRing ');
    const hasPolygon = pm.includes('<Polygon>') || pm.includes('<Polygon ');
    const hasMultiGeometry = pm.includes('<MultiGeometry>') || pm.includes('<MultiGeometry ');

    // ── Point Placemark ─────────────────────────────────
    if (hasPoint && !hasLineString && !hasPolygon && !hasMultiGeometry) {
      const pointBlock = getTagContent(pm, 'Point');
      if (pointBlock) {
        const coordStr = getTagContent(pointBlock, 'coordinates');
        if (coordStr) {
          const coords = parseKmlCoordinates(coordStr);
          if (coords.length > 0) {
            const [lon, lat, alt] = coords[0];
            addBoundsCoord(lon, lat);
            totalCoords++;
            pointCount++;

            const kind = mapKmlToWaypointKind(cleanName, description, style.iconHref, style.iconColor, extendedData);

            waypoints.push({
              lat,
              lon,
              ele: alt || null,
              eleFt: alt ? Math.round(alt * M_TO_FT) : null,
              name: cleanName,
              description,
              kind,
              color: style.iconColor,
              iconHref: style.iconHref,
              folder,
              featureIndex: i,
              extendedData,
              properties: {
                ...extendedData,
                name: cleanName,
                description,
                styleUrl,
                iconHref: style.iconHref,
              },
            });
          }
        }
      }
    }

    // ── LineString Placemark ─────────────────────────────
    if (hasLineString && !hasMultiGeometry) {
      const lineBlock = getTagContent(pm, 'LineString');
      if (lineBlock) {
        const coordStr = getTagContent(lineBlock, 'coordinates');
        if (coordStr) {
          const coords = parseKmlCoordinates(coordStr);
          if (coords.length > 1) {
            for (const c of coords) addBoundsCoord(c[0], c[1]);
            totalCoords += coords.length;
            lineCount++;

            const distanceMi = extendedData['ecs:distanceMi']
              ? Number(extendedData['ecs:distanceMi'])
              : computeLineDistance(coords);

            routes.push({
              name: cleanName,
              description,
              source: extendedData['ecs:routeSource'] || source.detectedApp || null,
              distanceMi,
              etaHours: extendedData['ecs:etaHours'] ? Number(extendedData['ecs:etaHours']) : estimateEta(distanceMi),
              color: style.lineColor,
              lineWidth: style.lineWidth,
              folder,
              featureIndex: i,
              geometryType: 'LineString',
              coordinates: coords,
              properties: { ...extendedData, name: cleanName, description },
              extendedData,
              pointCount: coords.length,
            });
          }
        }
      }
    }

    // ── Polygon Placemark ────────────────────────────────
    if (hasPolygon && !hasMultiGeometry) {
      const polyBlock = getTagContent(pm, 'Polygon');
      if (polyBlock) {
        const outerBoundary = getTagContent(polyBlock, 'outerBoundaryIs');
        if (outerBoundary) {
          const ringBlock = getTagContent(outerBoundary, 'LinearRing');
          if (ringBlock) {
            const coordStr = getTagContent(ringBlock, 'coordinates');
            if (coordStr) {
              const coords = parseKmlCoordinates(coordStr);
              if (coords.length > 2) {
                for (const c of coords) addBoundsCoord(c[0], c[1]);
                totalCoords += coords.length;
                polygonCount++;

                const distanceMi = computeLineDistance(coords);

                routes.push({
                  name: cleanName ? `${cleanName} (boundary)` : 'Polygon Boundary',
                  description,
                  source: source.detectedApp || null,
                  distanceMi,
                  etaHours: null,
                  color: style.polyColor || style.lineColor,
                  lineWidth: style.lineWidth,
                  folder,
                  featureIndex: i,
                  geometryType: 'Polygon',
                  coordinates: coords,
                  properties: { ...extendedData, name: cleanName, description },
                  extendedData,
                  pointCount: coords.length,
                });
              }
            }
          }
        }
      }
    }

    // ── Standalone LinearRing (rare but possible) ───────
    if (hasLinearRing && !hasPolygon && !hasMultiGeometry) {
      const ringBlock = getTagContent(pm, 'LinearRing');
      if (ringBlock) {
        const coordStr = getTagContent(ringBlock, 'coordinates');
        if (coordStr) {
          const coords = parseKmlCoordinates(coordStr);
          if (coords.length > 2) {
            for (const c of coords) addBoundsCoord(c[0], c[1]);
            totalCoords += coords.length;
            lineCount++;

            routes.push({
              name: cleanName || 'Linear Ring',
              description,
              source: source.detectedApp || null,
              distanceMi: computeLineDistance(coords),
              etaHours: null,
              color: style.lineColor,
              lineWidth: style.lineWidth,
              folder,
              featureIndex: i,
              geometryType: 'LinearRing',
              coordinates: coords,
              properties: { ...extendedData, name: cleanName, description },
              extendedData,
              pointCount: coords.length,
            });
          }
        }
      }
    }

    // ── MultiGeometry ───────────────────────────────────
    if (hasMultiGeometry) {
      const multiBlock = getTagContent(pm, 'MultiGeometry');
      if (multiBlock) {
        // Extract all Point sub-geometries
        const subPoints = getTagContentAll(multiBlock, 'Point');
        for (const ptBlock of subPoints) {
          const coordStr = getTagContent(ptBlock, 'coordinates');
          if (coordStr) {
            const coords = parseKmlCoordinates(coordStr);
            if (coords.length > 0) {
              const [lon, lat, alt] = coords[0];
              addBoundsCoord(lon, lat);
              totalCoords++;
              pointCount++;

              const kind = mapKmlToWaypointKind(cleanName, description, style.iconHref, style.iconColor, extendedData);
              waypoints.push({
                lat, lon,
                ele: alt || null,
                eleFt: alt ? Math.round(alt * M_TO_FT) : null,
                name: cleanName ? `${cleanName} (pt)` : null,
                description, kind,
                color: style.iconColor,
                iconHref: style.iconHref,
                folder, featureIndex: i,
                extendedData,
                properties: { ...extendedData, name: cleanName, description },
              });
            }
          }
        }

        // Extract all LineString sub-geometries
        const subLines = getTagContentAll(multiBlock, 'LineString');
        const allCoords: number[][] = [];
        for (const lineBlock of subLines) {
          const coordStr = getTagContent(lineBlock, 'coordinates');
          if (coordStr) {
            const coords = parseKmlCoordinates(coordStr);
            if (coords.length > 1) {
              allCoords.push(...coords);
              for (const c of coords) addBoundsCoord(c[0], c[1]);
              totalCoords += coords.length;
            }
          }
        }
        if (allCoords.length > 1) {
          lineCount++;
          const distanceMi = computeLineDistance(allCoords);
          routes.push({
            name: cleanName,
            description,
            source: source.detectedApp || null,
            distanceMi,
            etaHours: estimateEta(distanceMi),
            color: style.lineColor,
            lineWidth: style.lineWidth,
            folder, featureIndex: i,
            geometryType: 'MultiGeometry',
            coordinates: allCoords,
            properties: { ...extendedData, name: cleanName, description },
            extendedData,
            pointCount: allCoords.length,
          });
        }
      }
    }
  }

  if (waypoints.length === 0 && routes.length === 0) {
    throw new Error('KML contains no importable geometry (no Point, LineString, or Polygon elements found in Placemarks).');
  }

  // Check for ECS metadata in ExtendedData
  let ecsMetadata: Record<string, any> | null = null;
  const docExtData = getTagContent(trimmed, 'Document')
    ? parseExtendedData(getTagContent(trimmed, 'Document')!)
    : {};
  if (Object.keys(docExtData).some(k => k.startsWith('ecs:'))) {
    ecsMetadata = docExtData;
  }

  return {
    name: cleanDocName(docName) || 'Imported KML',
    description: docDescription ? stripHtml(stripCDATA(docDescription)) : null,
    source,

    waypoints,
    routes,
    folders,

    totalPlacemarks: placemarkXmls.length,
    totalPointFeatures: pointCount,
    totalLineFeatures: lineCount,
    totalPolygonFeatures: polygonCount,
    totalCoordinates: totalCoords,
    bounds: hasCoords ? {
      minLat: parseFloat(minLat.toFixed(6)),
      maxLat: parseFloat(maxLat.toFixed(6)),
      minLon: parseFloat(minLon.toFixed(6)),
      maxLon: parseFloat(maxLon.toFixed(6)),
    } : null,

    rawXml: trimmed,
    ecsMetadata,
  };
}

function cleanDocName(name: string | null): string | null {
  if (!name) return null;
  return stripCDATA(name).trim() || null;
}

// ── Validation ──────────────────────────────────────────────

export function validateKmlFile(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'File content is empty or invalid.' };
  }

  const trimmed = content.trim();

  // Must start with < (XML)
  if (!trimmed.startsWith('<') && !trimmed.startsWith('<?')) {
    if (trimmed.startsWith('{')) {
      return { valid: false, error: 'File appears to be JSON (GeoJSON?), not KML. Please select a .kml file.' };
    }
    if (trimmed.startsWith('[')) {
      return { valid: false, error: 'File appears to be a JSON array, not KML. Please select a .kml file.' };
    }
    return { valid: false, error: 'File is not valid XML. Expected a KML document.' };
  }

  // Check for KML root element
  if (!trimmed.includes('<kml') && !trimmed.includes('<Kml') && !trimmed.includes('<KML')) {
    if (trimmed.includes('<gpx') || trimmed.includes('<GPX')) {
      return { valid: false, error: 'File is GPX, not KML. Please select a .kml file or use the GPX importer.' };
    }
    if (trimmed.includes('<html') || trimmed.includes('<HTML')) {
      return { valid: false, error: 'File is HTML, not KML. Please select a .kml file.' };
    }
    return { valid: false, error: 'No <kml> root element found. Not a valid KML file.' };
  }

  // Check for at least one Placemark
  if (!trimmed.includes('<Placemark')) {
    return { valid: false, error: 'KML file contains no <Placemark> elements. Nothing to import.' };
  }

  return { valid: true };
}

// ── File Detection Helper ───────────────────────────────────

/**
 * Quick check if a file is likely KML/KMZ based on extension.
 */
export function isKmlFile(fileName: string): boolean {
  const ext = (fileName || '').toLowerCase().split('.').pop() || '';
  return ext === 'kml' || ext === 'kmz';
}

/**
 * Check if content is a KMZ (ZIP) file by checking for PK magic bytes.
 */
export function isKmzContent(content: string | ArrayBuffer): boolean {
  if (typeof content === 'string') {
    return content.startsWith('PK');
  }
  if (content instanceof ArrayBuffer && content.byteLength >= 2) {
    const view = new Uint8Array(content);
    return view[0] === 0x50 && view[1] === 0x4B; // PK
  }
  return false;
}

// ── KML to GeoJSON Conversion ───────────────────────────────
// Convert parsed KML route coordinates to GeoJSON for storage

export function kmlRouteToGeoJson(route: KmlRoute): Record<string, any> {
  const geometry = route.geometryType === 'Polygon'
    ? {
        type: 'Polygon',
        coordinates: [route.coordinates.map(c => c.length > 2 ? [c[0], c[1], c[2]] : [c[0], c[1]])],
      }
    : {
        type: 'LineString',
        coordinates: route.coordinates.map(c => c.length > 2 ? [c[0], c[1], c[2]] : [c[0], c[1]]),
      };

  return {
    type: 'Feature',
    geometry,
    properties: {
      name: route.name,
      description: route.description,
      source: route.source,
      'ecs:featureSource': 'route',
      'ecs:importedFrom': 'kml',
      ...route.extendedData,
    },
  };
}

