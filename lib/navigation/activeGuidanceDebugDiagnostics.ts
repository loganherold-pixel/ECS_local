import type {
  EcsActiveGuidanceOffRouteStatus,
  EcsActiveGuidanceProgress,
} from './ecsActiveGuidanceController';
import type { EcsGuidanceMode, EcsGuidanceRoute, EcsGuidanceRouteSource } from './ecsGuidanceModel';

export interface ActiveGuidanceDebugDiagnostics {
  devOnly: true;
  guidanceMode: EcsGuidanceMode | null;
  routeId: string | null;
  routeUuid: string | null;
  rerouteGeneration: number | null;
  routeSource: EcsGuidanceRouteSource | null;
  legCount: number;
  stepCount: number;
  currentStepIndex: number | null;
  currentInstruction: string | null;
  distanceToNextManeuverMeters: number | null;
  distanceFromRouteMeters: number | null;
  offRouteStatus: EcsActiveGuidanceOffRouteStatus | null;
  rerouteStatus: EcsActiveGuidanceOffRouteStatus | null;
  lastRouteParseError: string | null;
}

export interface BuildActiveGuidanceDebugDiagnosticsInput {
  route?: EcsGuidanceRoute | null;
  progress?: EcsActiveGuidanceProgress | null;
  rerouteStatus?: EcsActiveGuidanceOffRouteStatus | null;
  lastRouteParseError?: string | null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cleanString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isActiveGuidanceDebugDiagnosticsEnabled(): boolean {
  const globalFlags = globalThis as typeof globalThis & {
    __DEV__?: boolean;
    __ECS_DEBUG_ACTIVE_GUIDANCE__?: boolean;
  };
  const env = typeof process !== 'undefined' ? process.env : undefined;

  return (
    globalFlags.__DEV__ === true ||
    globalFlags.__ECS_DEBUG_ACTIVE_GUIDANCE__ === true ||
    env?.ECS_DEBUG_ACTIVE_GUIDANCE === '1' ||
    env?.EXPO_PUBLIC_ECS_ACTIVE_GUIDANCE_DEBUG === '1'
  );
}

export function buildActiveGuidanceDebugDiagnostics(
  input: BuildActiveGuidanceDebugDiagnosticsInput,
): ActiveGuidanceDebugDiagnostics | null {
  if (!isActiveGuidanceDebugDiagnosticsEnabled()) return null;

  const route = input.route ?? null;
  const progress = input.progress ?? null;

  return {
    devOnly: true,
    guidanceMode: route?.guidanceMode ?? null,
    routeId: cleanString(route?.id) ?? null,
    routeUuid: cleanString(route?.routeUuid) ?? null,
    rerouteGeneration:
      finiteNumber(route?.rerouteGeneration) ?? finiteNumber(progress?.rerouteGeneration),
    routeSource: route?.source ?? null,
    legCount: Array.isArray(route?.legs) ? route.legs.length : 0,
    stepCount: Array.isArray(route?.steps) ? route.steps.length : 0,
    currentStepIndex: finiteNumber(progress?.currentStepIndex),
    currentInstruction: cleanString(progress?.currentInstruction),
    distanceToNextManeuverMeters: finiteNumber(progress?.distanceToNextManeuverMeters),
    distanceFromRouteMeters: finiteNumber(progress?.distanceFromRouteMeters),
    offRouteStatus: progress?.offRouteStatus ?? null,
    rerouteStatus: input.rerouteStatus ?? null,
    lastRouteParseError: cleanString(input.lastRouteParseError),
  };
}
