/**
 * mapPerformance.ts — Map Performance Optimization Utilities
 *
 * Provides:
 *   1. Point clustering logic for dense pin areas (Supercluster-compatible GeoJSON)
 *   2. Level-of-detail (LOD) simplification for trail segments at varying zoom levels
 *   3. Viewport culling helpers for lazy-loading markers outside the visible area
 *   4. Debounce utilities for map bounds updates
 *
 * These utilities are used by MapRenderer to optimize rendering performance
 * when dealing with large numbers of pins, trail points, and bailout markers.
 */

// ── Types ───────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface ClusterConfig {
  /** Cluster radius in pixels (default: 50) */
  radius?: number;
  /** Max zoom at which clusters are generated (default: 14) */
  maxZoom?: number;
  /** Min points to form a cluster (default: 2) */
  minPoints?: number;
}

// ── 1. Pin Clustering ───────────────────────────────────────

/**
 * Convert pin markers to a GeoJSON FeatureCollection suitable for
 * Mapbox GL JS's built-in clustering via source `cluster: true`.
 *
 * Each pin becomes a GeoJSON Point Feature with properties preserved
 * for popup rendering and click handling.
 */
export function pinsToClusterableGeoJSON(pins: Array<{
  id: string;
  lat: number;
  lng: number;
  title: string;
  type: string;
  category: string;
  color: string;
  mapChar: string;
  resolved: boolean;
}>): any {
  return {
    type: 'FeatureCollection',
    features: pins.map(pin => ({
      type: 'Feature',
      properties: {
        id: pin.id,
        title: pin.title,
        type: pin.type,
        category: pin.category,
        color: pin.color,
        mapChar: pin.mapChar,
        resolved: pin.resolved,
      },
      geometry: {
        type: 'Point',
        coordinates: [pin.lng, pin.lat],
      },
    })),
  };
}

/**
 * Convert bailout markers to GeoJSON FeatureCollection for
 * Mapbox-native viewport culling (no DOM markers needed).
 */
export function bailoutsToGeoJSON(bailouts: Array<{
  id: string;
  lat: number;
  lng: number;
  title: string;
  type: string;
  color: string;
}>): any {
  return {
    type: 'FeatureCollection',
    features: bailouts.map(bp => ({
      type: 'Feature',
      properties: {
        id: bp.id,
        title: bp.title,
        type: bp.type,
        color: bp.color,
        typeChar: bp.type.charAt(0).toUpperCase(),
      },
      geometry: {
        type: 'Point',
        coordinates: [bp.lng, bp.lat],
      },
    })),
  };
}

// ── 2. Level-of-Detail (LOD) Trail Simplification ───────────

/**
 * Perpendicular distance from point P to line segment AB.
 * Used by Douglas-Peucker simplification.
 */
function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = p[0] - a[0];
    const ddy = p[1] - a[1];
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  const ddx = p[0] - projX;
  const ddy = p[1] - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

/**
 * Douglas-Peucker line simplification algorithm.
 * Reduces the number of points in a polyline while preserving shape.
 *
 * @param coords Array of [lng, lat] coordinate pairs
 * @param epsilon Tolerance threshold (in degrees — ~0.00001 ≈ 1m)
 * @returns Simplified coordinate array
 */
export function douglasPeucker(
  coords: [number, number][],
  epsilon: number
): [number, number][] {
  if (coords.length <= 2) return coords;

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < coords.length - 1; i++) {
    const dist = perpendicularDistance(coords[i], coords[0], coords[coords.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(coords.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(coords.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [coords[0], coords[coords.length - 1]];
}

/**
 * Get the LOD epsilon (simplification tolerance) based on current zoom level.
 *
 * At high zoom (close up), use very small epsilon to preserve detail.
 * At low zoom (zoomed out), use larger epsilon to reduce point count.
 *
 * Epsilon is in degrees:
 *   - 0.00001° ≈ 1.1m at equator
 *   - 0.0001°  ≈ 11m
 *   - 0.001°   ≈ 111m
 *   - 0.01°    ≈ 1.1km
 */
export function getLODEpsilon(zoom: number): number {
  if (zoom >= 16) return 0;           // Full detail — no simplification
  if (zoom >= 14) return 0.000005;    // ~0.5m tolerance
  if (zoom >= 12) return 0.00002;     // ~2m tolerance
  if (zoom >= 10) return 0.0001;      // ~11m tolerance
  if (zoom >= 8)  return 0.0005;      // ~55m tolerance
  if (zoom >= 6)  return 0.002;       // ~220m tolerance
  if (zoom >= 4)  return 0.01;        // ~1.1km tolerance
  return 0.05;                         // ~5.5km tolerance
}

/**
 * Apply LOD simplification to trail segment coordinates based on zoom level.
 *
 * @param segments Array of trail segments with coordinates
 * @param zoom Current map zoom level
 * @returns Simplified segments (new array, originals unchanged)
 */
export function simplifyTrailSegmentsForZoom(
  segments: Array<{ segment_id: string; coordinates: [number, number][] }>,
  zoom: number
): Array<{ segment_id: string; coordinates: [number, number][] }> {
  const epsilon = getLODEpsilon(zoom);
  if (epsilon === 0) return segments; // Full detail at high zoom

  return segments.map(seg => {
    if (seg.coordinates.length <= 3) return seg; // Too few points to simplify
    return {
      segment_id: seg.segment_id,
      coordinates: douglasPeucker(seg.coordinates, epsilon),
    };
  });
}

/**
 * Apply LOD simplification to speed segments based on zoom level.
 */
export function simplifySpeedSegmentsForZoom(
  segments: Array<{ coordinates: [number, number][]; speed_mph: number; color: string }>,
  zoom: number
): Array<{ coordinates: [number, number][]; speed_mph: number; color: string }> {
  const epsilon = getLODEpsilon(zoom);
  if (epsilon === 0) return segments;

  return segments.map(seg => {
    if (seg.coordinates.length <= 3) return seg;
    return {
      ...seg,
      coordinates: douglasPeucker(seg.coordinates, epsilon),
    };
  });
}

// ── 3. Viewport Culling ─────────────────────────────────────

/**
 * Expand viewport bounds by a buffer factor to pre-load markers
 * slightly outside the visible area (prevents pop-in during panning).
 *
 * @param bounds Current viewport bounds
 * @param bufferFactor Multiplier for the buffer (0.3 = 30% extra on each side)
 * @returns Expanded bounds
 */
export function expandBounds(
  bounds: ViewportBounds,
  bufferFactor: number = 0.3
): ViewportBounds {
  const latRange = bounds.maxLat - bounds.minLat;
  const lngRange = bounds.maxLng - bounds.minLng;
  const latBuffer = latRange * bufferFactor;
  const lngBuffer = lngRange * bufferFactor;

  return {
    minLat: bounds.minLat - latBuffer,
    maxLat: bounds.maxLat + latBuffer,
    minLng: bounds.minLng - lngBuffer,
    maxLng: bounds.maxLng + lngBuffer,
  };
}

/**
 * Filter an array of geo-located items to only those within the given bounds.
 * Used for lazy-loading bailout markers outside the viewport.
 *
 * @param items Array of items with lat/lng properties
 * @param bounds Viewport bounds (optionally expanded with expandBounds)
 * @returns Filtered array of items within bounds
 */
export function filterByViewport<T extends GeoPoint>(
  items: T[],
  bounds: ViewportBounds
): T[] {
  return items.filter(item =>
    item.lat >= bounds.minLat &&
    item.lat <= bounds.maxLat &&
    item.lng >= bounds.minLng &&
    item.lng <= bounds.maxLng
  );
}

/**
 * Check if a point is within the given bounds.
 */
export function isInViewport(point: GeoPoint, bounds: ViewportBounds): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}

// ── 4. Debounce Utility ─────────────────────────────────────

/**
 * Creates a debounced version of a function that delays invocation
 * until after `delay` milliseconds have elapsed since the last call.
 *
 * Used for debouncing map bounds updates on moveend events.
 */
export function createDebouncedFn<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

// ── Mapbox GL JS Clustering Configuration ───────────────────

/**
 * Generate the Mapbox GL JS source configuration for clustered pins.
 * This is injected into the WebView HTML.
 */
export function getClusterSourceConfig(config?: ClusterConfig): {
  cluster: boolean;
  clusterMaxZoom: number;
  clusterRadius: number;
  clusterMinPoints: number;
} {
  return {
    cluster: true,
    clusterMaxZoom: config?.maxZoom ?? 14,
    clusterRadius: config?.radius ?? 50,
    clusterMinPoints: config?.minPoints ?? 2,
  };
}

/**
 * Generate Mapbox GL JS layer definitions for cluster circles and counts.
 * Returns an array of layer configs to be added via map.addLayer().
 */
export function getClusterLayerConfigs(): {
  clusterCircleLayer: any;
  clusterCountLayer: any;
  unclusteredPointLayer: any;
} {
  return {
    clusterCircleLayer: {
      id: 'pin-clusters',
      type: 'circle',
      source: 'pins-clustered',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#C48A2C',   // < 5 pins: amber
          5, '#FFB300', // 5-15 pins: gold
          15, '#EF5350', // 15+ pins: red
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          16,    // < 5: 16px
          5, 22, // 5-15: 22px
          15, 28, // 15+: 28px
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-opacity': 0.85,
      },
    },
    clusterCountLayer: {
      id: 'pin-cluster-count',
      type: 'symbol',
      source: 'pins-clustered',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#ffffff',
      },
    },
    unclusteredPointLayer: {
      id: 'pin-unclustered',
      type: 'circle',
      source: 'pins-clustered',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    },
  };
}

// ── Performance Metrics ─────────────────────────────────────

export interface MapPerfMetrics {
  totalPins: number;
  visiblePins: number;
  clusteredPins: number;
  trailPointsOriginal: number;
  trailPointsSimplified: number;
  lodReductionPercent: number;
  bailoutsTotal: number;
  bailoutsVisible: number;
  currentZoom: number;
  lastUpdateMs: number;
}

/**
 * Create a performance metrics tracker for map rendering.
 * Useful for debugging and monitoring optimization effectiveness.
 */
export function createPerfTracker(): {
  update: (metrics: Partial<MapPerfMetrics>) => void;
  get: () => MapPerfMetrics;
  reset: () => void;
} {
  let current: MapPerfMetrics = {
    totalPins: 0,
    visiblePins: 0,
    clusteredPins: 0,
    trailPointsOriginal: 0,
    trailPointsSimplified: 0,
    lodReductionPercent: 0,
    bailoutsTotal: 0,
    bailoutsVisible: 0,
    currentZoom: 10,
    lastUpdateMs: 0,
  };

  return {
    update: (metrics) => {
      current = { ...current, ...metrics, lastUpdateMs: Date.now() };
    },
    get: () => ({ ...current }),
    reset: () => {
      current = {
        totalPins: 0, visiblePins: 0, clusteredPins: 0,
        trailPointsOriginal: 0, trailPointsSimplified: 0, lodReductionPercent: 0,
        bailoutsTotal: 0, bailoutsVisible: 0, currentZoom: 10, lastUpdateMs: 0,
      };
    },
  };
}

