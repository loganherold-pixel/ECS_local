import type {
  ECSOrchestratorOutput,
  ECSReleaseReadinessDiagnostics,
} from './orchestratorTypes';
import type { ECSReleaseQaSummary } from './releasePolishAuditTypes';

export function selectReleaseReadinessDiagnostics(
  output: ECSOrchestratorOutput | null | undefined,
): ECSReleaseReadinessDiagnostics | null {
  return output?.releaseDiagnostics ?? null;
}

export function selectReleaseQaSummary(
  output: ECSOrchestratorOutput | null | undefined,
): ECSReleaseQaSummary | null {
  return output?.releaseDiagnostics?.qaSummary ?? null;
}
