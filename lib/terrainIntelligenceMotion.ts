export type TerrainMotionDiagnosticCounter =
  | 'compactWidgetRenders'
  | 'expandedHudRenders'
  | 'profileComputations'
  | 'pathGenerations'
  | 'progressUpdates'
  | 'coalescedProgressUpdates'
  | 'expansions'
  | 'collapses';

export type TerrainMotionDiagnosticsSnapshot = Record<TerrainMotionDiagnosticCounter, number> & {
  lastExpansionLatencyMs: number | null;
  lastScrubResponseMs: number | null;
};

const EMPTY_DIAGNOSTICS: TerrainMotionDiagnosticsSnapshot = {
  compactWidgetRenders: 0,
  expandedHudRenders: 0,
  profileComputations: 0,
  pathGenerations: 0,
  progressUpdates: 0,
  coalescedProgressUpdates: 0,
  expansions: 0,
  collapses: 0,
  lastExpansionLatencyMs: null,
  lastScrubResponseMs: null,
};

let diagnostics = { ...EMPTY_DIAGNOSTICS };
const revealedProfileKeys = new Set<string>();
const pulsedRiskKeys = new Set<string>();

function diagnosticsEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function incrementTerrainMotionDiagnostic(counter: TerrainMotionDiagnosticCounter): void {
  if (!diagnosticsEnabled()) return;
  diagnostics[counter] += 1;
}

export function recordTerrainExpansionLatency(durationMs: number): void {
  if (!diagnosticsEnabled() || !Number.isFinite(durationMs)) return;
  diagnostics.lastExpansionLatencyMs = Math.max(0, Math.round(durationMs * 10) / 10);
}

export function recordTerrainScrubResponse(durationMs: number): void {
  if (!diagnosticsEnabled() || !Number.isFinite(durationMs)) return;
  diagnostics.lastScrubResponseMs = Math.max(0, Math.round(durationMs * 10) / 10);
}

export function getTerrainMotionDiagnostics(): TerrainMotionDiagnosticsSnapshot {
  return { ...diagnostics };
}

export function resetTerrainMotionDiagnostics(): void {
  diagnostics = { ...EMPTY_DIAGNOSTICS };
  revealedProfileKeys.clear();
  pulsedRiskKeys.clear();
}

function consumeBoundedKey(cache: Set<string>, key: string): boolean {
  if (cache.has(key)) return false;
  cache.add(key);
  if (cache.size > 32) cache.delete(cache.values().next().value as string);
  return true;
}

export function consumeTerrainProfileReveal(profileKey: string): boolean {
  return Boolean(profileKey) && consumeBoundedKey(revealedProfileKeys, profileKey);
}

export function consumeTerrainRiskPulse(riskKey: string): boolean {
  return Boolean(riskKey) && consumeBoundedKey(pulsedRiskKeys, riskKey);
}

export type TerrainVisualProgressState = {
  acceptedDistanceMiles: number | null;
  acceptedAtMs: number | null;
};

export type TerrainVisualProgressDecision = TerrainVisualProgressState & {
  accepted: boolean;
};

export const TERRAIN_VISUAL_PROGRESS_MIN_INTERVAL_MS = 220;

export function resolveTerrainVisualProgressUpdate(
  state: TerrainVisualProgressState,
  distanceMiles: number | null,
  sampledAtMs: number,
  force = false,
): TerrainVisualProgressDecision {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) {
    return {
      accepted: state.acceptedDistanceMiles !== null,
      acceptedDistanceMiles: null,
      acceptedAtMs: sampledAtMs,
    };
  }
  if (
    !force &&
    state.acceptedAtMs != null &&
    sampledAtMs - state.acceptedAtMs < TERRAIN_VISUAL_PROGRESS_MIN_INTERVAL_MS
  ) {
    return { ...state, accepted: false };
  }
  return {
    accepted: state.acceptedDistanceMiles !== distanceMiles,
    acceptedDistanceMiles: distanceMiles,
    acceptedAtMs: sampledAtMs,
  };
}

export function shouldAnimateTerrainRiskPulse(input: {
  profileKey: string;
  riskKey: string | null;
  freshness: string;
  state: string;
  alreadyAnimatedKey: string | null;
  motionAllowed: boolean;
}): boolean {
  if (!input.motionAllowed || !input.riskKey) return false;
  if (input.state !== 'ready' && input.state !== 'partial') return false;
  if (input.freshness === 'stale' || input.freshness === 'unavailable') return false;
  return `${input.profileKey}:${input.riskKey}` !== input.alreadyAnimatedKey;
}
