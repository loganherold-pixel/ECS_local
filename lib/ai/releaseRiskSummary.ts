import type {
  ECSCommandStateDiagnostics,
  ECSReleaseReadinessIssue,
} from './orchestratorTypes';
import type { ECSReleaseRiskSummary } from './releasePolishAuditTypes';

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function summarizeIssue(issue: ECSReleaseReadinessIssue): string {
  return issue.message;
}

export function buildReleaseRiskSummary(args: {
  issues: ECSReleaseReadinessIssue[];
  commandDiagnostics: ECSCommandStateDiagnostics | null;
}): ECSReleaseRiskSummary {
  const { issues, commandDiagnostics } = args;
  const mustFix: string[] = [];
  const shouldFix: string[] = [];
  const safeToDefer: string[] = [];

  issues.forEach((issue) => {
    const summary = summarizeIssue(issue);
    if (issue.severity === 'error') {
      mustFix.push(summary);
      return;
    }

    switch (issue.code) {
      case 'offline_capable_conflict':
      case 'minimal_mode_noise':
      case 'planning_phase_ownership_gap':
      case 'stale_signal_churn':
      case 'missing_lead_target':
        shouldFix.push(summary);
        break;
      case 'cross_tab_warning_cluster':
        safeToDefer.push(summary);
        break;
      default:
        shouldFix.push(summary);
        break;
    }
  });

  const infoViolations =
    commandDiagnostics?.invariantViolations.filter((violation) => violation.severity === 'info') ?? [];
  if (infoViolations.length >= 2) {
    safeToDefer.push(
      `${infoViolations.length} low-severity wording or rationale duplication signals remain visible in diagnostics.`,
    );
  }

  const staleSignals = commandDiagnostics?.staleSignals.length ?? 0;
  if (staleSignals >= 6) {
    shouldFix.push(
      `Stale-state suppression is still catching ${staleSignals} signals, so refresh churn may feel elevated in edge cases.`,
    );
  } else if (staleSignals > 0) {
    safeToDefer.push(
      `Some stale-signal cleanup is still active (${staleSignals}), but the current suppression layer is containing it.`,
    );
  }

  if (mustFix.length === 0 && shouldFix.length === 0 && safeToDefer.length === 0) {
    safeToDefer.push('No significant unresolved release-polish risks were detected in the current diagnostics snapshot.');
  }

  return {
    mustFix: dedupe(mustFix),
    shouldFix: dedupe(shouldFix),
    safeToDefer: dedupe(safeToDefer),
  };
}
