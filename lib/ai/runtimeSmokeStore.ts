import { reportDegradedState, reportRecoverableFailure } from '../ecsIssueIntelligence';
import type {
  ECSRuntimeContradiction,
  ECSDispersedCampingRuntimeSmokeSnapshot,
  ECSRuntimeSmokeCommandInput,
  ECSRuntimeSmokeCommandSnapshot,
  ECSRuntimeSmokeShellInput,
  ECSRuntimeSmokeShellSnapshot,
  ECSRuntimeSmokeState,
} from './runtimeContradictionTypes';
import { buildRuntimeSmokeMarkers, detectRuntimeContradictions } from './runtimeSmokeChecks';

type Listener = () => void;

const listeners = new Set<Listener>();

let shellSnapshot: ECSRuntimeSmokeShellSnapshot | null = null;
let commandSnapshot: ECSRuntimeSmokeCommandSnapshot | null = null;
let dispersedCampingSnapshot: ECSDispersedCampingRuntimeSmokeSnapshot | null = null;

let state: ECSRuntimeSmokeState = {
  capturedAt: 0,
  enabled: false,
  shell: null,
  command: null,
  markers: [],
  contradictions: [],
  lastLoggedKeys: [],
};

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function normalizeShellSnapshot(input: ECSRuntimeSmokeShellInput): ECSRuntimeSmokeShellSnapshot {
  return {
    ...input,
    capturedAt: Date.now(),
  };
}

function normalizeCommandSnapshot(input: ECSRuntimeSmokeCommandInput): ECSRuntimeSmokeCommandSnapshot {
  return {
    capturedAt: Date.now(),
    activePhase: input.activePhase ?? null,
    primaryTitle: input.primaryTitle ?? null,
    primarySummary: input.primarySummary ?? null,
    primaryRootKey: input.primaryRootKey ?? null,
    secondaryTitles: input.secondaryTitles,
    suppressedTitles: input.suppressedTitles,
    leadByTarget: input.commandDiagnostics?.leadByTarget ?? {},
    rootCount: input.commandDiagnostics?.rootSnapshots.length ?? 0,
    staleSignals: input.commandDiagnostics?.staleSignals ?? [],
    invariantViolations: input.commandDiagnostics?.invariantViolations ?? [],
    releaseDiagnostics: input.releaseDiagnostics
      ? {
          overallStatus: input.releaseDiagnostics.overallStatus,
          issues: input.releaseDiagnostics.issues,
          issueCounts: input.releaseDiagnostics.issueCounts,
        }
      : null,
    liveStatus: {
      overall: input.liveStatus?.overall ?? null,
      route: input.liveStatus?.route ?? null,
      weather: input.liveStatus?.weather ?? null,
      telemetry: input.liveStatus?.telemetry ?? null,
      resources: input.liveStatus?.resources ?? null,
      readiness: input.liveStatus?.readiness ?? null,
    },
    expeditionReadiness: input.expeditionReadiness ?? null,
    activeReadinessAlert: input.activeReadinessAlert ?? null,
    readinessExplanation: input.readinessExplanation ?? null,
    aiSummary: input.aiSummary ?? input.primarySummary ?? null,
    dispersedCamping: input.dispersedCamping ?? null,
  };
}

function contradictionKey(contradiction: ECSRuntimeContradiction): string {
  return [
    contradiction.code,
    contradiction.rootKey ?? '',
    contradiction.message,
  ].join(':');
}

function logContradictions(contradictions: ECSRuntimeContradiction[]): void {
  contradictions.forEach((contradiction) => {
    const reporter =
      contradiction.code === 'offline_capable_mislabeled'
      || contradiction.code === 'provider_state_mismatch'
      || contradiction.code === 'stale_command_lingering'
        ? reportDegradedState
        : reportRecoverableFailure;

    const issueTitle =
      contradiction.code === 'shell_restore_mismatch'
        ? 'Shell restore mismatch'
        : contradiction.code === 'route_restore_mismatch'
          ? 'Route restore timing mismatch'
          : contradiction.code === 'valid_access_gated'
            ? 'Access-state contradiction'
            : contradiction.code === 'offline_capable_mislabeled'
              ? 'Offline-capable label mismatch'
              : contradiction.code === 'stale_command_lingering'
                ? 'Stale-state drift'
              : contradiction.code.includes('readiness')
                ? 'Expedition readiness contradiction'
                : contradiction.code.includes('dispersed_camping')
                  ? 'Dispersed camping eligibility contradiction'
                  : 'Command-state contradiction';

    reporter({
      severity:
        contradiction.severity === 'error'
          ? 'high'
          : contradiction.severity === 'warning'
            ? 'medium'
            : 'low',
      issueTitle,
      ecsArea: contradiction.code.includes('access') || contradiction.code.includes('restore')
        ? 'app_shell'
        : contradiction.code.includes('provider')
          ? 'bluetooth_telemetry'
          : contradiction.code.includes('explore')
            ? 'explore'
            : contradiction.code.includes('fleet')
              ? 'fleet'
              : contradiction.code.includes('offline')
                ? 'offline'
          : contradiction.code.includes('readiness')
            ? 'dashboard'
            : contradiction.code.includes('dispersed_camping')
              ? 'navigate'
            : contradiction.code.includes('severity')
              ? 'alert'
              : 'dashboard',
      message: contradiction.message,
      signature: `runtime_smoke:${contradictionKey(contradiction)}`,
      metadata: {
        smokeMode: true,
        contradictionCode: contradiction.code,
        detail: contradiction.detail ?? null,
        rootKey: contradiction.rootKey ?? null,
      },
    });
  });
}

function recomputeState(): void {
  const enabled = Boolean(shellSnapshot?.enabled || (__DEV__ && (shellSnapshot || commandSnapshot)));
  const commandForSmoke = commandSnapshot
    ? {
        ...commandSnapshot,
        dispersedCamping: dispersedCampingSnapshot ?? commandSnapshot.dispersedCamping,
      }
    : null;
  const contradictions = detectRuntimeContradictions({
    shell: shellSnapshot,
    command: commandForSmoke,
  });
  const markers = buildRuntimeSmokeMarkers({
    shell: shellSnapshot,
    command: commandForSmoke,
  });

  const nextState: ECSRuntimeSmokeState = {
    capturedAt: Date.now(),
    enabled,
    shell: shellSnapshot,
    command: commandForSmoke,
    markers,
    contradictions,
    lastLoggedKeys: state.lastLoggedKeys,
  };

  const previousKeys = new Set(state.lastLoggedKeys);
  const contradictionKeys = contradictions.map(contradictionKey);
  const newContradictions = contradictions.filter((contradiction) => !previousKeys.has(contradictionKey(contradiction)));

  state = {
    ...nextState,
    lastLoggedKeys: contradictionKeys,
  };

  if (enabled && newContradictions.length > 0) {
    logContradictions(newContradictions);
  }

  emitChange();
}

export const runtimeSmokeStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): ECSRuntimeSmokeState {
    return state;
  },

  updateShell(input: ECSRuntimeSmokeShellInput): void {
    shellSnapshot = normalizeShellSnapshot(input);
    recomputeState();
  },

  updateCommand(input: ECSRuntimeSmokeCommandInput): void {
    commandSnapshot = normalizeCommandSnapshot(input);
    recomputeState();
  },

  updateDispersedCamping(input: ECSDispersedCampingRuntimeSmokeSnapshot | null): void {
    dispersedCampingSnapshot = input;
    recomputeState();
  },
};
