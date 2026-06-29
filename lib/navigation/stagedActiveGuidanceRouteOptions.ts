import type { RoadNavRoute } from '../mapboxRoadNavigation';
import { getRoadNavRouteVersion, getRouteIndex } from './routeVersion';

export interface StagedActiveGuidanceRouteOption {
  id: string;
  routeId: string | null;
  routeVersion: string | null;
  routeIndex: number | null;
  selectedRouteIndex: number | null;
  label: string;
  geometry: RoadNavRoute['geometry'];
  steps: RoadNavRoute['guidance']['steps'];
  etaIso: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  providerMetadata: Record<string, unknown> | null;
  etaLabel: string;
  distanceLabel: string;
  durationLabel: string;
  summaryLabel: string | null;
  dataStatusLabel: string | null;
  selected: boolean;
  disabled: boolean;
  unavailableReason: string | null;
}

export interface BuildStagedActiveGuidanceRouteOptionsInput {
  routes: readonly RoadNavRoute[];
  selectedRouteId?: string | null;
  nowMs?: number;
  formatDistance: (meters: number | null | undefined) => string;
  formatDuration: (seconds: number | null | undefined) => string;
  formatEta: (etaIso: string | null) => string;
}

const ROUTE_OPTION_COUNT = 3;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function routeOptionLabel(index: number): string {
  if (index === 0) return 'Primary / Recommended';
  return `Alternate ${index}`;
}

function missingOptionLabel(index: number): string {
  return index === 1 ? 'Alternate unavailable' : 'No safe alternate found';
}

function selectedRouteIndex(route: RoadNavRoute, index: number): number {
  const routeIndex = finiteNumber(route.selectedRouteIndex);
  return routeIndex == null ? index : Math.max(0, Math.floor(routeIndex));
}

function summarizeRoute(route: RoadNavRoute): string | null {
  const roadLegSummary = route.legs
    .map((leg) => cleanString(leg.summary))
    .filter((summary): summary is string => !!summary)
    .join(' / ');
  if (roadLegSummary) return roadLegSummary;

  const guidanceLegSummary = route.guidance.legs
    .map((leg) => cleanString(leg.summary))
    .filter((summary): summary is string => !!summary)
    .join(' / ');
  if (guidanceLegSummary) return guidanceLegSummary;

  return cleanString(route.steps[0]?.roadName) ?? cleanString(route.guidance.steps[0]?.displayRoadName);
}

function dataStatusLabel(route: RoadNavRoute): string | null {
  return (
    cleanString(route.guidance.guidanceSourceLabel) ??
    (route.guidanceMode === 'turn_by_turn' ? 'Turn-by-turn ready' : 'Route summary only')
  );
}

function etaIsoForRoute(route: RoadNavRoute, nowMs: number): string | null {
  const durationS = finiteNumber(route.durationS);
  if (durationS != null && durationS >= 0) {
    return new Date(nowMs + durationS * 1000).toISOString();
  }
  return cleanString(route.guidance.etaIso);
}

export function buildStagedActiveGuidanceRouteOptions(
  input: BuildStagedActiveGuidanceRouteOptionsInput,
): StagedActiveGuidanceRouteOption[] {
  const nowMs = finiteNumber(input.nowMs) ?? Date.now();
  const realRoutes = input.routes.slice(0, ROUTE_OPTION_COUNT);
  const selectedRouteId = cleanString(input.selectedRouteId) ?? realRoutes[0]?.id ?? null;
  const options: StagedActiveGuidanceRouteOption[] = realRoutes.map((route, index) => ({
    id: route.id,
    routeId: route.id,
    routeVersion: getRoadNavRouteVersion(route),
    routeIndex: getRouteIndex(route, index),
    selectedRouteIndex: selectedRouteIndex(route, index),
    label: routeOptionLabel(index),
    geometry: route.guidance.geometry?.length ? route.guidance.geometry : route.geometry,
    steps: route.guidance.steps,
    etaIso: etaIsoForRoute(route, nowMs),
    durationSeconds: route.durationS,
    distanceMeters: route.distanceM,
    providerMetadata: route.providerMetadata ?? route.guidance.providerMetadata ?? null,
    etaLabel: input.formatEta(etaIsoForRoute(route, nowMs)),
    distanceLabel: input.formatDistance(route.distanceM),
    durationLabel: input.formatDuration(route.durationS),
    summaryLabel: summarizeRoute(route),
    dataStatusLabel: dataStatusLabel(route),
    selected: route.id === selectedRouteId,
    disabled: false,
    unavailableReason: null,
  }));

  while (options.length < ROUTE_OPTION_COUNT) {
    const index = options.length;
    options.push({
      id: `missing-route-option-${index}`,
      routeId: null,
      routeVersion: null,
      routeIndex: null,
      selectedRouteIndex: null,
      label: missingOptionLabel(index),
      geometry: [],
      steps: [],
      etaIso: null,
      durationSeconds: null,
      distanceMeters: null,
      providerMetadata: null,
      etaLabel: '--',
      distanceLabel: '--',
      durationLabel: '--',
      summaryLabel: 'No real alternate route returned.',
      dataStatusLabel: 'Unavailable',
      selected: false,
      disabled: true,
      unavailableReason: 'No real alternate route returned.',
    });
  }

  return options;
}
