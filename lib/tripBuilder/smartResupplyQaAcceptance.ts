import Constants from 'expo-constants';

import { ecsLog } from '../ecsLogger';
import { createECSDiagnosticToken } from '../observability/ecsDiagnosticRedaction';
import type {
  RoadNavDestination,
  RoadNavSearchSuggestion,
} from '../mapboxRoadNavigation';
import type { TripBuilderGuidanceItineraryPoint } from './tripBuilderGuidanceItinerary';

export type SmartResupplyQaFixture = 'qualified_empty' | null;

export type SmartResupplyQaRuntimeConfig = {
  authorized: boolean;
  diagnosticsApproved: boolean;
  fixture: SmartResupplyQaFixture;
  consoleCapture: boolean;
};

export type SmartResupplyQaTerminalState =
  | 'ready'
  | 'ready_empty_qualified'
  | 'partial_provider'
  | 'provider_error';

export type SmartResupplyQaCountEvent = {
  evaluationId: string;
  category: 'fuel' | 'food_supplies';
  plannerRankedCount: number | null;
  uiAdaptedCount: number | null;
  mountedRowCount: number | null;
  terminalState: SmartResupplyQaTerminalState;
  partialProvider: boolean;
};

export type SmartResupplyQaCanonicalEvent = {
  correlationId: string;
  orderedSemanticStopRoles: Array<'origin' | 'resupply' | 'trailhead' | 'destination'>;
  stopIdHashes: string[];
  selectedResupplyIndex: number;
  trailheadStartIndex: number;
  selectedResupplyOccurrenceCount: number;
};

export type SmartResupplyQaDiagnosticEvent =
  | 'smart_evaluation_completed'
  | 'smart_ui_adapter_completed'
  | 'smart_rows_mounted'
  | 'smart_canonical_output_created';

const DEFAULT_CONFIG: SmartResupplyQaRuntimeConfig = Object.freeze({
  authorized: false,
  diagnosticsApproved: false,
  fixture: null,
  consoleCapture: false,
});

const QUALIFIED_EMPTY_SUGGESTION_IDS = [
  'ecs-qa-qualified-empty-supply-a',
  'ecs-qa-qualified-empty-supply-a-duplicate',
  'ecs-qa-qualified-empty-supply-b',
] as const;

const QUALIFIED_EMPTY_DESTINATIONS: Record<string, RoadNavDestination> = {
  'ecs-qa-qualified-empty-supply-a': {
    id: 'ecs-qa-qualified-empty-supply-a',
    title: 'Synthetic QA grocery candidate A',
    subtitle: 'QA fixture candidate',
    coordinate: { lat: 80, lng: 170 },
    sourceType: 'searchbox_retrieve',
    mapboxId: 'ecs-qa-qualified-empty-supply-a',
    raw: { properties: { category: 'grocery_store' } },
  },
  'ecs-qa-qualified-empty-supply-a-duplicate': {
    id: 'ecs-qa-qualified-empty-supply-a-duplicate',
    title: 'Synthetic QA grocery candidate A duplicate',
    subtitle: 'QA fixture duplicate candidate',
    coordinate: { lat: 80, lng: 170 },
    sourceType: 'searchbox_retrieve',
    mapboxId: 'ecs-qa-qualified-empty-supply-a-duplicate',
    raw: { properties: { category: 'grocery_store' } },
  },
  'ecs-qa-qualified-empty-supply-b': {
    id: 'ecs-qa-qualified-empty-supply-b',
    title: 'Synthetic QA grocery candidate B',
    subtitle: 'QA fixture candidate',
    coordinate: { lat: -80, lng: -170 },
    sourceType: 'searchbox_retrieve',
    mapboxId: 'ecs-qa-qualified-empty-supply-b',
    raw: { properties: { category: 'grocery_store' } },
  },
};

function runtimeConfigSource(): unknown {
  const globalOverride = (globalThis as unknown as {
    __ECS_SMART_RESUPPLY_QA_CONFIG__?: unknown;
  }).__ECS_SMART_RESUPPLY_QA_CONFIG__;
  if (globalOverride != null) return globalOverride;
  return (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.scopeBSmartResupplyQa;
}

export function resolveSmartResupplyQaRuntimeConfig(
  value: unknown = runtimeConfigSource(),
): SmartResupplyQaRuntimeConfig {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONFIG };
  const candidate = value as Record<string, unknown>;
  const authorized = candidate.authorized === true;
  if (!authorized) return { ...DEFAULT_CONFIG };
  return {
    authorized: true,
    diagnosticsApproved: candidate.diagnosticsApproved === true,
    fixture: candidate.fixture === 'qualified_empty' ? 'qualified_empty' : null,
    consoleCapture: candidate.consoleCapture === true,
  };
}

export function createSmartResupplyQaCorrelationId(): string {
  const cryptoApi = (globalThis as unknown as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (values: Uint8Array) => Uint8Array };
  }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function enableApprovedDiagnosticsForAuthorizedQaBuild(config: SmartResupplyQaRuntimeConfig): boolean {
  if (!config.authorized || !config.diagnosticsApproved) return false;
  const globalStore = globalThis as unknown as Record<string, unknown>;
  globalStore.__ECS_SUPPORT_DIAGNOSTICS_ENABLED = true;
  globalStore.__ECS_SUPPORT_DIAGNOSTICS_APPROVED = true;
  return ecsLog.getDiagnostics().approvedSupportMode;
}

export function isSmartResupplyQaDiagnosticsApproved(): boolean {
  return enableApprovedDiagnosticsForAuthorizedQaBuild(resolveSmartResupplyQaRuntimeConfig());
}

export function isSmartResupplyQualifiedEmptyFixtureEnabled(): boolean {
  const config = resolveSmartResupplyQaRuntimeConfig();
  return config.authorized && config.fixture === 'qualified_empty';
}

export function qualifiedEmptySmartResupplySuggestions(
  category: 'fuel' | 'food_supplies',
): RoadNavSearchSuggestion[] | null {
  if (!isSmartResupplyQualifiedEmptyFixtureEnabled() || category !== 'food_supplies') return null;
  return QUALIFIED_EMPTY_SUGGESTION_IDS.map((id) => ({
    id,
    title: 'Synthetic QA grocery candidate',
    subtitle: 'QA fixture candidate',
    sourceType: 'searchbox_suggest',
    mapboxId: id,
    coordinate: null,
    raw: { properties: { category: 'grocery_store' } },
  }));
}

export function qualifiedEmptySmartResupplyDestination(
  suggestion: RoadNavSearchSuggestion,
): RoadNavDestination | null {
  if (!isSmartResupplyQualifiedEmptyFixtureEnabled()) return null;
  const destination = QUALIFIED_EMPTY_DESTINATIONS[suggestion.id];
  return destination ? { ...destination, coordinate: { ...destination.coordinate } } : null;
}

function finiteCount(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.max(0, Math.trunc(value));
}

function sanitizeCountEvent(event: SmartResupplyQaCountEvent): SmartResupplyQaCountEvent {
  return {
    evaluationId: String(event.evaluationId),
    category: event.category,
    plannerRankedCount: finiteCount(event.plannerRankedCount),
    uiAdaptedCount: finiteCount(event.uiAdaptedCount),
    mountedRowCount: finiteCount(event.mountedRowCount),
    terminalState: event.terminalState,
    partialProvider: event.partialProvider === true,
  };
}

export function emitSmartResupplyQaCountDiagnostic(
  event: Exclude<SmartResupplyQaDiagnosticEvent, 'smart_canonical_output_created'>,
  properties: SmartResupplyQaCountEvent,
): boolean {
  const config = resolveSmartResupplyQaRuntimeConfig();
  if (!enableApprovedDiagnosticsForAuthorizedQaBuild(config)) return false;
  const sanitized = sanitizeCountEvent(properties);
  ecsLog.debug('ROUTE_CONTEXT', event, sanitized);
  if (config.consoleCapture) {
    console.info('[ECS_SCOPE_B_QA_DIAGNOSTIC]', JSON.stringify({ event, ...sanitized }));
  }
  return true;
}

export function buildSmartResupplyQaCanonicalEvent(input: {
  correlationId: string;
  itinerary: Pick<TripBuilderGuidanceItineraryPoint, 'id' | 'role' | 'sourceStopId'>[];
}): SmartResupplyQaCanonicalEvent {
  const stopIdHashes = input.itinerary.map((point) => (
    createECSDiagnosticToken('stop', point.sourceStopId ?? point.id) ?? 'stop_unknown'
  ));
  const selectedResupplyIndex = input.itinerary.findIndex((point) => point.role === 'resupply');
  const trailheadStartIndex = input.itinerary.findIndex((point) => point.role === 'trailhead');
  const selectedHash = selectedResupplyIndex >= 0 ? stopIdHashes[selectedResupplyIndex] : null;
  return {
    correlationId: String(input.correlationId),
    orderedSemanticStopRoles: input.itinerary.map((point) => point.role),
    stopIdHashes,
    selectedResupplyIndex,
    trailheadStartIndex,
    selectedResupplyOccurrenceCount: selectedHash == null
      ? 0
      : stopIdHashes.filter((hash) => hash === selectedHash).length,
  };
}

export function emitSmartResupplyQaCanonicalDiagnostic(
  properties: SmartResupplyQaCanonicalEvent,
): boolean {
  const config = resolveSmartResupplyQaRuntimeConfig();
  if (!enableApprovedDiagnosticsForAuthorizedQaBuild(config)) return false;
  const sanitized: SmartResupplyQaCanonicalEvent = {
    correlationId: String(properties.correlationId),
    orderedSemanticStopRoles: [...properties.orderedSemanticStopRoles],
    stopIdHashes: [...properties.stopIdHashes],
    selectedResupplyIndex: Math.trunc(properties.selectedResupplyIndex),
    trailheadStartIndex: Math.trunc(properties.trailheadStartIndex),
    selectedResupplyOccurrenceCount: Math.max(0, Math.trunc(properties.selectedResupplyOccurrenceCount)),
  };
  ecsLog.debug('ROUTE_CONTEXT', 'smart_canonical_output_created', sanitized);
  if (config.consoleCapture) {
    console.info('[ECS_SCOPE_B_QA_DIAGNOSTIC]', JSON.stringify({
      event: 'smart_canonical_output_created',
      ...sanitized,
    }));
  }
  return true;
}

export function clearSmartResupplyQaRuntimeApprovalForTest(): void {
  const globalStore = globalThis as unknown as Record<string, unknown>;
  delete globalStore.__ECS_SUPPORT_DIAGNOSTICS_ENABLED;
  delete globalStore.__ECS_SUPPORT_DIAGNOSTICS_APPROVED;
  delete globalStore.__ECS_SMART_RESUPPLY_QA_CONFIG__;
}
