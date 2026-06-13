import type {
  RouteConfidenceTimeline,
  RouteConfidenceTimelineConditionState,
  RouteConfidenceTimelineConfidenceLevel,
  RouteConfidenceTimelineDriver,
  RouteConfidenceTimelineDriverCategory,
  RouteConfidenceTimelineItem,
  RouteConfidenceTimelineOverlay,
  RouteConfidenceTimelineSource,
  RouteGeometry,
} from './routeContextTypes';
import { totalRouteDistanceMeters } from './routeContextGeometry';

export type BuildRouteConfidenceTimelineInput = {
  routeId: string;
  geometryVersion?: string | null;
  routeGeometry: RouteGeometry | null;
  overlays?: RouteConfidenceTimelineOverlay[] | null;
  generatedAt?: string | null;
};

type Partition = {
  startMeasure: number;
  endMeasure: number;
  overlays: RouteConfidenceTimelineOverlay[];
};

const CATEGORY_PRIORITY: Record<RouteConfidenceTimelineDriverCategory, number> = {
  closure_current_condition: 90,
  recovery_exposure: 80,
  terrain_weather: 70,
  camp_deadline: 65,
  legal_access: 60,
  offline_coverage: 58,
  bailout_density: 50,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function validIso(value: string | null | undefined): boolean {
  if (!value) return false;
  return Number.isFinite(Date.parse(value));
}

function measuredRouteDistance(routeGeometry: RouteGeometry | null): number {
  const explicit = Number(routeGeometry?.distanceMeters);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const computed = totalRouteDistanceMeters(routeGeometry?.coordinates ?? []);
  return Math.max(0, Math.round(computed));
}

function geometryVersionFrom(routeGeometry: RouteGeometry | null, fallback?: string | null): string {
  if (fallback) return fallback;
  const metadata = routeGeometry?.providerMetadata ?? {};
  const explicit = metadata.geometryVersion ?? metadata.routeGeometryVersion ?? metadata.version;
  if (typeof explicit === 'string' && explicit.trim()) return explicit;
  const pointCount = routeGeometry?.coordinates?.length ?? routeGeometry?.segments?.length ?? 0;
  return `geometry:${pointCount}:${measuredRouteDistance(routeGeometry)}`;
}

function normalizeSource(source: RouteConfidenceTimelineSource | null | undefined, overlayId: string): RouteConfidenceTimelineSource {
  return {
    id: source?.id || `source:${overlayId}`,
    label: source?.label || 'Unknown source',
    sourceType: source?.sourceType ?? null,
    observedAt: source?.observedAt ?? null,
    freshness: source?.freshness ?? 'unknown',
    detail: source?.detail ?? null,
  };
}

function normalizeOverlay(
  overlay: RouteConfidenceTimelineOverlay,
  totalMeasure: number,
): RouteConfidenceTimelineOverlay | null {
  const start = clamp(Math.min(overlay.startMeasure, overlay.endMeasure), 0, totalMeasure);
  const end = clamp(Math.max(overlay.startMeasure, overlay.endMeasure), 0, totalMeasure);
  if (end <= start) return null;
  return {
    ...overlay,
    startMeasure: start,
    endMeasure: end,
    source: normalizeSource(overlay.source, overlay.id),
  };
}

function confidenceImpact(level: RouteConfidenceTimelineConfidenceLevel): number {
  if (level === 'unknown') return 35;
  if (level === 'low') return 30;
  if (level === 'medium') return 15;
  return 0;
}

function conditionImpact(state: RouteConfidenceTimelineConditionState): number {
  if (state === 'known_risky') return 120;
  if (state === 'unknown') return 40;
  return 0;
}

function sourceImpact(source: RouteConfidenceTimelineSource): number {
  if (source.freshness === 'missing') return 12;
  if (source.freshness === 'stale') return 8;
  if (source.freshness === 'unknown') return 4;
  return 0;
}

function overlayImpact(overlay: RouteConfidenceTimelineOverlay): number {
  return (
    conditionImpact(overlay.conditionState) +
    confidenceImpact(overlay.confidenceLevel) +
    sourceImpact(overlay.source) +
    CATEGORY_PRIORITY[overlay.driverCategory]
  );
}

function sourceWarning(source: RouteConfidenceTimelineSource): string | null {
  if (source.freshness === 'missing' || !validIso(source.observedAt)) {
    return `${source.label} has missing source metadata for route confidence timeline.`;
  }
  if (source.freshness === 'stale') {
    return `${source.label} is stale source metadata for route confidence timeline.`;
  }
  return null;
}

function buildDriver(overlay: RouteConfidenceTimelineOverlay): RouteConfidenceTimelineDriver {
  return {
    id: overlay.id,
    category: overlay.driverCategory,
    label: overlay.label,
    confidenceLevel: overlay.confidenceLevel,
    conditionState: overlay.conditionState,
    source: overlay.source,
    detail: overlay.detail ?? null,
  };
}

function uniqueDrivers(drivers: RouteConfidenceTimelineDriver[]): RouteConfidenceTimelineDriver[] {
  const seen = new Set<string>();
  const output: RouteConfidenceTimelineDriver[] = [];
  drivers.forEach((driver) => {
    const key = `${driver.id}:${driver.category}:${driver.source.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(driver);
  });
  return output;
}

function uniqueSources(sources: RouteConfidenceTimelineSource[]): RouteConfidenceTimelineSource[] {
  const seen = new Set<string>();
  const output: RouteConfidenceTimelineSource[] = [];
  sources.forEach((source) => {
    const key = `${source.id}:${source.observedAt ?? 'missing'}:${source.freshness}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(source);
  });
  return output;
}

function partitionOverlays(overlays: RouteConfidenceTimelineOverlay[], totalMeasure: number): Partition[] {
  const boundaries = new Set<number>([0, totalMeasure]);
  overlays.forEach((overlay) => {
    boundaries.add(overlay.startMeasure);
    boundaries.add(overlay.endMeasure);
  });
  const sorted = Array.from(boundaries).sort((left, right) => left - right);
  const partitions: Partition[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const startMeasure = sorted[index - 1];
    const endMeasure = sorted[index];
    if (endMeasure <= startMeasure) continue;
    const active = overlays.filter((overlay) => (
      overlay.startMeasure < endMeasure && overlay.endMeasure > startMeasure
    ));
    if (active.length === 0) continue;
    partitions.push({ startMeasure, endMeasure, overlays: active });
  }
  return partitions;
}

function primaryOverlay(overlays: RouteConfidenceTimelineOverlay[]): RouteConfidenceTimelineOverlay {
  return overlays
    .slice()
    .sort((left, right) => overlayImpact(right) - overlayImpact(left) || left.id.localeCompare(right.id))[0];
}

function itemFromPartition(
  routeId: string,
  geometryVersion: string,
  partition: Partition,
  index: number,
): RouteConfidenceTimelineItem {
  const primary = primaryOverlay(partition.overlays);
  const drivers = uniqueDrivers(partition.overlays.map(buildDriver));
  return {
    id: `route-confidence:${routeId}:${geometryVersion}:${index}:${Math.round(partition.startMeasure)}-${Math.round(partition.endMeasure)}`,
    routeId,
    geometryVersion,
    startMeasure: partition.startMeasure,
    endMeasure: partition.endMeasure,
    label: primary.label,
    confidenceLevel: primary.confidenceLevel,
    conditionState: primary.conditionState,
    primaryDriver: buildDriver(primary),
    drivers,
    sourceFreshness: uniqueSources(partition.overlays.map((overlay) => overlay.source)),
  };
}

function compatibleForMerge(left: RouteConfidenceTimelineItem, right: RouteConfidenceTimelineItem): boolean {
  return (
    left.routeId === right.routeId &&
    left.geometryVersion === right.geometryVersion &&
    left.label === right.label &&
    left.confidenceLevel === right.confidenceLevel &&
    left.conditionState === right.conditionState &&
    left.primaryDriver.category === right.primaryDriver.category &&
    left.endMeasure === right.startMeasure
  );
}

function mergeAdjacent(items: RouteConfidenceTimelineItem[]): RouteConfidenceTimelineItem[] {
  const merged: RouteConfidenceTimelineItem[] = [];
  items.forEach((item) => {
    const previous = merged[merged.length - 1];
    if (!previous || !compatibleForMerge(previous, item)) {
      merged.push(item);
      return;
    }
    merged[merged.length - 1] = {
      ...previous,
      endMeasure: item.endMeasure,
      id: `${previous.id}+${Math.round(item.endMeasure)}`,
      drivers: uniqueDrivers([...previous.drivers, ...item.drivers]),
      sourceFreshness: uniqueSources([...previous.sourceFreshness, ...item.sourceFreshness]),
    };
  });
  return merged;
}

export function buildRouteConfidenceTimeline(input: BuildRouteConfidenceTimelineInput): RouteConfidenceTimeline {
  const totalMeasure = measuredRouteDistance(input.routeGeometry);
  const geometryVersion = geometryVersionFrom(input.routeGeometry, input.geometryVersion);
  const overlays = (input.overlays ?? [])
    .map((overlay) => normalizeOverlay(overlay, totalMeasure))
    .filter((overlay): overlay is RouteConfidenceTimelineOverlay => Boolean(overlay));
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const warnings = Array.from(new Set(
    overlays
      .map((overlay) => sourceWarning(overlay.source))
      .filter((warning): warning is string => Boolean(warning)),
  ));
  const items = mergeAdjacent(
    partitionOverlays(overlays, totalMeasure).map((partition, index) =>
      itemFromPartition(input.routeId, geometryVersion, partition, index),
    ),
  );
  return {
    routeId: input.routeId,
    geometryVersion,
    totalMeasure,
    generatedAt,
    items,
    warnings,
    readiness: 'feature_flagged',
  };
}

export function routeConfidenceTimelineItemCopy(item: RouteConfidenceTimelineItem | null | undefined): string {
  if (!item) return 'No route confidence timeline item is selected.';
  if (item.conditionState === 'known_risky') {
    return `${item.label}: known risk from ${item.primaryDriver.source.label}. Review the source before relying on this span.`;
  }
  if (item.conditionState === 'unknown' || item.confidenceLevel === 'low' || item.confidenceLevel === 'unknown') {
    return `${item.label}: uncertainty in ${item.primaryDriver.category.replace(/_/g, ' ')}. This is not a confirmed hazard; verify current conditions before committing.`;
  }
  return `${item.label}: confidence is ${item.confidenceLevel} and no known risk is attached to this span.`;
}

function envFlagEnabled(key: string): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value === '1' || value === 'true' || value === 'TRUE';
}

export function isRouteConfidenceTimelineFeatureEnabled(): boolean {
  const globalFlag = (globalThis as { __ECS_ROUTE_CONFIDENCE_TIMELINE__?: unknown }).__ECS_ROUTE_CONFIDENCE_TIMELINE__;
  if (globalFlag != null) return globalFlag === true || globalFlag === '1' || globalFlag === 'true';
  return (
    envFlagEnabled('EXPO_PUBLIC_ECS_ROUTE_CONFIDENCE_TIMELINE') ||
    envFlagEnabled('ECS_ROUTE_CONFIDENCE_TIMELINE')
  );
}
