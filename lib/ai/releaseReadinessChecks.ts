import type { ECSAIContext } from '../aiContextBuilder';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import { selectOrchestratorTargetView } from './orchestratorSelectors';
import { ECS_RELEASE_READINESS_SCENARIOS } from './releaseScenarioMatrix';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';
import { buildMasterReleaseChecklist } from './masterReleaseChecklist';
import { buildReleaseRiskSummary } from './releaseRiskSummary';
import type {
  ECSCommandStateDiagnostics,
  ECSOrchestratorCandidate,
  ECSOrchestratorOutput,
  ECSOrchestratorUITarget,
  ECSReleaseReadinessDiagnostics,
  ECSReleaseReadinessIssue,
  ECSRootConditionFamily,
} from './orchestratorTypes';

type BuildReleaseReadinessDiagnosticsArgs = {
  output: ECSOrchestratorOutput;
  richContext: ECSAIContext | null;
  liveStatus: ECSLiveStatusMap | null | undefined;
  operatorTrustMode: ECSOperatorTrustMode;
  commandDiagnostics: ECSCommandStateDiagnostics | null;
};

const TARGETS: ECSOrchestratorUITarget[] = [
  'dashboard',
  'navigate',
  'explore',
  'alert',
  'fleet',
  'brief',
];

const ROUTE_CRITICAL_ROOTS = new Set<ECSRootConditionFamily>([
  'weather_route_exposure',
  'gps_guidance_degradation',
  'resource_margin_decline',
  'bailout_relevance',
  'route_risk_elevation',
]);

const PLANNING_ROOTS = new Set<ECSRootConditionFamily>([
  'mission_planning_readiness',
  'planning_recommendation',
  'vehicle_readiness_gap',
  'route_fit_limitation',
  'offline_capable_operation',
]);

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function priorityRank(candidate: ECSOrchestratorCandidate | null | undefined): number {
  return candidate?.priority?.rank ?? 1;
}

function pushIssue(
  issues: ECSReleaseReadinessIssue[],
  nextIssue: ECSReleaseReadinessIssue,
): void {
  const duplicate = issues.some((issue) => {
    return issue.code === nextIssue.code
      && issue.message === nextIssue.message
      && (issue.rootKey ?? null) === (nextIssue.rootKey ?? null);
  });
  if (!duplicate) {
    issues.push(nextIssue);
  }
}

export function buildReleaseReadinessDiagnostics(
  args: BuildReleaseReadinessDiagnosticsArgs,
): ECSReleaseReadinessDiagnostics {
  const { output, richContext, liveStatus, operatorTrustMode, commandDiagnostics } = args;
  const issues: ECSReleaseReadinessIssue[] = [];
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;

  if (commandDiagnostics) {
    const errorCount = commandDiagnostics.invariantViolations.filter((violation) => violation.severity === 'error').length;
    const warningCount = commandDiagnostics.invariantViolations.filter((violation) => violation.severity === 'warning').length;

    if (errorCount > 0) {
      pushIssue(issues, {
        code: 'cross_tab_blockers',
        severity: 'error',
        message: `${errorCount} cross-tab invariant blocker${errorCount === 1 ? '' : 's'} remain active in the command stack.`,
      });
    }

    if (warningCount >= 3) {
      pushIssue(issues, {
        code: 'cross_tab_warning_cluster',
        severity: 'warning',
        message: `${warningCount} cross-tab warning conditions are active and may still feel noisy before release.`,
      });
    }

    if (commandDiagnostics.staleSignals.length >= 3) {
      pushIssue(issues, {
        code: 'stale_signal_churn',
        severity: 'warning',
        message: `${commandDiagnostics.staleSignals.length} stale-signal suppressions were required, suggesting refresh churn remains elevated.`,
      });
    }

    commandDiagnostics.rootSnapshots.forEach((snapshot) => {
      if (!snapshot.leadTarget && snapshot.supportTargets.length >= 2) {
        pushIssue(issues, {
          code: 'missing_lead_target',
          severity: 'warning',
          message: 'A multi-surface root condition is present without a clear lead target.',
          rootKey: snapshot.key,
          targets: snapshot.supportTargets,
        });
      }
    });
  }

  const navigateView = selectOrchestratorTargetView(output, 'navigate');
  const alertView = selectOrchestratorTargetView(output, 'alert');
  const dashboardView = selectOrchestratorTargetView(output, 'dashboard');
  const fleetView = selectOrchestratorTargetView(output, 'fleet');
  const briefView = selectOrchestratorTargetView(output, 'brief');

  const activeCandidates = [
    output.primary ?? null,
    ...output.secondary,
    ...output.passive,
  ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);

  const severeRouteCandidate = activeCandidates.find((candidate) => {
    return !!candidate.rootCondition?.family
      && ROUTE_CRITICAL_ROOTS.has(candidate.rootCondition.family)
      && priorityRank(candidate) >= 4;
  }) ?? null;

  if (routeActive && severeRouteCandidate) {
    const navigateHasRouteLead = [
      navigateView.primary,
      ...navigateView.secondary,
      ...navigateView.passive,
    ].some((candidate) => candidate?.rootCondition?.key === severeRouteCandidate.rootCondition?.key);

    if (!navigateHasRouteLead) {
      pushIssue(issues, {
        code: 'route_lead_gap',
        severity: 'error',
        message: 'A severe route-critical issue exists without a matching Navigate expression.',
        rootKey: severeRouteCandidate.rootCondition?.key ?? null,
        targets: ['navigate', 'alert', 'dashboard'],
      });
    }
  }

  if (
    output.activePhase &&
    PLANNING_ROOTS.has(dashboardView.primary?.rootCondition?.family as ECSRootConditionFamily)
    && fleetView.primary?.rootCondition?.family
    && !PLANNING_ROOTS.has(fleetView.primary.rootCondition.family)
    && (output.activePhase === 'vehicle_setup' || output.activePhase === 'staging')
  ) {
    pushIssue(issues, {
      code: 'planning_phase_ownership_gap',
      severity: 'warning',
      message: 'Planning-focused command state is present, but Fleet is not owning the readiness posture during a planning phase.',
      targets: ['fleet', 'dashboard', 'brief'],
    });
  }

  const readinessText = normalizeText([
    dashboardView.primary?.summary,
    briefView.primary?.summary,
    navigateView.primary?.summary,
  ].filter(Boolean).join(' '));

  if (
    liveStatus?.readiness?.status === 'offline_capable'
    && /(offline failure|service required|not available offline|unavailable offline)/i.test(readinessText)
  ) {
    pushIssue(issues, {
      code: 'offline_capable_conflict',
      severity: 'warning',
      message: 'Offline-capable readiness is still being phrased too much like total failure in surfaced command text.',
      targets: ['dashboard', 'navigate', 'brief'],
    });
  }

  if (
    operatorTrustMode === 'minimal_advisory'
    && output.secondary.length + output.passive.length >= 5
  ) {
    pushIssue(issues, {
      code: 'minimal_mode_noise',
      severity: 'warning',
      message: 'Minimal Advisory is still surfacing too many secondary or passive recommendation states.',
      targets: TARGETS,
    });
  }

  const highlightedScenarios = ECS_RELEASE_READINESS_SCENARIOS.filter((scenario) => {
    const phaseMatch =
      (output.activePhase == null && scenario.phase === 'none')
      || scenario.phase === output.activePhase;
    const trustMatch = scenario.trustModes.includes(operatorTrustMode);
    return phaseMatch || trustMatch;
  }).slice(0, 6).map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    phase: scenario.phase,
  }));

  const issueCounts = issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { info: 0, warning: 0, error: 0 },
  );

  const overallStatus =
    issueCounts.error > 0
      ? 'blocker'
      : issueCounts.warning > 0
        ? 'watch'
        : 'healthy';
  const masterChecklist = buildMasterReleaseChecklist({
    issues,
    richContext,
    commandDiagnostics,
  });
  const unresolvedRiskSummary = buildReleaseRiskSummary({
    issues,
    commandDiagnostics,
  });

  return {
    generatedAt: Date.now(),
    overallStatus,
    activePhase: output.activePhase ?? null,
    operatorTrustMode,
    issueCounts,
    issues,
    activeRootCount: commandDiagnostics?.rootSnapshots.length ?? 0,
    staleSignalCount: commandDiagnostics?.staleSignals.length ?? 0,
    leadByTarget: commandDiagnostics?.leadByTarget ?? {},
    scenarioCoverage: {
      totalScenarios: ECS_RELEASE_READINESS_SCENARIOS.length,
      highlighted: highlightedScenarios,
      trustModes: ['conservative_guidance', 'balanced_command', 'minimal_advisory'],
    },
    masterChecklist,
    unresolvedRiskSummary,
  };
}
