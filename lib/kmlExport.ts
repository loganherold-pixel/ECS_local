/**
 * KML / KMZ Export Utility
 *
 * Generates valid KML 2.2 XML from an ImportedRoute object, and
 * optionally wraps it into a KMZ (zipped KML) archive.
 *
 * KML Output includes:
 *   - <Document> with route name, description, and export metadata
 *   - Shared <Style> definitions for each waypoint type with:
 *       - <IconStyle> using Google Earth palette icons mapped to type
 *       - <LabelStyle> with type-specific color
 *   - A track <Style> with <LineStyle> (ECS amber, width 3)
 *   - <Placemark> elements for each waypoint with:
 *       - <name>, <description>, and <styleUrl>
 *       - <Point><coordinates>lon,lat,ele</coordinates></Point>
 *       - <ExtendedData> with waypoint type classification
 *   - <Folder> containing track segment <Placemark> elements with:
 *       - <LineString><coordinates>...</coordinates></LineString>
 *       - <tessellate>1</tessellate> for ground clamping
 *
 * KMZ Output:
 *   - A ZIP archive containing a single entry "doc.kml"
 *   - Uses STORE method (no compression) for maximum compatibility
 *   - Includes CRC-32 checksums per ZIP specification
 *   - Returns a Uint8Array suitable for Blob creation or file writing
 *   - Smaller than raw KML when combined with network transfer compression
 *   - Single-file distribution format preferred by Google Earth
 *
 * Conforms to KML 2.2: https://www.ogc.org/standard/kml/
 * Conforms to KMZ: https://developers.google.com/kml/documentation/kmzarchives
 *
 * Compatible with Google Earth, Google Maps, QGIS, ArcGIS, and
 * other KML/KMZ-capable applications.
 */


import type { ImportedRoute, RouteWaypoint, RouteSegment } from './routeStore';
import { getWaypointTypeConfig, type RouteWaypointType } from './waypointTypes';

// ── XML Helpers ─────────────────────────────────────────

/** Escape special XML characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert a hex color (#RRGGBB) to KML color format (aaBBGGRR).
 * KML uses reversed byte order with alpha prefix.
 */
function hexToKmlColor(hex: string, alpha: string = 'ff'): string {
  // Remove leading #
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) return `${alpha}ffffff`;
  const r = h.substring(0, 2);
  const g = h.substring(2, 4);
  const b = h.substring(4, 6);
  // KML format: aaBBGGRR
  return `${alpha}${b}${g}${r}`;
}

// ── Waypoint Type → Google Earth Icon URL ───────────────

/**
 * Map waypoint type to a Google Earth palette icon URL.
 * Uses the standard Google Earth icon palette available in all
 * KML-compatible viewers.
 */
function getIconUrlForType(type: RouteWaypointType | null | undefined): string {
  if (!type) {
    // Default: green paddle pin
    return 'http://maps.google.com/mapfiles/kml/paddle/grn-blank.png';
  }
  const iconMap: Record<RouteWaypointType, string> = {
    camp: 'http://maps.google.com/mapfiles/kml/paddle/grn-blank.png',
    water: 'http://maps.google.com/mapfiles/kml/paddle/blu-blank.png',
    fuel: 'http://maps.google.com/mapfiles/kml/paddle/ylw-blank.png',
    hazard: 'http://maps.google.com/mapfiles/kml/paddle/red-blank.png',
    viewpoint: 'http://maps.google.com/mapfiles/kml/paddle/purple-blank.png',
    trailhead: 'http://maps.google.com/mapfiles/kml/paddle/ltblu-blank.png',
    junction: 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png',
  };
  return iconMap[type] || 'http://maps.google.com/mapfiles/kml/paddle/grn-blank.png';
}

/**
 * Get the KML color string for a waypoint type.
 * Uses the type's configured color converted to KML aaBBGGRR format.
 */
function getKmlColorForType(type: RouteWaypointType | null | undefined): string {
  if (!type) return 'ff6abb66'; // default green in KML format
  const config = getWaypointTypeConfig(type);
  if (!config) return 'ff6abb66';
  return hexToKmlColor(config.color);
}

// ── Style ID Helpers ────────────────────────────────────

/** Generate a stable style ID for a waypoint type */
function getStyleId(type: RouteWaypointType | null | undefined): string {
  return type ? `ecs-wpt-${type}` : 'ecs-wpt-default';
}

const TRACK_STYLE_ID = 'ecs-track';

// ── KML Generation ──────────────────────────────────────

/**
 * Generate a complete KML 2.2 XML string from an ImportedRoute.
 *
 * @param route - The route to export
 * @param options - Optional export configuration
 * @returns Valid KML 2.2 XML string
 */
export function generateKML(
  route: ImportedRoute,
  options?: {
    /** Include route track segments as LineString Placemarks (default: true) */
    includeTrack?: boolean;
    /** Include waypoints as Point Placemarks (default: true) */
    includeWaypoints?: boolean;
    /** Creator application name */
    creator?: string;
    /** Additional description text */
    description?: string;
    /** Altitude mode: clampToGround, relativeToGround, absolute (default: clampToGround) */
    altitudeMode?: 'clampToGround' | 'relativeToGround' | 'absolute';
  }
): string {
  const {
    includeTrack = true,
    includeWaypoints = true,
    creator = 'Expedition Command System',
    description,
    altitudeMode = 'clampToGround',
  } = options || {};

  const lines: string[] = [];
  const now = new Date().toISOString();
  const routeDesc = description || route.description || '';

  // ── XML Declaration & KML Root ────────────────────────
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<kml xmlns="http://www.opengis.net/kml/2.2"' +
    ' xmlns:gx="http://www.google.com/kml/ext/2.2"' +
    ' xmlns:atom="http://www.w3.org/2005/Atom">'
  );
  lines.push('  <Document>');

  // ── Document Name & Description ───────────────────────
  lines.push(`    <name>${escapeXml(route.name)}</name>`);

  // Build a rich description with route metadata
  const descParts: string[] = [];
  if (routeDesc) descParts.push(routeDesc);
  descParts.push(`Distance: ${route.total_distance_miles} mi`);
  if (route.elevation_gain_ft != null) {
    descParts.push(`Elevation Gain: ${route.elevation_gain_ft} ft`);
  }
  descParts.push(`Waypoints: ${route.waypoint_count}`);
  descParts.push(`Segments: ${route.segment_count}`);
  descParts.push(`Source: ${route.source_format.toUpperCase()}`);
  if (route.source_app) descParts.push(`App: ${route.source_app}`);
  descParts.push(`Exported: ${now}`);
  descParts.push(`Generator: ${creator}`);

  lines.push(`    <description>${escapeXml(descParts.join('\n'))}</description>`);

  // Atom author
  lines.push('    <atom:author>');
  lines.push(`      <atom:name>${escapeXml(creator)}</atom:name>`);
  lines.push('    </atom:author>');

  // ── Snippet (short description shown in sidebar) ──────
  lines.push(
    `    <Snippet maxLines="2">${escapeXml(route.name)} — ` +
    `${route.total_distance_miles} mi, ` +
    `${route.waypoint_count} waypoints</Snippet>`
  );

  // ── Open flag (expand in sidebar) ─────────────────────
  lines.push('    <open>1</open>');

  // ── Shared Styles ─────────────────────────────────────
  // Generate styles for each waypoint type used + default
  const usedTypes = new Set<RouteWaypointType | 'default'>();
  usedTypes.add('default');
  if (includeWaypoints) {
    for (const wp of route.waypoints) {
      if (wp.waypointType) {
        usedTypes.add(wp.waypointType);
      } else {
        usedTypes.add('default');
      }
    }
  }

  for (const typeKey of usedTypes) {
    const type = typeKey === 'default' ? null : typeKey as RouteWaypointType;
    const styleId = getStyleId(type);
    const iconUrl = getIconUrlForType(type);
    const kmlColor = getKmlColorForType(type);

    lines.push(`    <Style id="${styleId}">`);
    lines.push('      <IconStyle>');
    lines.push(`        <color>${kmlColor}</color>`);
    lines.push('        <scale>1.1</scale>');
    lines.push('        <Icon>');
    lines.push(`          <href>${escapeXml(iconUrl)}</href>`);
    lines.push('        </Icon>');
    lines.push('        <hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/>');
    lines.push('      </IconStyle>');
    lines.push('      <LabelStyle>');
    lines.push(`        <color>${kmlColor}</color>`);
    lines.push('        <scale>0.8</scale>');
    lines.push('      </LabelStyle>');
    lines.push('      <BalloonStyle>');
    lines.push('        <text><![CDATA[<h3>$[name]</h3><p>$[description]</p>]]></text>');
    lines.push('      </BalloonStyle>');
    lines.push('    </Style>');
  }

  // Track line style
  if (includeTrack && route.segments.length > 0) {
    lines.push(`    <Style id="${TRACK_STYLE_ID}">`);
    lines.push('      <LineStyle>');
    lines.push(`        <color>${hexToKmlColor('#C48A2C')}</color>`);  // ECS amber
    lines.push('        <width>3</width>');
    lines.push('      </LineStyle>');
    lines.push('      <PolyStyle>');
    lines.push(`        <color>${hexToKmlColor('#C48A2C', '40')}</color>`);
    lines.push('      </PolyStyle>');
    lines.push('    </Style>');
  }

  // ── Waypoint Placemarks ───────────────────────────────
  if (includeWaypoints && route.waypoints.length > 0) {
    lines.push('    <Folder>');
    lines.push('      <name>Waypoints</name>');
    lines.push(`      <description>${route.waypoint_count} waypoints</description>`);
    lines.push('      <open>1</open>');

    for (let i = 0; i < route.waypoints.length; i++) {
      const wp = route.waypoints[i];
      const typeConfig = wp.waypointType ? getWaypointTypeConfig(wp.waypointType) : null;
      const styleId = getStyleId(wp.waypointType);

      // Waypoint name
      const wpName = wp.name
        ? wp.name
        : typeConfig
          ? `${typeConfig.label} ${i + 1}`
          : `Waypoint ${i + 1}`;

      lines.push('      <Placemark>');
      lines.push(`        <name>${escapeXml(wpName)}</name>`);

      // Description
      const wpDescParts: string[] = [];
      if (typeConfig) {
        wpDescParts.push(`Type: ${typeConfig.label}`);
        wpDescParts.push(typeConfig.description);
      }
      wpDescParts.push(`Lat: ${wp.lat.toFixed(6)}`);
      wpDescParts.push(`Lon: ${wp.lon.toFixed(6)}`);
      if (wp.ele != null) {
        wpDescParts.push(`Elevation: ${wp.ele.toFixed(1)} m (${Math.round(wp.ele * 3.281)} ft)`);
      }
      if (wp.time) {
        wpDescParts.push(`Time: ${wp.time}`);
      }
      lines.push(`        <description>${escapeXml(wpDescParts.join('\n'))}</description>`);

      // Style reference
      lines.push(`        <styleUrl>#${styleId}</styleUrl>`);

      // Timestamp
      if (wp.time) {
        lines.push('        <TimeStamp>');
        lines.push(`          <when>${escapeXml(wp.time)}</when>`);
        lines.push('        </TimeStamp>');
      }

      // ExtendedData — waypoint type and index
      lines.push('        <ExtendedData>');
      lines.push(`          <Data name="ecs:waypointIndex"><value>${i}</value></Data>`);
      if (wp.waypointType) {
        lines.push(`          <Data name="ecs:waypointType"><value>${wp.waypointType}</value></Data>`);
      }
      if (typeConfig) {
        lines.push(`          <Data name="ecs:waypointTypeLabel"><value>${escapeXml(typeConfig.label)}</value></Data>`);
        lines.push(`          <Data name="ecs:waypointTypeColor"><value>${typeConfig.color}</value></Data>`);
        lines.push(`          <Data name="ecs:waypointTypeIcon"><value>${typeConfig.icon}</value></Data>`);
      }
      lines.push('        </ExtendedData>');

      // Point geometry
      const elev = wp.ele != null ? wp.ele.toFixed(1) : '0';
      lines.push('        <Point>');
      lines.push(`          <altitudeMode>${altitudeMode}</altitudeMode>`);
      lines.push(`          <coordinates>${wp.lon.toFixed(8)},${wp.lat.toFixed(8)},${elev}</coordinates>`);
      lines.push('        </Point>');

      lines.push('      </Placemark>');
    }

    lines.push('    </Folder>');
  }

  // ── Track Segment Placemarks ──────────────────────────
  if (includeTrack && route.segments.length > 0) {
    lines.push('    <Folder>');
    lines.push('      <name>Track</name>');
    lines.push(`      <description>${route.segment_count} segment${route.segment_count !== 1 ? 's' : ''}, ${route.total_distance_miles} mi</description>`);
    lines.push('      <open>1</open>');

    for (let s = 0; s < route.segments.length; s++) {
      const seg = route.segments[s];
      if (seg.points.length < 2) continue;

      const segName = route.segments.length === 1
        ? route.name
        : `${route.name} — Segment ${s + 1}`;

      lines.push('      <Placemark>');
      lines.push(`        <name>${escapeXml(segName)}</name>`);
      lines.push(`        <description>Segment ${s + 1}: ${seg.points.length} points</description>`);
      lines.push(`        <styleUrl>#${TRACK_STYLE_ID}</styleUrl>`);

      // ExtendedData for segment
      lines.push('        <ExtendedData>');
      lines.push(`          <Data name="ecs:segmentIndex"><value>${s}</value></Data>`);
      lines.push(`          <Data name="ecs:pointCount"><value>${seg.points.length}</value></Data>`);
      lines.push(`          <Data name="ecs:featureSource"><value>trackSegment</value></Data>`);
      lines.push('        </ExtendedData>');

      // LineString geometry
      lines.push('        <LineString>');
      lines.push('          <tessellate>1</tessellate>');
      lines.push(`          <altitudeMode>${altitudeMode}</altitudeMode>`);

      // Build coordinate string: lon,lat,ele separated by spaces
      const coordLines: string[] = [];
      for (const pt of seg.points) {
        const elev = pt.ele != null ? pt.ele.toFixed(1) : '0';
        coordLines.push(`${pt.lon.toFixed(8)},${pt.lat.toFixed(8)},${elev}`);
      }

      // KML coordinates element — one coordinate tuple per line for readability
      lines.push('          <coordinates>');
      // Group coordinates in chunks for manageable line lengths
      const CHUNK_SIZE = 8;
      for (let c = 0; c < coordLines.length; c += CHUNK_SIZE) {
        const chunk = coordLines.slice(c, c + CHUNK_SIZE);
        lines.push(`            ${chunk.join(' ')}`);
      }
      lines.push('          </coordinates>');

      lines.push('        </LineString>');
      lines.push('      </Placemark>');
    }

    lines.push('    </Folder>');
  }

  // ── LookAt — center the view on the route ─────────────
  const center = computeCenter(route);
  if (center) {
    lines.push('    <LookAt>');
    lines.push(`      <longitude>${center.lon.toFixed(8)}</longitude>`);
    lines.push(`      <latitude>${center.lat.toFixed(8)}</latitude>`);
    lines.push('      <altitude>0</altitude>');
    lines.push(`      <range>${computeViewRange(route)}</range>`);
    lines.push('      <tilt>45</tilt>');
    lines.push('      <heading>0</heading>');
    lines.push('      <altitudeMode>clampToGround</altitudeMode>');
    lines.push('    </LookAt>');
  }

  // ── Close Document & KML ──────────────────────────────
  lines.push('  </Document>');
  lines.push('</kml>');

  return lines.join('\n');
}

// ── Geometry Helpers ────────────────────────────────────

/**
 * Compute the geographic center of a route for the LookAt element.
 */
function computeCenter(route: ImportedRoute): { lat: number; lon: number } | null {
  let sumLat = 0;
  let sumLon = 0;
  let count = 0;

  for (const wp of route.waypoints) {
    sumLat += wp.lat;
    sumLon += wp.lon;
    count++;
  }

  for (const seg of route.segments) {
    for (const pt of seg.points) {
      sumLat += pt.lat;
      sumLon += pt.lon;
      count++;
    }
  }

  if (count === 0) return null;

  return {
    lat: sumLat / count,
    lon: sumLon / count,
  };
}

/**
 * Compute an appropriate LookAt range (camera distance in meters)
 * based on the geographic extent of the route.
 */
function computeViewRange(route: ImportedRoute): number {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let hasPoints = false;

  for (const wp of route.waypoints) {
    minLat = Math.min(minLat, wp.lat);
    maxLat = Math.max(maxLat, wp.lat);
    minLon = Math.min(minLon, wp.lon);
    maxLon = Math.max(maxLon, wp.lon);
    hasPoints = true;
  }

  for (const seg of route.segments) {
    for (const pt of seg.points) {
      minLat = Math.min(minLat, pt.lat);
      maxLat = Math.max(maxLat, pt.lat);
      minLon = Math.min(minLon, pt.lon);
      maxLon = Math.max(maxLon, pt.lon);
      hasPoints = true;
    }
  }

  if (!hasPoints) return 10000; // default 10km

  // Approximate extent in degrees → meters
  const latExtent = (maxLat - minLat) * 111320; // ~111.32 km per degree lat
  const lonExtent = (maxLon - minLon) * 111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const maxExtent = Math.max(latExtent, lonExtent);

  // Add 20% padding and clamp to reasonable range
  const range = Math.max(500, Math.min(maxExtent * 1.2, 5000000));
  return Math.round(range);
}

// ── Filename & Summary ──────────────────────────────────

/**
 * Generate a safe filename for the KML export.
 */
export function generateKMLFilename(route: ImportedRoute): string {
  const safeName = route.name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  const dateStr = new Date().toISOString().split('T')[0];
  return `${safeName}_${dateStr}.kml`;
}

/**
 * Get a human-readable summary of what will be exported in KML format.
 * Uses the same shape as GPX/GeoJSON export summaries for UI consistency.
 */
export function getKMLExportSummary(route: ImportedRoute): {
  waypointCount: number;
  typedWaypointCount: number;
  segmentCount: number;
  totalTrackPoints: number;
  totalDistanceMiles: number;
  hasElevation: boolean;
  waypointTypeCounts: Record<string, number>;
} {
  let totalTrackPoints = 0;
  let hasElevation = false;

  for (const seg of route.segments) {
    totalTrackPoints += seg.points.length;
    if (!hasElevation) {
      hasElevation = seg.points.some(p => p.ele != null);
    }
  }

  const waypointTypeCounts: Record<string, number> = {};
  let typedWaypointCount = 0;

  for (const wp of route.waypoints) {
    if (wp.waypointType) {
      typedWaypointCount++;
      const config = getWaypointTypeConfig(wp.waypointType);
      const label = config?.label || wp.waypointType;
      waypointTypeCounts[label] = (waypointTypeCounts[label] || 0) + 1;
    }
  }

  if (!hasElevation) {
    hasElevation = route.waypoints.some(wp => wp.ele != null);
  }

  return {
    waypointCount: route.waypoints.length,
    typedWaypointCount,
    segmentCount: route.segments.length,
    totalTrackPoints,
    totalDistanceMiles: route.total_distance_miles,
    hasElevation,
    waypointTypeCounts,
  };
}


// ═══════════════════════════════════════════════════════════════
// KMZ (Zipped KML) Export
// ═══════════════════════════════════════════════════════════════
//
// KMZ is a ZIP archive containing a "doc.kml" entry.
// This implementation uses a minimal pure-JS ZIP builder with
// STORE method (no compression) and CRC-32 checksums.
//
// No external dependencies (JSZip, fflate, pako) are required.
// ═══════════════════════════════════════════════════════════════

// ── CRC-32 Implementation ───────────────────────────────────

/**
 * Pre-computed CRC-32 lookup table (IEEE 802.3 polynomial 0xEDB88320).
 * Generated once at module load time.
 */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/**
 * Compute CRC-32 checksum of a Uint8Array.
 * Uses the standard IEEE 802.3 polynomial.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── UTF-8 Encoding Helper ───────────────────────────────────

/**
 * Encode a string as UTF-8 bytes.
 * Uses TextEncoder when available (all modern environments),
 * with a manual fallback for edge cases.
 */
function encodeUTF8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  // Manual UTF-8 encoding fallback
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    } else if (code >= 0xD800 && code <= 0xDBFF) {
      // Surrogate pair
      const hi = code;
      const lo = str.charCodeAt(++i);
      code = ((hi - 0xD800) << 10) + (lo - 0xDC00) + 0x10000;
      bytes.push(
        0xF0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3F),
        0x80 | ((code >> 6) & 0x3F),
        0x80 | (code & 0x3F),
      );
    } else {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    }
  }
  return new Uint8Array(bytes);
}

// ── Minimal ZIP Builder ─────────────────────────────────────

/**
 * Write a 16-bit little-endian unsigned integer into a DataView.
 */
function writeU16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

/**
 * Write a 32-bit little-endian unsigned integer into a DataView.
 */
function writeU32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

/**
 * Build a minimal ZIP archive containing a single file entry.
 *
 * Uses STORE method (compression method 0 = no compression).
 * This is the simplest valid ZIP structure and is universally
 * compatible with all ZIP readers including Google Earth.
 *
 * ZIP structure for a single STORE entry:
 *   [Local File Header] [File Data] [Central Directory Header] [EOCD]
 *
 * @param filename - The entry filename (e.g., "doc.kml")
 * @param data - The file content as a Uint8Array
 * @returns Complete ZIP archive as a Uint8Array
 */
function buildZipArchive(filename: string, data: Uint8Array): Uint8Array {
  const filenameBytes = encodeUTF8(filename);
  const filenamelen = filenameBytes.length;
  const dataCrc = crc32(data);
  const dataSize = data.length;

  // DOS date/time for "now"
  const now = new Date();
  const dosTime =
    ((now.getSeconds() >> 1) & 0x1F) |
    ((now.getMinutes() & 0x3F) << 5) |
    ((now.getHours() & 0x1F) << 11);
  const dosDate =
    (now.getDate() & 0x1F) |
    (((now.getMonth() + 1) & 0x0F) << 5) |
    (((now.getFullYear() - 1980) & 0x7F) << 9);

  // ── Sizes ─────────────────────────────────────────────
  const LOCAL_HEADER_SIZE = 30 + filenamelen;
  const CENTRAL_HEADER_SIZE = 46 + filenamelen;
  const EOCD_SIZE = 22;
  const totalSize = LOCAL_HEADER_SIZE + dataSize + CENTRAL_HEADER_SIZE + EOCD_SIZE;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // ── Local File Header ─────────────────────────────────
  // Signature: PK\x03\x04
  writeU32LE(view, offset, 0x04034B50); offset += 4;
  // Version needed to extract (2.0)
  writeU16LE(view, offset, 20); offset += 2;
  // General purpose bit flag (bit 11 = UTF-8 filenames)
  writeU16LE(view, offset, 0x0800); offset += 2;
  // Compression method (0 = STORE)
  writeU16LE(view, offset, 0); offset += 2;
  // Last mod file time
  writeU16LE(view, offset, dosTime); offset += 2;
  // Last mod file date
  writeU16LE(view, offset, dosDate); offset += 2;
  // CRC-32
  writeU32LE(view, offset, dataCrc); offset += 4;
  // Compressed size (same as uncompressed for STORE)
  writeU32LE(view, offset, dataSize); offset += 4;
  // Uncompressed size
  writeU32LE(view, offset, dataSize); offset += 4;
  // Filename length
  writeU16LE(view, offset, filenamelen); offset += 2;
  // Extra field length
  writeU16LE(view, offset, 0); offset += 2;
  // Filename
  bytes.set(filenameBytes, offset); offset += filenamelen;

  // ── File Data ─────────────────────────────────────────
  const localHeaderEnd = offset;
  bytes.set(data, offset); offset += dataSize;

  // ── Central Directory Header ──────────────────────────
  const centralDirOffset = offset;
  // Signature: PK\x01\x02
  writeU32LE(view, offset, 0x02014B50); offset += 4;
  // Version made by (2.0, platform 0 = MS-DOS)
  writeU16LE(view, offset, 20); offset += 2;
  // Version needed to extract (2.0)
  writeU16LE(view, offset, 20); offset += 2;
  // General purpose bit flag (bit 11 = UTF-8)
  writeU16LE(view, offset, 0x0800); offset += 2;
  // Compression method (0 = STORE)
  writeU16LE(view, offset, 0); offset += 2;
  // Last mod file time
  writeU16LE(view, offset, dosTime); offset += 2;
  // Last mod file date
  writeU16LE(view, offset, dosDate); offset += 2;
  // CRC-32
  writeU32LE(view, offset, dataCrc); offset += 4;
  // Compressed size
  writeU32LE(view, offset, dataSize); offset += 4;
  // Uncompressed size
  writeU32LE(view, offset, dataSize); offset += 4;
  // Filename length
  writeU16LE(view, offset, filenamelen); offset += 2;
  // Extra field length
  writeU16LE(view, offset, 0); offset += 2;
  // File comment length
  writeU16LE(view, offset, 0); offset += 2;
  // Disk number start
  writeU16LE(view, offset, 0); offset += 2;
  // Internal file attributes
  writeU16LE(view, offset, 0); offset += 2;
  // External file attributes
  writeU32LE(view, offset, 0); offset += 4;
  // Relative offset of local header
  writeU32LE(view, offset, 0); offset += 4;
  // Filename
  bytes.set(filenameBytes, offset); offset += filenamelen;

  // ── End of Central Directory Record ───────────────────
  // Signature: PK\x05\x06
  writeU32LE(view, offset, 0x06054B50); offset += 4;
  // Number of this disk
  writeU16LE(view, offset, 0); offset += 2;
  // Disk where central directory starts
  writeU16LE(view, offset, 0); offset += 2;
  // Number of central directory records on this disk
  writeU16LE(view, offset, 1); offset += 2;
  // Total number of central directory records
  writeU16LE(view, offset, 1); offset += 2;
  // Size of central directory
  writeU32LE(view, offset, CENTRAL_HEADER_SIZE); offset += 4;
  // Offset of start of central directory
  writeU32LE(view, offset, centralDirOffset); offset += 4;
  // Comment length
  writeU16LE(view, offset, 0); offset += 2;

  return bytes;
}

// ── KMZ Generation ──────────────────────────────────────────

/**
 * Generate a KMZ archive (zipped KML) from an ImportedRoute.
 *
 * KMZ is a ZIP archive containing a single "doc.kml" entry,
 * which is the standard convention for KMZ files.
 *
 * @param route - The route to export
 * @param options - Optional export configuration (same as generateKML)
 * @returns KMZ archive as a Uint8Array (binary data)
 */
export function generateKMZ(
  route: ImportedRoute,
  options?: Parameters<typeof generateKML>[1],
): Uint8Array {
  // Generate the KML XML content
  const kmlXml = generateKML(route, options);

  // Encode KML string as UTF-8 bytes
  const kmlBytes = encodeUTF8(kmlXml);

  // Wrap in a ZIP archive with the entry name "doc.kml"
  // (this is the KMZ convention — Google Earth looks for doc.kml first)
  return buildZipArchive('doc.kml', kmlBytes);
}

/**
 * Generate a safe filename for the KMZ export.
 */
export function generateKMZFilename(route: ImportedRoute): string {
  const safeName = route.name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  const dateStr = new Date().toISOString().split('T')[0];
  return `${safeName}_${dateStr}.kmz`;
}

/**
 * Convert a Uint8Array to a base64 string.
 *
 * Used for writing binary KMZ data to the filesystem via
 * fsWriteString(uri, base64, 'base64') on native platforms.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Use btoa when available (web, modern RN with Hermes)
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Node.js / older environments fallback
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  // Manual base64 encoding as last resort
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

