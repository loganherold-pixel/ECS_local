import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  runECSAI,
  createInitialAIOrchestratorMemory,
  DEFAULT_AI_ORCHESTRATOR_OPTIONS,
  type ECSAIActivationInput,
  type ECSAIOrchestratorMemory,
  type ECSAIOrchestratorOptions,
  type ECSAIState,
} from './aiOrchestrator';
import {
  selectOrchestratorTargetView,
  type ECSOrchestratorTargetView,
} from './orchestratorSelectors';
import { operatorTrustModeStore } from './operatorTrustMode';
import { runtimeSmokeStore } from './runtimeSmokeStore';
import {
  buildReadinessExplanationPayload,
  type ECSReadinessExplanationPayload,
} from './readinessExplanationGuardrails';
import type {
  ECSCommandStateDiagnostics,
  ECSOrchestratorOutput,
  ECSReleaseReadinessDiagnostics,
} from './orchestratorTypes';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import {
  useActiveReadinessAlert,
  useCurrentExpeditionReadiness,
} from '../readiness/expeditionReadinessSelectors';

export type UseECSAIArgs = ECSAIActivationInput & {
  enabled?: boolean;
  options?: Partial<ECSAIOrchestratorOptions>;
};

export type UseECSAIResult = {
  aiState: ECSAIState | null;
  isAIActive: boolean;
  orchestrator: ECSOrchestratorOutput | null;
  dashboardView: ECSOrchestratorTargetView;
  navigateView: ECSOrchestratorTargetView;
  exploreView: ECSOrchestratorTargetView;
  alertView: ECSOrchestratorTargetView;
  fleetView: ECSOrchestratorTargetView;
  briefView: ECSOrchestratorTargetView;
  commandStateDiagnostics: ECSCommandStateDiagnostics | null;
  releaseReadinessDiagnostics: ECSReleaseReadinessDiagnostics | null;
  liveStatus: ECSLiveStatusMap | null;
  readinessExplanation: ECSReadinessExplanationPayload | null;
  summaryLine: string;
  compactLine: string;
  topSignalTitle: string | null;
  powerConfidence: number;
  refreshAI: () => void;
};

function safeStableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (input == null) return input;

    if (typeof input === 'number') {
      if (Number.isNaN(input)) return '__NaN__';
      if (!Number.isFinite(input)) return input > 0 ? '__Infinity__' : '__-Infinity__';
      return input;
    }

    if (
      typeof input === 'string' ||
      typeof input === 'boolean'
    ) {
      return input;
    }

    if (typeof input === 'function') {
      return `__function__:${input.name || 'anonymous'}`;
    }

    if (input instanceof Date) {
      return `__date__:${input.toISOString()}`;
    }

    if (Array.isArray(input)) {
      return input.map(normalize);
    }

    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;

      if (seen.has(obj)) {
        return '__circular__';
      }
      seen.add(obj);

      const keys = Object.keys(obj).sort();
      const output: Record<string, unknown> = {};
      for (const key of keys) {
        output[key] = normalize(obj[key]);
      }
      return output;
    }

    return String(input);
  };

  try {
    return JSON.stringify(normalize(value));
  } catch {
    return '__unserializable__';
  }
}

export function useECSAI(args: UseECSAIArgs): UseECSAIResult {
  const {
    enabled = true,
    options,
    ...input
  } = args;

  const memoryRef = useRef<ECSAIOrchestratorMemory>(
    createInitialAIOrchestratorMemory(),
  );

  const runIdRef = useRef(0);
  const [aiState, setAIState] = useState<ECSAIState | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [operatorTrustMode, setOperatorTrustMode] = useState(
    () => operatorTrustModeStore.mode,
  );
  const expeditionReadiness = useCurrentExpeditionReadiness();
  const activeReadinessAlert = useActiveReadinessAlert();
  const readinessExplanation = useMemo(
    () => expeditionReadiness ? buildReadinessExplanationPayload(expeditionReadiness) : null,
    [expeditionReadiness],
  );

  useEffect(() => {
    return operatorTrustModeStore.subscribe((nextMode) => {
      setOperatorTrustMode((currentMode) => currentMode === nextMode ? currentMode : nextMode);
    });
  }, []);

  const mergedOptions = useMemo(
    () => ({
      ...DEFAULT_AI_ORCHESTRATOR_OPTIONS,
      ...(options ?? {}),
      signalOptions: {
        ...DEFAULT_AI_ORCHESTRATOR_OPTIONS.signalOptions,
        ...(options?.signalOptions ?? {}),
      },
    }),
    [options],
  );

  const refreshAI = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  const mergedOptionsSignature = useMemo(
    () => safeStableStringify(mergedOptions),
    [mergedOptions],
  );

  const inputSignature = useMemo(
    () =>
      safeStableStringify({
        activeRun: input.activeRun,
        vehicleConfig: input.vehicleConfig,
        telemetry: input.telemetry,
        weatherCorridor: input.weatherCorridor,
        routeIntelligence: input.routeIntelligence,
        remoteness: input.remoteness,
        resources: input.resources,
        userPreferences: input.userPreferences,
        powerAuthority: input.powerAuthority,
        expeditionReadiness,
      }),
    [
      input.activeRun,
      input.vehicleConfig,
      input.telemetry,
      input.weatherCorridor,
      input.routeIntelligence,
      input.remoteness,
      input.resources,
      input.userPreferences,
      input.powerAuthority,
      expeditionReadiness,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const runId = ++runIdRef.current;

    if (!enabled) {
      setAIState((prev) => (prev === null ? prev : null));
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const result = await runECSAI(
          {
            ...input,
            expeditionReadiness,
            previousAIState: memoryRef.current.lastState,
          },
          memoryRef.current,
          mergedOptions,
        );

        if (cancelled || runId !== runIdRef.current) return;

        memoryRef.current = result.memory;

        setAIState((prev) => {
          const prevSignature = safeStableStringify(prev);
          const nextSignature = safeStableStringify(result.state);
          return prevSignature === nextSignature ? prev : result.state;
        });
      } catch (error) {
        if (cancelled || runId !== runIdRef.current) return;
        console.warn('[useECSAI] Failed to run ECS AI:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Signature strings intentionally gate reruns more narrowly than raw object references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    refreshTick,
    operatorTrustMode,
    mergedOptionsSignature,
    inputSignature,
  ]);

  useEffect(() => {
    runtimeSmokeStore.updateCommand({
      activePhase: aiState?.orchestrator?.activePhase ?? null,
      primaryTitle: aiState?.orchestrator?.primary?.title ?? null,
      primarySummary: aiState?.orchestrator?.primary?.summary ?? null,
      primaryRootKey: aiState?.orchestrator?.primary?.rootCondition?.key ?? null,
      secondaryTitles: (aiState?.orchestrator?.secondary ?? []).map((candidate) => candidate.title),
      suppressedTitles: (aiState?.orchestrator?.suppressed ?? []).map((candidate) => candidate.title),
      commandDiagnostics: aiState?.orchestrator?.qaDiagnostics ?? null,
      releaseDiagnostics: aiState?.orchestrator?.releaseDiagnostics ?? null,
      liveStatus: aiState?.liveStatus ?? null,
      expeditionReadiness,
      activeReadinessAlert,
      readinessExplanation,
      aiSummary: aiState?.summaryLine ?? aiState?.orchestrator?.primary?.summary ?? readinessExplanation?.groundedSummary ?? null,
    });
  }, [activeReadinessAlert, aiState, expeditionReadiness, readinessExplanation]);

  return {
    aiState,
    isAIActive: aiState?.active ?? false,
    orchestrator: aiState?.orchestrator ?? null,
    dashboardView: selectOrchestratorTargetView(aiState?.orchestrator, 'dashboard'),
    navigateView: selectOrchestratorTargetView(aiState?.orchestrator, 'navigate'),
    exploreView: selectOrchestratorTargetView(aiState?.orchestrator, 'explore'),
    alertView: selectOrchestratorTargetView(aiState?.orchestrator, 'alert'),
    fleetView: selectOrchestratorTargetView(aiState?.orchestrator, 'fleet'),
    briefView: selectOrchestratorTargetView(aiState?.orchestrator, 'brief'),
    commandStateDiagnostics: aiState?.orchestrator?.qaDiagnostics ?? null,
    releaseReadinessDiagnostics: aiState?.orchestrator?.releaseDiagnostics ?? null,
    liveStatus: aiState?.liveStatus ?? null,
    readinessExplanation,
    summaryLine: aiState?.summaryLine ?? 'ECS Intelligence offline.',
    compactLine: aiState?.compactLine ?? 'ECS INTEL STANDBY',
    topSignalTitle: aiState?.orchestrator?.primary?.title ?? aiState?.topSignal?.title ?? null,
    powerConfidence: aiState?.powerConfidence ?? 0,
    refreshAI,
  };
}

export default useECSAI;
