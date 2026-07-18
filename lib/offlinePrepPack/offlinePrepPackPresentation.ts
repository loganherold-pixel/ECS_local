import type {
  OfflinePrepPackItem,
  OfflinePrepPackItemType,
  OfflinePrepPackManifest,
} from './offlinePrepPackTypes';
import type {
  OfflinePrepMapQueueState,
  OfflinePrepMapQueueStatus,
} from './offlinePrepPackQueue';
import {
  auditOfflineReadinessManifest,
  type OfflineReadinessAuditIssue,
} from './offlineReadinessManifest';

export type OfflinePrepPresentationKind =
  | 'needs_download'
  | 'preparing'
  | 'ready'
  | 'degraded'
  | 'blocked'
  | 'error';

export type OfflinePrepPresentationGroupId =
  | 'map'
  | 'route_geometry'
  | 'guidance_itinerary'
  | 'optional_field_context';

export type OfflinePrepTurnGuidanceState =
  | 'ready'
  | 'preparing'
  | 'unavailable'
  | 'failed'
  | 'not_required';

export type OfflinePrepPresentationAttentionSeverity = 'error' | 'blocker' | 'warning';

export type OfflinePrepPresentationAttentionItem = {
  id: string;
  severity: OfflinePrepPresentationAttentionSeverity;
  title: string;
  message: string;
  recommendedAction: string | null;
  itemType: OfflinePrepPackItemType | null;
  source: 'manifest_item' | 'readiness_audit' | 'presentation';
};

export type OfflinePrepPresentationGroup = {
  id: OfflinePrepPresentationGroupId;
  label: string;
  summary: string;
  status: OfflinePrepPresentationKind;
  items: OfflinePrepPackItem[];
  readyCount: number;
  requiredCount: number;
  requiredReadyCount: number;
  gapCount: number;
  estimatedSizeMB: number | null;
};

export type OfflinePrepPackPresentation = {
  kind: OfflinePrepPresentationKind;
  headline: string;
  summary: string;
  routeName: string;
  navigationReady: boolean;
  mapReady: boolean;
  mapStatus: OfflinePrepMapQueueStatus | 'missing';
  routeGeometryReady: boolean;
  turnGuidanceState: OfflinePrepTurnGuidanceState;
  requiredReadyCount: number;
  requiredCount: number;
  optionalGapCount: number;
  estimatedSizeMB: number | null;
  groups: OfflinePrepPresentationGroup[];
  attentionItems: OfflinePrepPresentationAttentionItem[];
  primaryActionKind: OfflinePrepPresentationKind;
  primaryActionLabel: string;
  primaryActionEnabled: boolean;
};

export type BuildOfflinePrepPackPresentationInput = {
  manifest: OfflinePrepPackManifest;
  mapQueueState: OfflinePrepMapQueueState | null;
  now?: string | number | Date;
};

const GROUP_LABELS: Record<OfflinePrepPresentationGroupId, string> = {
  map: 'Offline Map',
  route_geometry: 'Route Geometry',
  guidance_itinerary: 'Guidance and Itinerary',
  optional_field_context: 'Optional Field Context',
};

const MAP_ITEM_TYPES = new Set<OfflinePrepPackItemType>([
  'offline_map',
  'critical_offline_segments',
]);

const ROUTE_GEOMETRY_ITEM_TYPES = new Set<OfflinePrepPackItemType>([
  'route_line',
  'approach_route',
  'trailhead',
  'trail_route',
  'trail_end',
  'exit_route',
]);

const OPTIONAL_FIELD_CONTEXT_ITEM_TYPES = new Set<OfflinePrepPackItemType>([
  'campsites',
  'emergency_points',
  'vehicle_readiness_summary',
  'weather_snapshot',
  'remoteness_snapshot',
  'sunlight_window',
  'elevation_snapshot',
  'emergency_notes',
  'missing_data_warnings',
]);

const DRAWABLE_ROUTE_ITEM_TYPES = new Set<OfflinePrepPackItemType>([
  'route_line',
  'trail_route',
]);

function groupIdForItem(type: OfflinePrepPackItemType): OfflinePrepPresentationGroupId {
  if (MAP_ITEM_TYPES.has(type)) return 'map';
  if (ROUTE_GEOMETRY_ITEM_TYPES.has(type)) return 'route_geometry';
  if (OPTIONAL_FIELD_CONTEXT_ITEM_TYPES.has(type)) return 'optional_field_context';
  return 'guidance_itinerary';
}

function itemIsReady(item: OfflinePrepPackItem): boolean {
  return item.status === 'ready' || item.availability === 'already_cached';
}

function itemIsPreparing(item: OfflinePrepPackItem): boolean {
  return item.status === 'preparing' || item.status === 'downloading';
}

function itemIsFailed(item: OfflinePrepPackItem): boolean {
  return item.status === 'failed' || item.availability === 'failed';
}

function itemIsUnavailable(item: OfflinePrepPackItem): boolean {
  return item.status === 'unavailable' || item.availability === 'unavailable';
}

function sumEstimatedSize(items: OfflinePrepPackItem[]): number | null {
  const total = items.reduce((sum, item) => (
    typeof item.estimatedSizeMB === 'number' && Number.isFinite(item.estimatedSizeMB)
      ? sum + Math.max(0, item.estimatedSizeMB)
      : sum
  ), 0);
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

function effectiveMapStatus(
  mapItem: OfflinePrepPackItem | null,
  mapQueueState: OfflinePrepMapQueueState | null,
): OfflinePrepMapQueueStatus | 'missing' {
  if (mapQueueState) return mapQueueState.status;
  if (!mapItem) return 'missing';
  if (itemIsReady(mapItem)) return 'complete';
  if (itemIsFailed(mapItem)) return 'failed';
  if (itemIsUnavailable(mapItem)) return 'unavailable';
  if (mapItem.status === 'downloading') return 'downloading';
  if (mapItem.status === 'preparing') return 'queued';
  return 'not_requested';
}

function requiredItemIsReady(
  item: OfflinePrepPackItem,
  mapStatus: OfflinePrepMapQueueStatus | 'missing',
  mapNavigationReady = mapStatus === 'complete',
): boolean {
  if (item.type === 'offline_map') return mapNavigationReady;
  return itemIsReady(item);
}

function requiredItemIsPreparing(
  item: OfflinePrepPackItem,
  mapStatus: OfflinePrepMapQueueStatus | 'missing',
): boolean {
  if (item.type === 'offline_map') return mapStatus === 'queued' || mapStatus === 'downloading';
  return itemIsPreparing(item);
}

function requiredItemIsFailed(
  item: OfflinePrepPackItem,
  mapStatus: OfflinePrepMapQueueStatus | 'missing',
): boolean {
  if (item.type === 'offline_map') return mapStatus === 'failed';
  return itemIsFailed(item);
}

function requiredItemIsUnavailable(
  item: OfflinePrepPackItem,
  mapStatus: OfflinePrepMapQueueStatus | 'missing',
): boolean {
  if (item.type === 'offline_map') return mapStatus === 'unavailable' || mapStatus === 'missing';
  return itemIsUnavailable(item);
}

function attentionForManifestItem(
  item: OfflinePrepPackItem,
  severity: OfflinePrepPresentationAttentionSeverity,
): OfflinePrepPresentationAttentionItem {
  const failed = itemIsFailed(item);
  return {
    id: `item:${item.id}`,
    severity,
    title: `${item.label} ${failed ? 'failed' : item.required ? 'is required' : 'is not included'}`,
    message: item.error?.message ?? item.summary,
    recommendedAction: failed
      ? 'Retry this preparation step.'
      : item.required
        ? 'Prepare this item before relying on the pack offline.'
        : 'Add this optional context when it is useful and a source is available.',
    itemType: item.type,
    source: 'manifest_item',
  };
}

function attentionForAuditIssue(issue: OfflineReadinessAuditIssue): OfflinePrepPresentationAttentionItem {
  return {
    id: `audit:${issue.issueId}`,
    severity: issue.code === 'asset_corrupt' ? 'error' : issue.severity,
    title: issue.title,
    message: issue.explanation,
    recommendedAction: issue.recommendedAction,
    itemType: null,
    source: 'readiness_audit',
  };
}

function groupStatus(
  groupId: OfflinePrepPresentationGroupId,
  items: OfflinePrepPackItem[],
  mapStatus: OfflinePrepMapQueueStatus | 'missing',
  partialMapCoverage: boolean,
): OfflinePrepPresentationKind {
  if (groupId === 'map') {
    if (mapStatus === 'complete') return partialMapCoverage ? 'degraded' : 'ready';
    if (mapStatus === 'queued' || mapStatus === 'downloading') return 'preparing';
    if (mapStatus === 'not_requested' || mapStatus === 'cancelled') return 'needs_download';
    if (mapStatus === 'failed') return 'error';
    return 'blocked';
  }

  const required = items.filter((item) => item.required);
  if (required.some(itemIsFailed)) return 'error';
  if (required.some(itemIsPreparing)) return 'preparing';
  if (required.some(itemIsUnavailable)) return 'blocked';
  if (required.some((item) => !itemIsReady(item))) return 'needs_download';
  if (items.length > 0 && items.every(itemIsReady)) return 'ready';
  return 'degraded';
}

function groupSummary(
  id: OfflinePrepPresentationGroupId,
  status: OfflinePrepPresentationKind,
  readyCount: number,
  itemCount: number,
  requiredReadyCount: number,
  requiredCount: number,
): string {
  if (id === 'map') {
    if (status === 'ready') return 'Route map tiles are cached and available without a network connection.';
    if (status === 'degraded') return 'Only the selected low-signal route segments are cached; full-route offline map coverage is not available.';
    if (status === 'preparing') return 'Route map tiles are being saved through the shared ECS download queue.';
    if (status === 'needs_download') return 'Route map tiles still need to be downloaded.';
    if (status === 'error') return 'The route map download failed and needs review or retry.';
    return 'A usable offline map is not available for this route.';
  }
  if (requiredCount > 0 && requiredReadyCount < requiredCount) {
    return `${requiredReadyCount}/${requiredCount} required items are ready; ${readyCount}/${itemCount} total items are available.`;
  }
  if (itemCount === 0) return 'No items are available in this section.';
  if (readyCount === itemCount) return `All ${itemCount} items are available offline.`;
  return `${readyCount}/${itemCount} items are available. Optional gaps remain clearly marked.`;
}

function buildGroups(
  items: OfflinePrepPackItem[],
  mapStatus: OfflinePrepMapQueueStatus | 'missing',
  mapNavigationReady: boolean,
  partialMapCoverage: boolean,
): OfflinePrepPresentationGroup[] {
  const grouped: Record<OfflinePrepPresentationGroupId, OfflinePrepPackItem[]> = {
    map: [],
    route_geometry: [],
    guidance_itinerary: [],
    optional_field_context: [],
  };
  items.forEach((item) => grouped[groupIdForItem(item.type)].push(item));

  return (Object.keys(grouped) as OfflinePrepPresentationGroupId[]).map((id) => {
    const groupItems = grouped[id];
    const required = groupItems.filter((item) => item.required);
    const readyCount = groupItems.filter((item) => (
      item.type === 'offline_map' ? mapNavigationReady : itemIsReady(item)
    )).length;
    const requiredReadyCount = required.filter((item) => requiredItemIsReady(item, mapStatus, mapNavigationReady)).length;
    const status = groupStatus(id, groupItems, mapStatus, partialMapCoverage);
    return {
      id,
      label: GROUP_LABELS[id],
      summary: groupSummary(
        id,
        status,
        readyCount,
        groupItems.length,
        requiredReadyCount,
        required.length,
      ),
      status,
      items: groupItems,
      readyCount,
      requiredCount: required.length,
      requiredReadyCount,
      gapCount: groupItems.length - readyCount,
      estimatedSizeMB: sumEstimatedSize(groupItems),
    };
  });
}

function resolveTurnGuidanceState(items: OfflinePrepPackItem[]): OfflinePrepTurnGuidanceState {
  const roadGuidance = items.find((item) => item.type === 'road_turn_guidance') ?? null;
  if (!roadGuidance) return 'not_required';
  if (itemIsReady(roadGuidance)) return 'ready';
  if (itemIsPreparing(roadGuidance)) return 'preparing';
  if (itemIsFailed(roadGuidance)) return 'failed';
  return 'unavailable';
}

function actionLabel(kind: OfflinePrepPresentationKind, lowSignalFallback: boolean): string {
  switch (kind) {
    case 'needs_download':
      return lowSignalFallback ? 'Download Low-Signal Map Segments' : 'Download Offline Pack';
    case 'preparing':
      return 'Preparing Offline Pack';
    case 'ready':
      return 'Offline Pack Ready';
    case 'degraded':
      return 'Review Offline Limits';
    case 'blocked':
      return 'Resolve Required Items';
    case 'error':
      return 'Retry Offline Preparation';
  }
}

function headlineAndSummary(input: {
  kind: OfflinePrepPresentationKind;
  routeName: string;
  turnGuidanceState: OfflinePrepTurnGuidanceState;
  optionalGapCount: number;
  requiredReadyCount: number;
  requiredCount: number;
  queue: OfflinePrepMapQueueState | null;
  partialMapCoverage: boolean;
}): { headline: string; summary: string } {
  const { kind, routeName, turnGuidanceState, optionalGapCount, requiredReadyCount, requiredCount, queue, partialMapCoverage } = input;
  switch (kind) {
    case 'needs_download':
      return {
        headline: 'Offline pack ready to download',
        summary: `${routeName} has the required route data. Download its map package before leaving service.`,
      };
    case 'preparing':
      return {
        headline: 'Preparing offline navigation',
        summary: queue?.message ?? `ECS is preparing ${routeName} for offline use.`,
      };
    case 'ready':
      return {
        headline: 'Ready for offline navigation',
        summary: optionalGapCount > 0
          ? `Required map, route, and guidance assets are ready. ${optionalGapCount} optional item${optionalGapCount === 1 ? ' is' : 's are'} not included.`
          : 'Required map, route, and guidance assets are available without a network connection.',
      };
    case 'degraded':
      return {
        headline: partialMapCoverage ? 'Partial offline map coverage' : 'Offline navigation ready with limits',
        summary: partialMapCoverage
          ? 'Low-signal map segments are cached, but the full route map is not. ECS will not present this pack as fully ready for offline navigation.'
          : turnGuidanceState === 'unavailable'
          ? 'The offline map and canonical route line are ready, but detailed road turns are unavailable. ECS will not present line-only guidance as cached turn-by-turn navigation.'
          : 'Required route assets are available, but a freshness, integrity, or coverage limitation needs review.',
      };
    case 'error':
      return {
        headline: 'Offline preparation needs retry',
        summary: queue?.errorMessage ?? 'A required offline preparation step failed. Review the error before retrying.',
      };
    case 'blocked':
    default:
      return {
        headline: 'Offline navigation is not ready',
        summary: `${requiredReadyCount}/${requiredCount} required items are ready. Resolve the required gaps before relying on this pack offline.`,
      };
  }
}

/**
 * Converts the canonical manifest and live map queue into compact UI truth.
 * It does not mutate readiness, start downloads, or infer provider data.
 */
export function buildOfflinePrepPackPresentation({
  manifest,
  mapQueueState,
  now = new Date(),
}: BuildOfflinePrepPackPresentationInput): OfflinePrepPackPresentation {
  const items = manifest.items;
  const mapItem = items.find((item) => item.type === 'offline_map') ?? null;
  const lowSignalFallback = Boolean(
    mapItem?.metadata?.fullRouteTooLarge === true &&
      items.some((item) => item.type === 'critical_offline_segments'),
  );
  const mapStatus = effectiveMapStatus(mapItem, mapQueueState);
  const partialMapCoverage = lowSignalFallback && mapStatus === 'complete';
  const mapReady = mapStatus === 'complete' && !partialMapCoverage;
  const routeGeometryItems = items.filter((item) => ROUTE_GEOMETRY_ITEM_TYPES.has(item.type));
  const drawableGeometryItems = routeGeometryItems.filter((item) => DRAWABLE_ROUTE_ITEM_TYPES.has(item.type));
  const requiredGeometryItems = routeGeometryItems.filter((item) => item.required);
  const routeGeometryReady = drawableGeometryItems.some(itemIsReady) &&
    requiredGeometryItems.every(itemIsReady);
  const turnGuidanceState = resolveTurnGuidanceState(items);
  const requiredItems = items.filter((item) => item.required);
  const requiredReadyCount = requiredItems.filter((item) => requiredItemIsReady(item, mapStatus, mapReady)).length;
  const optionalGapCount = items.filter((item) => !item.required && !itemIsReady(item)).length;
  const requiredNonMapFailure = requiredItems.some((item) => (
    item.type !== 'offline_map' && requiredItemIsFailed(item, mapStatus)
  ));
  const requiredPreparing = requiredItems.some((item) => requiredItemIsPreparing(item, mapStatus));
  const requiredUnavailable = requiredItems.some((item) => requiredItemIsUnavailable(item, mapStatus));
  const requiredPending = requiredItems.some((item) => !requiredItemIsReady(item, mapStatus, mapReady));
  const mapNeedsDownload = mapStatus === 'not_requested' ||
    mapStatus === 'cancelled' ||
    (mapStatus === 'failed' && lowSignalFallback);
  const audit = auditOfflineReadinessManifest(manifest.readinessManifest, now);
  const auditHardErrors = audit.blockers.filter((issue) => issue.code === 'asset_corrupt');
  const auditHardBlockers = audit.blockers.filter((issue) => ![
    'required_asset_missing',
    'required_asset_incomplete',
    'asset_corrupt',
  ].includes(issue.code) && !(
    issue.kind === 'map_region' && issue.code === 'partial_coverage'
  ));
  const requiredAuditWarnings = audit.warnings.filter((issue) => {
    const asset = manifest.readinessManifest.assets.find((candidate) => candidate.assetId === issue.assetId);
    return asset?.required === true && [
      'asset_stale',
      'integrity_unverified',
      'provider_offline_unknown',
      'partial_coverage',
    ].includes(issue.code);
  });
  const requiredRoadGuidanceUnavailable = items.some((item) => (
    item.type === 'road_turn_guidance' && item.required && !itemIsReady(item)
  ));
  const optionalRoadGuidanceUnavailable = items.some((item) => (
    item.type === 'road_turn_guidance' && !item.required && !itemIsReady(item)
  ));
  const navigationCoreReady = mapReady && routeGeometryReady && requiredReadyCount === requiredItems.length;

  let kind: OfflinePrepPresentationKind;
  if (requiredNonMapFailure || (mapStatus === 'failed' && !lowSignalFallback) || auditHardErrors.length > 0) {
    kind = 'error';
  } else if (
    requiredUnavailable ||
    !routeGeometryReady ||
    mapStatus === 'unavailable' ||
    mapStatus === 'missing' ||
    requiredRoadGuidanceUnavailable ||
    auditHardBlockers.length > 0
  ) {
    kind = 'blocked';
  } else if (requiredPreparing || mapStatus === 'queued' || mapStatus === 'downloading') {
    kind = 'preparing';
  } else if (partialMapCoverage) {
    kind = 'degraded';
  } else if (mapNeedsDownload || requiredPending) {
    kind = 'needs_download';
  } else if (navigationCoreReady && (optionalRoadGuidanceUnavailable || requiredAuditWarnings.length > 0)) {
    kind = 'degraded';
  } else if (navigationCoreReady) {
    kind = 'ready';
  } else {
    kind = 'blocked';
  }

  const attentionItems: OfflinePrepPresentationAttentionItem[] = [];
  items.forEach((item) => {
    if (item.type === 'offline_map' && mapReady) return;
    if (item.required && itemIsFailed(item)) {
      attentionItems.push(attentionForManifestItem(item, 'error'));
    } else if (item.required && !itemIsReady(item) && !itemIsPreparing(item)) {
      attentionItems.push(attentionForManifestItem(item, 'blocker'));
    } else if (!item.required && !itemIsReady(item)) {
      attentionItems.push(attentionForManifestItem(item, 'warning'));
    }
  });
  if (drawableGeometryItems.length === 0) {
    attentionItems.push({
      id: 'presentation:route-geometry-missing',
      severity: 'blocker',
      title: 'Canonical route geometry is missing',
      message: 'A drawable route line is required before ECS can present this pack as offline-navigation ready.',
      recommendedAction: 'Return to Trip Builder and prepare valid canonical route geometry.',
      itemType: null,
      source: 'presentation',
    });
  }
  [...auditHardErrors, ...auditHardBlockers, ...requiredAuditWarnings].forEach((issue) => {
    attentionItems.push(attentionForAuditIssue(issue));
  });
  const dedupedAttention = Array.from(new Map(
    attentionItems.map((item) => [item.id, item]),
  ).values());
  const copy = headlineAndSummary({
    kind,
    routeName: manifest.routeName,
    turnGuidanceState,
    optionalGapCount,
    requiredReadyCount,
    requiredCount: requiredItems.length,
    queue: mapQueueState,
    partialMapCoverage,
  });

  return {
    kind,
    headline: copy.headline,
    summary: copy.summary,
    routeName: manifest.routeName,
    navigationReady: navigationCoreReady,
    mapReady,
    mapStatus,
    routeGeometryReady,
    turnGuidanceState,
    requiredReadyCount,
    requiredCount: requiredItems.length,
    optionalGapCount,
    estimatedSizeMB: sumEstimatedSize(items),
    groups: buildGroups(items, mapStatus, mapReady, partialMapCoverage),
    attentionItems: dedupedAttention,
    primaryActionKind: kind,
    primaryActionLabel: actionLabel(kind, lowSignalFallback),
    primaryActionEnabled: kind !== 'preparing' && kind !== 'ready',
  };
}
