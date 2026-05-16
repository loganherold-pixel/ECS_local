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

const phaseEntries: StartupPhaseEntry[] = [];
let currentPhase: StartupPhase | 'not_started' = 'not_started';
let lastStallSignature: string | null = null;

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

  if (!isStartupDebugEnabled()) return;
  console.log('[ECS_STARTUP] phase', {
    phase,
    details: details ?? null,
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

  if (isStartupDebugEnabled()) {
    console.warn('[ECS_STARTUP] loading_stall_detected', payload);
  } else {
    console.warn('[ECS_STARTUP] loading_stall_detected', {
      currentPhase: payload.currentPhase,
      unresolvedRequiredFlags: payload.unresolvedRequiredFlags,
      fallback: payload.fallback,
    });
  }
}
