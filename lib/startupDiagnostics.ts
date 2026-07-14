import {
  incrementECSPerformanceCounter,
  startECSPerformanceSpan,
  type ECSPerformanceSpanHandle,
} from './performance/ecsPerformanceDiagnostics';
import { ecsLog } from './ecsLogger';

export type StartupPhase =
  | 'stores_hydration_start'
  | 'stores_hydration_done'
  | 'auth_restore_start'
  | 'auth_restore_done'
  | 'setup_status_known'
  | 'initial_route_chosen'
  | 'optional_services_started'
  | 'app_rendered_main'
  | 'app_rendered_sign_in'
  | 'app_rendered_setup'
  | 'post_auth_handoff_fallback_route'
  | 'startup_recovery_fallback';

type StartupPhaseEntry = {
  phase: StartupPhase;
  at: number;
  details?: Record<string, unknown>;
};

type StartupStallReport = {
  currentPhase: StartupPhase | 'not_started';
  unresolvedRequiredFlags: string[];
  optionalServicesPending: string[];
  fallback: string;
  details?: Record<string, unknown>;
};

const MAX_STARTUP_PHASE_ENTRIES = 80;
const phaseEntries: StartupPhaseEntry[] = [];
let currentPhase: StartupPhase | 'not_started' = 'not_started';
let lastStallSignature: string | null = null;
let startupTerminalRecorded = false;
let authHandoffSpan: ECSPerformanceSpanHandle | null = null;
const coldStartupSpan = startECSPerformanceSpan('cold_startup_shell', 'startup_to_usable_shell', {
  trackOutstanding: true,
});
const warmStartupSpan = startECSPerformanceSpan('warm_startup_restore', 'startup_route_restoration', {
  trackOutstanding: true,
});
let startupEntryKind: string | null = null;

function readStartupDebugValue(key: string): unknown {
  try {
    const globalStore = globalThis as unknown as Record<string, unknown>;
    const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
      .process?.env;
    return globalStore[key] ??
      globalStore[`__${key}`] ??
      processEnv?.[key] ??
      processEnv?.[`EXPO_PUBLIC_${key}`];
  } catch {
    return undefined;
  }
}

function isTruthyStartupDebugValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isStartupDebugEnabled(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    (
      isTruthyStartupDebugValue(readStartupDebugValue('ECS_DEBUG_STARTUP')) ||
      isTruthyStartupDebugValue(readStartupDebugValue('ECS_STARTUP_DEBUG'))
    )
  );
}

export function markStartupPhase(
  phase: StartupPhase,
  details?: Record<string, unknown>,
): void {
  currentPhase = phase;
  phaseEntries.push({
    phase,
    at: Date.now(),
    details,
  });
  if (phaseEntries.length > MAX_STARTUP_PHASE_ENTRIES) {
    phaseEntries.splice(0, phaseEntries.length - MAX_STARTUP_PHASE_ENTRIES);
  }
  incrementECSPerformanceCounter('cold_startup_shell', `phase_${phase}`);
  ecsLog.breadcrumb({
    domain: 'startup',
    operation: 'phase_transition',
    code: `STARTUP_${phase}`,
    status: phase === 'startup_recovery_fallback' ? 'failed' : 'completed',
    context: details,
  });

  if (phase === 'auth_restore_start' && !authHandoffSpan) {
    authHandoffSpan = startECSPerformanceSpan('auth_setup_handoff', 'auth_restore_to_entry', {
      trackOutstanding: true,
    });
  }
  if (phase === 'initial_route_chosen' && typeof details?.entryKind === 'string') {
    startupEntryKind = details.entryKind;
  }
  if (
    !startupTerminalRecorded &&
    (phase === 'app_rendered_main' || phase === 'app_rendered_sign_in' || phase === 'app_rendered_setup')
  ) {
    startupTerminalRecorded = true;
    const terminal = phase === 'app_rendered_main' ? 'main' : phase === 'app_rendered_setup' ? 'setup' : 'sign_in';
    coldStartupSpan.end('completed', { terminal, entryKind: startupEntryKind });
    authHandoffSpan?.end('completed', { terminal, entryKind: startupEntryKind });
    authHandoffSpan = null;
    if (startupEntryKind === 'authenticated_restore' || startupEntryKind === 'offline_restore') {
      warmStartupSpan.end('completed', { terminal, entryKind: startupEntryKind });
    } else {
      warmStartupSpan.cancel({ terminal, entryKind: startupEntryKind });
    }
  }
  if (phase === 'startup_recovery_fallback' && !startupTerminalRecorded) {
    coldStartupSpan.end('failed', { fallback: true });
    warmStartupSpan.end('failed', { fallback: true });
    authHandoffSpan?.end('failed', { fallback: true });
    authHandoffSpan = null;
  }

  if (!isStartupDebugEnabled()) return;
  ecsLog.dev('SHELL', 'startup_phase', {
    phase,
    details: details ?? null,
  }, {
    tag: '[ECS_STARTUP]',
    debugFlag: 'ECS_DEBUG_STARTUP',
    fingerprint: phase,
    throttleMs: 250,
  });
}

export function getStartupDiagnosticsSnapshot(): {
  currentPhase: StartupPhase | 'not_started';
  transitions: StartupPhaseEntry[];
} {
  return {
    currentPhase,
    transitions: [...phaseEntries],
  };
}

export function logStartupStall(report: StartupStallReport): void {
  const signature = JSON.stringify({
    currentPhase: report.currentPhase,
    unresolvedRequiredFlags: report.unresolvedRequiredFlags,
    optionalServicesPending: report.optionalServicesPending,
    fallback: report.fallback,
  });
  if (lastStallSignature === signature) return;
  lastStallSignature = signature;

  const payload = {
    currentPhase: report.currentPhase,
    unresolvedRequiredFlags: report.unresolvedRequiredFlags,
    optionalServicesPending: report.optionalServicesPending,
    fallback: report.fallback,
    details: report.details ?? null,
  };

  ecsLog.captureFailure({
    kind: 'timeout',
    domain: 'startup',
    operation: 'loading_stall',
    code: 'STARTUP_LOADING_STALL',
    sourceState: 'unavailable',
    context: isStartupDebugEnabled()
      ? payload
      : {
          currentPhase: payload.currentPhase,
          unresolvedRequiredFlags: payload.unresolvedRequiredFlags,
          fallback: payload.fallback,
        },
  }, undefined, {
    category: 'SHELL',
    fingerprint: signature,
  });
}
