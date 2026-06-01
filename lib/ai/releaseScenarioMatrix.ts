import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';
import type { ECSOrchestratorUITarget, ECSRootConditionFamily } from './orchestratorTypes';

export type ECSReleaseScenario = {
  id: string;
  label: string;
  phase: ECSExpeditionPhase | 'none';
  trustModes: ECSOperatorTrustMode[];
  focusTargets: ECSOrchestratorUITarget[];
  expectedRoots: ECSRootConditionFamily[];
  notes: string[];
};

export const ECS_RELEASE_READINESS_SCENARIOS: ECSReleaseScenario[] = [
  {
    id: 'manual-baseline-no-expedition',
    label: 'No active expedition with manual-only baseline',
    phase: 'none',
    trustModes: ['balanced_command', 'minimal_advisory'],
    focusTargets: ['dashboard', 'brief', 'fleet'],
    expectedRoots: ['offline_capable_operation'],
    notes: [
      'Dashboard and Brief should stay calm.',
      'Fleet should remain readiness-oriented without route urgency.',
    ],
  },
  {
    id: 'staging-incomplete-offline-prep',
    label: 'Staging with incomplete offline preparation',
    phase: 'staging',
    trustModes: ['balanced_command', 'conservative_guidance'],
    focusTargets: ['fleet', 'dashboard', 'brief'],
    expectedRoots: ['mission_planning_readiness', 'offline_capable_operation'],
    notes: [
      'Planning actions should surface without Alert dominance.',
    ],
  },
  {
    id: 'transit-healthy-route-guidance',
    label: 'Transit with healthy route guidance',
    phase: 'transit',
    trustModes: ['balanced_command', 'minimal_advisory'],
    focusTargets: ['navigate', 'dashboard'],
    expectedRoots: ['route_risk_elevation'],
    notes: [
      'Sync and passive discovery chatter should stay secondary.',
    ],
  },
  {
    id: 'trail-entry-rising-route-risk',
    label: 'Trail entry with rising route risk',
    phase: 'trail_entry',
    trustModes: ['balanced_command', 'conservative_guidance'],
    focusTargets: ['navigate', 'alert', 'dashboard'],
    expectedRoots: ['route_risk_elevation', 'weather_route_exposure'],
    notes: [
      'Navigate should own the lead command state.',
    ],
  },
  {
    id: 'active-expedition-tightening-fuel-margin',
    label: 'Active expedition with tightening fuel margin',
    phase: 'active_expedition',
    trustModes: ['balanced_command', 'conservative_guidance'],
    focusTargets: ['navigate', 'alert', 'dashboard', 'brief'],
    expectedRoots: ['resource_margin_decline', 'bailout_relevance'],
    notes: [
      'Resource posture and viability should remain fused.',
    ],
  },
  {
    id: 'active-expedition-degraded-ble',
    label: 'Active expedition with degraded BLE telemetry',
    phase: 'active_expedition',
    trustModes: ['balanced_command', 'minimal_advisory'],
    focusTargets: ['dashboard', 'brief', 'fleet'],
    expectedRoots: ['telemetry_disconnect'],
    notes: [
      'Telemetry degradation should not outrank route-critical guidance.',
    ],
  },
  {
    id: 'stale-weather-healthy-route-guidance',
    label: 'Stale weather with otherwise healthy route guidance',
    phase: 'transit',
    trustModes: ['balanced_command', 'minimal_advisory'],
    focusTargets: ['navigate', 'dashboard', 'brief'],
    expectedRoots: ['weather_route_exposure', 'stale_weather_support'],
    notes: [
      'Weather support should soften confidence without collapsing route guidance.',
    ],
  },
  {
    id: 'camp-overnight-weather-and-power',
    label: 'Camp stationary with overnight weather and power relevance',
    phase: 'camp_stationary',
    trustModes: ['balanced_command', 'conservative_guidance'],
    focusTargets: ['dashboard', 'brief'],
    expectedRoots: ['mission_planning_readiness', 'weather_route_exposure'],
    notes: [
      'Next-day planning should return without turning into route-turn clutter.',
    ],
  },
  {
    id: 'recovery-exit-weak-gps-bailout',
    label: 'Recovery exit with weak GPS and bailout relevance',
    phase: 'recovery_exit',
    trustModes: ['balanced_command', 'conservative_guidance'],
    focusTargets: ['navigate', 'alert', 'dashboard'],
    expectedRoots: ['gps_guidance_degradation', 'bailout_relevance'],
    notes: [
      'Exit posture should keep Navigate and Alert aligned.',
    ],
  },
  {
    id: 'explore-incomplete-vehicle-baseline',
    label: 'Explore planning with incomplete vehicle baseline',
    phase: 'staging',
    trustModes: ['balanced_command', 'minimal_advisory'],
    focusTargets: ['explore', 'fleet', 'dashboard'],
    expectedRoots: ['planning_recommendation', 'vehicle_readiness_gap'],
    notes: [
      'Fleet should own the readiness gap even when Explore is surfacing planning value.',
    ],
  },
  {
    id: 'admin-access-clean-production-flow',
    label: 'Admin access while normal flows remain clean',
    phase: 'none',
    trustModes: ['balanced_command'],
    focusTargets: ['fleet', 'dashboard', 'brief'],
    expectedRoots: ['offline_capable_operation'],
    notes: [
      'Admin-only tools must remain isolated from the ordinary user command surfaces.',
    ],
  },
  {
    id: 'privileged-access-poor-connectivity',
    label: 'Privileged access restore under poor connectivity',
    phase: 'staging',
    trustModes: ['balanced_command'],
    focusTargets: ['dashboard', 'brief'],
    expectedRoots: ['offline_capable_operation', 'mission_planning_readiness'],
    notes: [
      'Friends-and-family and admin restore should stay calm when service is poor.',
    ],
  },
  {
    id: 'minimal-advisory-active-navigation',
    label: 'Minimal Advisory during active navigation',
    phase: 'transit',
    trustModes: ['minimal_advisory'],
    focusTargets: ['navigate', 'dashboard'],
    expectedRoots: ['route_risk_elevation'],
    notes: [
      'Low-priority recommendation chatter should stay quieter without hiding serious warnings.',
    ],
  },
];

export function summarizeReleaseScenarioMatrix() {
  return {
    totalScenarios: ECS_RELEASE_READINESS_SCENARIOS.length,
    phases: Array.from(
      new Set(ECS_RELEASE_READINESS_SCENARIOS.map((scenario) => scenario.phase)),
    ),
    trustModes: Array.from(
      new Set(ECS_RELEASE_READINESS_SCENARIOS.flatMap((scenario) => scenario.trustModes)),
    ),
  };
}
