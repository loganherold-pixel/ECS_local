import type { RoadNavRoute, RoadNavStep } from './mapboxRoadNavigation';
import type { EcsActiveGuidanceProgress } from './navigation/ecsActiveGuidanceController';
import type { EcsGuidanceMode, EcsGuidanceRoute, EcsGuidanceStep } from './navigation/ecsGuidanceModel';

export type ActiveGuidanceDirectionKind = 'maneuver' | 'arrival' | 'status';
export type ActiveGuidanceDirectionsState = 'ready' | 'summary_only' | 'pending' | 'unavailable';

export interface ActiveGuidanceDirectionItem {
  id: string;
  instruction: string;
  detail: string | null;
  roadName?: string;
  distanceM: number | null;
  durationS: number | null;
  kind: ActiveGuidanceDirectionKind;
  sequenceLabel: string;
  iconName?: string;
  isCurrent?: boolean;
  globalStepIndex?: number;
}

export interface ActiveGuidanceDirectionList {
  state: ActiveGuidanceDirectionsState;
  items: ActiveGuidanceDirectionItem[];
  emptyMessage: string | null;
  routeId: string | null;
  rerouteGeneration: number | null;
  currentStepIndex: number | null;
  guidanceMode: EcsGuidanceMode | null;
  sourceLabel: string | null;
}

export interface BuildActiveGuidanceDirectionListInput {
  route: EcsGuidanceRoute | null | undefined;
  progress: EcsActiveGuidanceProgress | null | undefined;
  status?: string | null;
}

export interface BuildActiveRoadDirectionListInput {
  route: RoadNavRoute | null | undefined;
  currentStepIndex: number | null | undefined;
  remainingDistanceM: number | null | undefined;
  nextInstructionDistanceM: number | null | undefined;
}

export interface BuildFallbackActiveDirectionListInput {
  instruction: string | null | undefined;
  distanceM?: number | null;
  detail?: string | null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return trimmed;
}

function clampStepIndex(index: number | null | undefined, stepCount: number): number {
  const normalized = finiteNumber(index) ?? 0;
  if (stepCount <= 1) return 0;
  return Math.max(0, Math.min(stepCount - 1, Math.floor(normalized) + 1));
}

function clampGuidanceStepIndex(index: number | null | undefined, stepCount: number): number {
  const normalized = finiteNumber(index) ?? 0;
  if (stepCount <= 1) return 0;
  return Math.max(0, Math.min(stepCount - 1, Math.floor(normalized)));
}

function isArrivalStep(step: RoadNavStep): boolean {
  const maneuver = String(step.maneuverType ?? '').toLowerCase();
  const instruction = step.instruction.toLowerCase();
  return (
    maneuver === 'arrive' ||
    maneuver === 'arrival' ||
    instruction.includes('arrive') ||
    instruction.includes('destination')
  );
}

function isEcsArrivalStep(step: EcsGuidanceStep): boolean {
  const maneuver = cleanString(step.maneuverType)?.toLowerCase() ?? '';
  const instruction = cleanString(step.instruction)?.toLowerCase() ?? '';
  return (
    maneuver === 'arrive' ||
    maneuver === 'arrival' ||
    instruction.includes('arrived') ||
    instruction.includes('destination')
  );
}

function directionIconName(
  maneuverType: string | null | undefined,
  maneuverModifier: string | null | undefined,
): string {
  const type = cleanString(maneuverType)?.toLowerCase() ?? '';
  const modifier = cleanString(maneuverModifier)?.toLowerCase().replace(/_/g, ' ') ?? '';
  if (type === 'arrive' || type === 'arrival') return 'flag';
  if (modifier.includes('uturn') || modifier.includes('u-turn')) return 'refresh';
  if (type.includes('roundabout') || type === 'rotary') return 'sync';
  if (modifier.includes('left')) return 'arrow-back';
  if (modifier.includes('right')) return 'arrow-forward';
  if (type === 'merge') return 'git-merge';
  return 'arrow-up';
}

function roadNameForStep(step: EcsGuidanceStep): string {
  return cleanString(step.displayRoadName) ?? cleanString(step.roadName) ?? 'Unnamed road';
}

function instructionForStep(step: EcsGuidanceStep): string {
  if (isEcsArrivalStep(step)) return 'You have arrived at your destination';
  return cleanString(step.instruction) ?? `Continue on ${roadNameForStep(step)}`;
}

function emptyGuidanceDirectionList(
  state: ActiveGuidanceDirectionsState,
  emptyMessage: string,
  route: EcsGuidanceRoute | null | undefined,
  progress: EcsActiveGuidanceProgress | null | undefined,
): ActiveGuidanceDirectionList {
  return {
    state,
    items: [],
    emptyMessage,
    routeId: route?.id ?? progress?.routeId ?? null,
    rerouteGeneration: route?.rerouteGeneration ?? progress?.rerouteGeneration ?? null,
    currentStepIndex: progress?.currentStepIndex ?? null,
    guidanceMode: route?.guidanceMode ?? null,
    sourceLabel: route?.guidanceSourceLabel ?? null,
  };
}

function distanceToStep(
  step: RoadNavStep,
  index: number,
  input: BuildActiveRoadDirectionListInput,
  traveledDistanceM: number | null,
): number | null {
  if (index === 0) {
    const liveDistance = finiteNumber(input.nextInstructionDistanceM);
    if (liveDistance != null) return Math.max(0, Math.round(liveDistance));
  }
  if (traveledDistanceM == null) {
    return finiteNumber(step.distanceM);
  }
  return Math.max(0, Math.round(step.startDistanceM - traveledDistanceM));
}

export function formatActiveDirectionDistance(meters: number | null | undefined): string {
  const value = finiteNumber(meters);
  if (value == null) return '--';
  if (value < 160) {
    const feet = value * 3.28084;
    return `${Math.max(Math.round(feet / 5) * 5, 5)} ft`;
  }
  const miles = value / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function buildActiveGuidanceDirectionList(
  input: BuildActiveGuidanceDirectionListInput,
): ActiveGuidanceDirectionList {
  const status = cleanString(input.status)?.toLowerCase() ?? '';
  if (status === 'rerouting' || status === 'destination_selected' || status === 'searching') {
    return emptyGuidanceDirectionList(
      'pending',
      'Directions will appear when route calculation completes',
      input.route,
      input.progress,
    );
  }

  const route = input.route ?? null;
  if (!route) {
    return emptyGuidanceDirectionList(
      'pending',
      'Directions will appear when route calculation completes',
      route,
      input.progress,
    );
  }

  if (route.guidanceMode !== 'turn_by_turn') {
    const summaryMessage =
      cleanString(route.guidanceLimitationLabel) ??
      'No turn-by-turn directions available for this route';
    return emptyGuidanceDirectionList(
      route.guidanceMode === 'summary_only' ? 'summary_only' : 'unavailable',
      summaryMessage,
      route,
      input.progress,
    );
  }

  const steps = route.steps ?? [];
  if (steps.length === 0) {
    return emptyGuidanceDirectionList(
      'summary_only',
      'No turn-by-turn directions available for this route',
      route,
      input.progress,
    );
  }

  const progress = input.progress ?? null;
  if (
    !progress ||
    progress.routeId !== route.id ||
    progress.rerouteGeneration !== route.rerouteGeneration
  ) {
    return emptyGuidanceDirectionList(
      'pending',
      'Directions will appear when route calculation completes',
      route,
      progress,
    );
  }

  const startIndex = clampGuidanceStepIndex(progress.currentStepIndex, steps.length);
  const items = steps.slice(startIndex).map((step, offset) => {
    const isCurrent = offset === 0;
    const kind: ActiveGuidanceDirectionKind = isEcsArrivalStep(step) ? 'arrival' : 'maneuver';
    const roadName = roadNameForStep(step);
    return {
      id: step.id || `${route.id}-${step.globalStepIndex}`,
      instruction: instructionForStep(step),
      detail: roadName,
      roadName,
      distanceM: finiteNumber(step.distanceMeters),
      durationS: finiteNumber(step.durationSeconds),
      kind,
      sequenceLabel: isCurrent ? 'NOW' : String(offset + 1),
      iconName: directionIconName(step.maneuverType, step.maneuverModifier),
      isCurrent,
      globalStepIndex: step.globalStepIndex,
    };
  });

  return {
    state: 'ready',
    items,
    emptyMessage: items.length > 0 ? null : 'No turn-by-turn directions available for this route',
    routeId: route.id,
    rerouteGeneration: route.rerouteGeneration,
    currentStepIndex: startIndex,
    guidanceMode: route.guidanceMode,
    sourceLabel: route.guidanceSourceLabel ?? null,
  };
}

export function buildActiveRoadDirectionList(
  input: BuildActiveRoadDirectionListInput,
): ActiveGuidanceDirectionItem[] {
  const steps = input.route?.steps ?? [];
  if (steps.length === 0) return [];

  const routeDistanceM = finiteNumber(input.route?.distanceM);
  const remainingDistanceM = finiteNumber(input.remainingDistanceM);
  const traveledDistanceM =
    routeDistanceM != null && remainingDistanceM != null
      ? Math.max(0, routeDistanceM - remainingDistanceM)
      : null;
  const startIndex = clampStepIndex(input.currentStepIndex, steps.length);

  return steps
    .slice(startIndex)
    .map((step, offset) => {
      const instruction = step.instruction.trim();
      if (!instruction) return null;
      const distanceM = distanceToStep(step, offset, input, traveledDistanceM);
      const kind: ActiveGuidanceDirectionKind = isArrivalStep(step) ? 'arrival' : 'maneuver';
      const item: ActiveGuidanceDirectionItem = {
        id: step.id || `${startIndex + offset}-${instruction}`,
        instruction,
        detail: step.roadName?.trim() || null,
        distanceM,
        durationS: finiteNumber(step.durationS),
        kind,
        sequenceLabel: offset === 0 ? 'NEXT' : String(offset + 1),
      };
      return item;
    })
    .filter((item): item is ActiveGuidanceDirectionItem => item != null);
}

export function buildFallbackActiveDirectionList(
  input: BuildFallbackActiveDirectionListInput,
): ActiveGuidanceDirectionItem[] {
  const instruction = input.instruction?.trim();
  if (!instruction) return [];
  return [
    {
      id: `active-status-${instruction.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`,
      instruction,
      detail: input.detail?.trim() || null,
      distanceM: finiteNumber(input.distanceM),
      durationS: null,
      kind: 'status',
      sequenceLabel: 'NEXT',
    },
  ];
}
