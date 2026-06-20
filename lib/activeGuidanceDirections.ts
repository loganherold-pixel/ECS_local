import type { RoadNavRoute, RoadNavStep } from './mapboxRoadNavigation';

export type ActiveGuidanceDirectionKind = 'maneuver' | 'arrival' | 'status';

export interface ActiveGuidanceDirectionItem {
  id: string;
  instruction: string;
  detail: string | null;
  distanceM: number | null;
  durationS: number | null;
  kind: ActiveGuidanceDirectionKind;
  sequenceLabel: string;
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

function clampStepIndex(index: number | null | undefined, stepCount: number): number {
  const normalized = finiteNumber(index) ?? 0;
  if (stepCount <= 1) return 0;
  return Math.max(0, Math.min(stepCount - 1, Math.floor(normalized) + 1));
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
