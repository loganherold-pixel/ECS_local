import type { ECSAIContext } from '../aiContextBuilder';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import { selectOrchestratorTargetView } from './orchestratorSelectors';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';
import type {
  ECSCommandStateDiagnostics,
  ECSCommandStateInvariant,
  ECSCommandStateRootSnapshot,
  ECSOrchestratorCandidate,
  ECSOrchestratorOutput,
  ECSOrchestratorUITarget,
  ECSRootConditionFamily,
} from './orchestratorTypes';

type BuildCommandStateDiagnosticsArgs = {
  output: ECSOrchestratorOutput | null;
  richContext: ECSAIContext | null;
  liveStatus: ECSLiveStatusMap | null | undefined;
  operatorTrustMode: ECSOperatorTrustMode;
  staleSignals?: string[];
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
]);

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string | null | undefined): string {
  return cleanText(value).toLowerCase();
}

function priorityRank(candidate: ECSOrchestratorCandidate | null | undefined): number {
  return candidate?.priority?.rank ?? 1;
}

function isRouteCritical(family: ECSRootConditionFamily | null | undefined): boolean {
  return !!family && ROUTE_CRITICAL_ROOTS.has(family);
}

function pushViolation(
  violations: ECSCommandStateInvariant[],
  nextViolation: ECSCommandStateInvariant,
): void {
  const duplicate = violations.some((violation) => {
    return violation.code === nextViolation.code
      && violation.message === nextViolation.message
      && (violation.rootKey ?? null) === (nextViolation.rootKey ?? null);
  });
  if (!duplicate) {
    violations.push(nextViolation);
  }
}

function collectActiveCandidates(output: ECSOrchestratorOutput): ECSOrchestratorCandidate[] {
  return [
    output.primary ?? null,
    ...output.secondary,
    ...output.passive,
  ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);
}

function buildRootSnapshots(output: ECSOrchestratorOutput): ECSCommandStateRootSnapshot[] {
  const snapshots = new Map<string, ECSCommandStateRootSnapshot>();

  const upsert = (candidate: ECSOrchestratorCandidate, suppressedOnly = false) => {
    const root = candidate.rootCondition;
    if (!root) return;

    const existing = snapshots.get(root.key) ?? {
      key: root.key,
      family: root.family,
      title: candidate.title,
      priorityLevel: candidate.priority?.level ?? null,
      leadTarget: null,
      supportTargets: [],
      suppressedTargets: [],
    };

    const targets: ECSOrchestratorUITarget[] =
      Array.isArray(candidate.uiTargets) && candidate.uiTargets.length > 0
      ? candidate.uiTargets
      : ['dashboard', 'brief'];

    targets.forEach((target) => {
      const role = suppressedOnly
        ? 'suppressed'
        : candidate.targetRoles?.[target] ?? 'support';
      if (role === 'lead') {
        existing.leadTarget = target;
      } else if (role === 'support') {
        if (!existing.supportTargets.includes(target)) {
          existing.supportTargets.push(target);
        }
      } else if (!existing.suppressedTargets.includes(target)) {
        existing.suppressedTargets.push(target);
      }
    });

    snapshots.set(root.key, existing);
  };

  collectActiveCandidates(output).forEach((candidate) => upsert(candidate));
  output.suppressed.forEach((candidate) => upsert(candidate, true));

  return Array.from(snapshots.values());
}

export function buildCommandStateDiagnostics(
  args: BuildCommandStateDiagnosticsArgs,
): ECSCommandStateDiagnostics | null {
  const { output, richContext, liveStatus, operatorTrustMode, staleSignals = [] } = args;
  if (!output) return null;

  const violations: ECSCommandStateInvariant[] = [];
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;
  const rootSnapshots = buildRootSnapshots(output);
  const views = Object.fromEntries(
    TARGETS.map((target) => [target, selectOrchestratorTargetView(output, target)]),
  ) as Record<ECSOrchestratorUITarget, ReturnType<typeof selectOrchestratorTargetView>>;

  const leadByTarget = Object.fromEntries(
    TARGETS.map((target) => [target, views[target].primary?.rootCondition?.key ?? null]),
  ) as ECSCommandStateDiagnostics['leadByTarget'];

  const fleetPrimary = views.fleet.primary;
  if (
    fleetPrimary?.rootCondition?.family
    && isRouteCritical(fleetPrimary.rootCondition.family)
    && output.activePhase !== 'vehicle_setup'
    && output.activePhase !== 'staging'
  ) {
    pushViolation(violations, {
      code: 'fleet_route_urgency_lead',
      severity: 'warning',
      message: 'Fleet is leading a route-critical issue outside readiness-focused phases.',
      rootKey: fleetPrimary.rootCondition.key,
      targets: ['fleet'],
    });
  }

  const explorePrimary = views.explore.primary;
  if (
    routeActive
    && explorePrimary?.rootCondition?.family
    && isRouteCritical(explorePrimary.rootCondition.family)
  ) {
    pushViolation(violations, {
      code: 'explore_route_noise',
      severity: 'warning',
      message: 'Explore is leading route-critical noise while an active route is already in command.',
      rootKey: explorePrimary.rootCondition.key,
      targets: ['explore'],
    });
  }

  const navigatePrimary = views.navigate.primary;
  if (
    navigatePrimary?.rootCondition?.family
    && PLANNING_ROOTS.has(navigatePrimary.rootCondition.family)
    && output.activePhase !== 'vehicle_setup'
    && output.activePhase !== 'staging'
    && output.activePhase !== 'camp_stationary'
  ) {
    pushViolation(violations, {
      code: 'planning_issue_owning_navigate',
      severity: 'warning',
      message: 'Navigate is being led by a planning-oriented issue outside planning-focused phases.',
      rootKey: navigatePrimary.rootCondition.key,
      targets: ['navigate'],
    });
  }

  const alertPrimary = views.alert.primary;
  if (
    routeActive
    && alertPrimary?.rootCondition?.family
    && isRouteCritical(alertPrimary.rootCondition.family)
    && priorityRank(alertPrimary) >= 4
  ) {
    const navigateCandidates = [
      views.navigate.primary,
      ...views.navigate.secondary,
      ...views.navigate.passive,
    ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);
    const navigateHasSameRoot = navigateCandidates.some((candidate) => {
      return candidate.rootCondition?.key === alertPrimary.rootCondition?.key;
    });

    if (!navigateHasSameRoot) {
      pushViolation(violations, {
        code: 'route_issue_missing_from_navigate',
        severity: 'error',
        message: 'Alert is leading a route-critical issue that Navigate is not reflecting.',
        rootKey: alertPrimary.rootCondition.key,
        targets: ['alert', 'navigate'],
      });
    }

    if (
      priorityRank(views.dashboard.primary) < 4
      && views.dashboard.primary?.rootCondition?.key !== alertPrimary.rootCondition.key
    ) {
      pushViolation(violations, {
        code: 'dashboard_alert_priority_drift',
        severity: 'warning',
        message: 'Dashboard primary command state is quieter than the active severe Alert root condition.',
        rootKey: alertPrimary.rootCondition.key,
        targets: ['dashboard', 'alert'],
      });
    }
  }

  const telemetryText = normalizeText(
    [
      views.dashboard.primary?.source === 'telemetry' ? views.dashboard.primary.summary : null,
      views.brief.primary?.source === 'telemetry' ? views.brief.primary.summary : null,
      views.fleet.primary?.source === 'telemetry' ? views.fleet.primary.summary : null,
    ].filter(Boolean).join(' '),
  );
  if (telemetryText) {
    if (
      liveStatus?.telemetry?.status === 'live'
      && /(stored baseline|manual|stale|disconnected|waiting)/i.test(telemetryText)
    ) {
      pushViolation(violations, {
        code: 'telemetry_status_conflict',
        severity: 'error',
        message: 'Telemetry surfaces imply stale or manual data while shared telemetry status is live.',
        targets: ['dashboard', 'fleet', 'brief'],
      });
    }
    if (
      liveStatus?.telemetry?.status !== 'live'
      && /(live provider|live telemetry|connected provider telemetry|live from)/i.test(telemetryText)
    ) {
      pushViolation(violations, {
        code: 'telemetry_status_conflict',
        severity: 'warning',
        message: 'Telemetry surfaces imply live data while shared telemetry status is not live.',
        targets: ['dashboard', 'fleet', 'brief'],
      });
    }
  }

  const weatherText = normalizeText(
    [
      views.dashboard.primary?.source === 'weather' ? views.dashboard.primary.summary : null,
      views.navigate.primary?.source === 'weather' ? views.navigate.primary.summary : null,
      views.brief.primary?.source === 'weather' ? views.brief.primary.summary : null,
    ].filter(Boolean).join(' '),
  );
  if (weatherText) {
    if (
      liveStatus?.weather?.status === 'live'
      && /(stale weather|cached forecast|reduced-confidence)/i.test(weatherText)
    ) {
      pushViolation(violations, {
        code: 'weather_status_conflict',
        severity: 'warning',
        message: 'Weather surfaces imply stale or cached support while shared weather status is live.',
        targets: ['dashboard', 'navigate', 'brief'],
      });
    }
    if (
      liveStatus?.weather?.status !== 'live'
      && /(live weather|current weather|route-aware weather support is current)/i.test(weatherText)
    ) {
      pushViolation(violations, {
        code: 'weather_status_conflict',
        severity: 'warning',
        message: 'Weather surfaces imply live support while shared weather status is degraded or estimated.',
        targets: ['dashboard', 'navigate', 'brief'],
      });
    }
  }

  const readinessText = normalizeText(
    [
      views.dashboard.primary?.source === 'offline_readiness' ? views.dashboard.primary.summary : null,
      views.brief.primary?.source === 'offline_readiness' ? views.brief.primary.summary : null,
      views.navigate.primary?.source === 'offline_readiness' ? views.navigate.primary.summary : null,
    ].filter(Boolean).join(' '),
  );
  if (readinessText) {
    if (
      liveStatus?.readiness?.status === 'offline_capable'
      && /(offline failure|fully offline|service required|unavailable offline)/i.test(readinessText)
    ) {
      pushViolation(violations, {
        code: 'offline_capable_status_conflict',
        severity: 'warning',
        message: 'Offline-capable readiness is being presented too much like total offline failure.',
        targets: ['dashboard', 'navigate', 'brief'],
      });
    }
    if (
      liveStatus?.readiness?.status === 'unavailable'
      && /(offline capable|ready offline)/i.test(readinessText)
    ) {
      pushViolation(violations, {
        code: 'offline_capable_status_conflict',
        severity: 'warning',
        message: 'Offline readiness copy implies offline-capable use while shared readiness is unavailable.',
        targets: ['dashboard', 'navigate', 'brief'],
      });
    }
  }

  const repeatedPrimarySummaries = new Map<string, ECSOrchestratorUITarget[]>();
  TARGETS.forEach((target) => {
    const primary = views[target].primary;
    const summary = normalizeText(primary?.summary);
    if (!summary) return;
    const targets = repeatedPrimarySummaries.get(summary) ?? [];
    targets.push(target);
    repeatedPrimarySummaries.set(summary, targets);
  });

  repeatedPrimarySummaries.forEach((targets, summary) => {
    if (targets.length >= 3) {
      pushViolation(violations, {
        code: 'duplicate_cross_tab_rationale',
        severity: 'info',
        message: `The same primary rationale is repeating across ${targets.join(', ')}.`,
        targets,
      });
    }
  });

  return {
    generatedAt: Date.now(),
    activePhase: output.activePhase ?? null,
    operatorTrustMode,
    leadByTarget,
    rootSnapshots,
    invariantViolations: violations,
    staleSignals,
  };
}
