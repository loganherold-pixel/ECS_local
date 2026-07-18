export type MapStyleKey = 'ecs' | 'tactical' | 'satellite' | '3d' | 'route-progress';

export const DEFAULT_MAP_STYLE: MapStyleKey = 'ecs';

/**
 * Normalizes persisted/display aliases without treating distinct map styles as
 * interchangeable offline assets.
 */
export function normalizeMapStyleKey(value: unknown): MapStyleKey | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return null;
  if (normalized === 'day' || normalized === 'default' || normalized === 'ecs') return 'ecs';
  if (normalized === 'tac' || normalized === 'tactical') return 'tactical';
  if (normalized === 'sat' || normalized === 'satellite') return 'satellite';
  if (normalized === '3d') return '3d';
  if (normalized === 'route-progress' || normalized === 'route_progress') return 'route-progress';
  return null;
}

export function mapStyleKeysMatch(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeMapStyleKey(left);
  const normalizedRight = normalizeMapStyleKey(right);
  return normalizedLeft != null && normalizedLeft === normalizedRight;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Before Offline Prep carried the selected map style, it always persisted
 * `tactical` even though both the legacy Tactical key and ECS Day key were
 * downloaded from the same default OSM raster URL family. The old intent is
 * uniquely identified by its Offline Prep manifest and its pre-layer-contract
 * context. New explicit Tactical packs include route-corridor/road-preview and
 * must remain distinct from ECS Day.
 */
export function isLegacyOfflinePrepTacticalTileRecord(
  styleKey: unknown,
  routeIntent: unknown,
): boolean {
  if (normalizeMapStyleKey(styleKey) !== 'tactical') return false;
  const intent = record(routeIntent);
  if (intent?.syncType !== 'route') return false;
  const mapContext = record(intent.mapContext);
  const layers = Array.isArray(mapContext?.layerContext)
    ? mapContext.layerContext
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
    : [];
  if (!layers.includes('offline_prep_pack') || !layers.includes('trip_builder_itinerary')) return false;
  if (layers.includes('route-corridor') || layers.includes('road-preview')) return false;
  const readinessSnapshot = record(intent.readinessSnapshot);
  return record(readinessSnapshot?.offlinePrepManifest) != null;
}

/** Read-time style reconciliation for the proven legacy Offline Prep record. */
export function resolveOfflineTileStyleKey(
  styleKey: unknown,
  routeIntent: unknown,
): MapStyleKey | null {
  if (isLegacyOfflinePrepTacticalTileRecord(styleKey, routeIntent)) return 'ecs';
  return normalizeMapStyleKey(styleKey);
}
