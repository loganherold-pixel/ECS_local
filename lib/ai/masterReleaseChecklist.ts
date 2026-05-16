import type { ECSAIContext } from '../aiContextBuilder';
import type { ECSCommandStateDiagnostics, ECSReleaseReadinessIssue } from './orchestratorTypes';
import type {
  ECSReleaseChecklistSection,
  ECSReleaseChecklistStatus,
} from './releasePolishAuditTypes';

function hasIssue(
  issues: ECSReleaseReadinessIssue[],
  code: ECSReleaseReadinessIssue['code'],
): boolean {
  return issues.some((issue) => issue.code === code);
}

function inferStatus(params: {
  issues: ECSReleaseReadinessIssue[];
  blockerCodes?: ECSReleaseReadinessIssue['code'][];
  watchCodes?: ECSReleaseReadinessIssue['code'][];
  extraBlocker?: boolean;
  extraWatch?: boolean;
}): ECSReleaseChecklistStatus {
  const { issues, blockerCodes = [], watchCodes = [], extraBlocker = false, extraWatch = false } = params;
  if (extraBlocker || blockerCodes.some((code) => hasIssue(issues, code))) return 'blocker';
  if (extraWatch || watchCodes.some((code) => hasIssue(issues, code))) return 'watch';
  return 'healthy';
}

export function buildMasterReleaseChecklist(args: {
  issues: ECSReleaseReadinessIssue[];
  richContext: ECSAIContext | null;
  commandDiagnostics: ECSCommandStateDiagnostics | null;
}): ECSReleaseChecklistSection[] {
  const { issues, richContext, commandDiagnostics } = args;
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;
  const staleSignals = commandDiagnostics?.staleSignals.length ?? 0;
  const infoViolations =
    commandDiagnostics?.invariantViolations.filter((violation) => violation.severity === 'info').length ?? 0;
  const lowerDataCompleteness = (richContext?.meta.dataCompleteness ?? 100) < 65;

  return [
    {
      id: 'fleet_surface',
      label: 'Fleet',
      status: inferStatus({
        issues,
        blockerCodes: ['cross_tab_blockers'],
        watchCodes: ['planning_phase_ownership_gap'],
        extraWatch: commandDiagnostics?.invariantViolations.some((violation) => violation.code === 'fleet_route_urgency_lead') ?? false,
      }),
      notes: [
        'Readiness hierarchy should stay local to setup and planning phases.',
        'Route-critical urgency should not take over Fleet outside readiness-focused contexts.',
      ],
    },
    {
      id: 'navigate_surface',
      label: 'Navigate',
      status: inferStatus({
        issues,
        blockerCodes: ['route_lead_gap', 'cross_tab_blockers'],
        watchCodes: ['offline_capable_conflict'],
        extraWatch: routeActive && staleSignals > 0,
      }),
      notes: [
        'Route-first ownership remains mandatory for severe route-critical issues.',
        'Offline-capable guidance should stay calm and non-failure-oriented.',
      ],
    },
    {
      id: 'dashboard_surface',
      label: 'Dashboard',
      status: inferStatus({
        issues,
        blockerCodes: ['cross_tab_blockers'],
        watchCodes: ['cross_tab_warning_cluster', 'stale_signal_churn'],
      }),
      notes: [
        'Dashboard should summarize command state without repeating full alert language.',
        'Compact and expanded states should remain hierarchy-driven and calm.',
      ],
    },
    {
      id: 'explore_surface',
      label: 'Explore',
      status: inferStatus({
        issues,
        blockerCodes: ['cross_tab_blockers'],
        extraWatch: commandDiagnostics?.invariantViolations.some((violation) => violation.code === 'explore_route_noise') ?? false,
      }),
      notes: [
        'Hidden Gems and Popular Trails should stay curated and planning-oriented.',
        'Active-route noise should stay out of Explore unless truly planning-relevant.',
      ],
    },
    {
      id: 'alert_surface',
      label: 'Alert',
      status: inferStatus({
        issues,
        blockerCodes: ['route_lead_gap', 'cross_tab_blockers'],
      }),
      notes: [
        'Severity-led grouping should remain disciplined.',
        'Alert should coordinate with Navigate instead of rediscovering route-critical issues separately.',
      ],
    },
    {
      id: 'brief_surface',
      label: 'ECS Brief',
      status: inferStatus({
        issues,
        watchCodes: ['cross_tab_warning_cluster', 'stale_signal_churn'],
        extraWatch: infoViolations >= 2,
      }),
      notes: [
        'Brief should stay concise, phase-aware, and free of repeated rationale.',
        'Supporting command voice should not restate primary Dashboard or Alert ownership verbatim.',
      ],
    },
    {
      id: 'expedition_readiness_command_brief',
      label: 'Expedition Readiness / Command Brief',
      status: inferStatus({
        issues,
        blockerCodes: [
          'expedition_readiness_category_gap',
          'expedition_readiness_score_integrity',
          'expedition_readiness_status_contradiction',
          'expedition_readiness_unsafe_wording',
          'expedition_readiness_weather_freshness_gap',
          'expedition_readiness_vehicle_truth_gap',
          'expedition_readiness_offline_truth_gap',
        ],
        watchCodes: ['expedition_readiness_synthetic_truth_gap', 'stale_signal_churn', 'cross_tab_warning_cluster'],
        extraBlocker: issues.some((issue) => (
          issue.code === 'expedition_readiness_synthetic_truth_gap' && issue.severity === 'error'
        )),
      }),
      notes: [
        'Data grounding, Score integrity, Missing data handling, Legal/camp confidence wording, Vehicle-aware behavior.',
        'Offline readiness accuracy, Weather freshness, Route preview integration, Active guidance integration, Command Brief behavior.',
        'Dashboard widget behavior, Alert/Dispatch integration, AI/ECS Intelligence grounding, Android layout safety, No mock data presented as live.',
      ],
    },
    {
      id: 'dispersed_camping_eligibility',
      label: 'Dispersed Camping Eligibility',
      status: inferStatus({
        issues,
        blockerCodes: [
          'dispersed_camping_copy_guardrail_gap',
          'dispersed_camping_classification_guardrail_gap',
          'dispersed_camping_overlay_lifecycle_gap',
          'dispersed_camping_candidate_generation_gap',
          'dispersed_camping_data_freshness_gap',
          'dispersed_camping_beta_flag_gap',
        ],
      }),
      notes: [
        'Eligibility wording only: verify local rules, closures, fire restrictions, permits, and posted signs.',
        'Classifier must never mark private, tribal, military, known-closure, or restricted regions high/medium.',
        'Navigate overlay lifecycle, WebView layer ordering, route summary, ECS-Inferred pins, stale/offline labels, and explicit Scout action stay beta-gated.',
      ],
    },
    {
      id: 'shell_surface',
      label: 'Top Banner / Profile Shell',
      status: inferStatus({
        issues,
        watchCodes: ['offline_capable_conflict'],
      }),
      notes: [
        'Top banner should stay compact and status-oriented.',
        'Profile/account surfaces should remain coherent without billing clutter leaking into command surfaces.',
      ],
    },
    {
      id: 'shared_command_stack',
      label: 'Shared Command Stack',
      status: inferStatus({
        issues,
        blockerCodes: ['cross_tab_blockers', 'route_lead_gap'],
        watchCodes: ['missing_lead_target', 'cross_tab_warning_cluster'],
      }),
      notes: [
        'Confidence, degraded-state, suppression, and phase semantics must stay aligned across tabs.',
        'Lead/support ownership should remain deterministic under trust-mode changes.',
      ],
    },
    {
      id: 'shell_restore',
      label: 'Shell / Restore',
      status: inferStatus({
        issues,
        blockerCodes: ['cross_tab_blockers'],
        extraWatch: lowerDataCompleteness,
      }),
      notes: [
        'First-run, returning-user restore, access validation, and shell restore should stay coordinated.',
        'Route restore should not run before auth/offline access and setup state are valid.',
      ],
    },
    {
      id: 'degraded_offline',
      label: 'Degraded / Offline',
      status: inferStatus({
        issues,
        watchCodes: ['offline_capable_conflict', 'stale_signal_churn'],
      }),
      notes: [
        'Offline-capable should not read like failure.',
        'Cached route, stale weather, and provider fallback behavior should remain honest and useful.',
      ],
    },
    {
      id: 'visual_layout',
      label: 'Visual / Layout',
      status: staleSignals >= 8 ? 'watch' : 'healthy',
      notes: [
        'Final smoke test should still check clipped content, tablet scaling, overlay bounds, and shell symmetry.',
      ],
    },
    {
      id: 'advisory_noise',
      label: 'Recommendation Noise',
      status: inferStatus({
        issues,
        watchCodes: ['minimal_mode_noise', 'cross_tab_warning_cluster'],
        extraWatch: infoViolations >= 3,
      }),
      notes: [
        'Low-value advisory chatter should stay suppressed across Dashboard, Brief, Explore, and top-banner surfaces.',
      ],
    },
    {
      id: 'wording',
      label: 'Production Wording',
      status: inferStatus({
        issues,
        watchCodes: ['offline_capable_conflict'],
        extraWatch: infoViolations >= 2,
      }),
      notes: [
        'User-facing wording should remain concise, tactical, and non-repetitive.',
      ],
    },
    {
      id: 'admin_cleanliness',
      label: 'Admin / Internal Cleanliness',
      status: hasIssue(issues, 'cross_tab_blockers') ? 'watch' : 'healthy',
      notes: [
        'Admin diagnostics should stay internal and should not leak into standard or friends-and-family flows.',
      ],
    },
  ];
}
