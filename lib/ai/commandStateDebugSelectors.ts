import type {
  ECSCommandStateDiagnostics,
  ECSCommandStateRootSnapshot,
  ECSOrchestratorOutput,
  ECSReleaseReadinessDiagnostics,
} from './orchestratorTypes';
import type { ECSReleaseChecklistSection, ECSReleaseQaSummary, ECSReleaseRiskSummary } from './releasePolishAuditTypes';
export {
  selectRuntimeSmokeContradictions,
  selectRuntimeSmokeSnapshot,
  selectRuntimeSmokeState,
} from './runtimeSmokeSelectors';

export function selectCommandStateDiagnostics(
  output: ECSOrchestratorOutput | null | undefined,
): ECSCommandStateDiagnostics | null {
  return output?.qaDiagnostics ?? null;
}

export function selectCommandStateRootSnapshots(
  output: ECSOrchestratorOutput | null | undefined,
): ECSCommandStateRootSnapshot[] {
  return output?.qaDiagnostics?.rootSnapshots ?? [];
}

export function selectCommandStateViolations(
  output: ECSOrchestratorOutput | null | undefined,
) {
  return output?.qaDiagnostics?.invariantViolations ?? [];
}

export function selectReleaseReadinessDiagnostics(
  output: ECSOrchestratorOutput | null | undefined,
): ECSReleaseReadinessDiagnostics | null {
  return output?.releaseDiagnostics ?? null;
}

export function selectMasterReleaseChecklist(
  output: ECSOrchestratorOutput | null | undefined,
): ECSReleaseChecklistSection[] {
  return output?.releaseDiagnostics?.masterChecklist ?? [];
}

export function selectReleaseRiskSummary(
  output: ECSOrchestratorOutput | null | undefined,
): ECSReleaseRiskSummary | null {
  return output?.releaseDiagnostics?.unresolvedRiskSummary ?? null;
}

export function selectReleaseQaSummary(
  output: ECSOrchestratorOutput | null | undefined,
): ECSReleaseQaSummary | null {
  return output?.releaseDiagnostics?.qaSummary ?? null;
}
