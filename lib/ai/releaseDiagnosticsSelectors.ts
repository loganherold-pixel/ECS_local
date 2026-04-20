import type {
  ECSOrchestratorOutput,
  ECSReleaseReadinessDiagnostics,
} from './orchestratorTypes';

export function selectReleaseReadinessDiagnostics(
  output: ECSOrchestratorOutput | null | undefined,
): ECSReleaseReadinessDiagnostics | null {
  return output?.releaseDiagnostics ?? null;
}
