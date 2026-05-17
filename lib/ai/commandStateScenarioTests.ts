import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import type { ECSOrchestratorUITarget } from './orchestratorTypes';

export type ECSCommandStateScenarioExpectation = {
  leadTargets: Partial<Record<ECSOrchestratorUITarget, string>>;
  suppressedTargets?: Partial<Record<ECSOrchestratorUITarget, string[]>>;
  notes: string[];
};

export type ECSCommandStateScenario = {
  id: string;
  label: string;
  phase: ECSExpeditionPhase | 'none';
  expectation: ECSCommandStateScenarioExpectation;
};

export const ECS_COMMAND_STATE_RELEASE_SCENARIOS: ECSCommandStateScenario[] = [
  {
    id: 'manual-baseline-online-no-expedition',
    label: 'No expedition / manual-only baseline / online',
    phase: 'none',
    expectation: {
      leadTargets: {
        dashboard: 'offline_capable_operation',
        brief: 'offline_capable_operation',
      },
      suppressedTargets: {
        navigate: ['planning_recommendation'],
      },
      notes: [
        'Explore should stay passive.',
        'Fleet should remain readiness-oriented without route urgency.',
      ],
    },
  },
  {
    id: 'staging-partial-offline-readiness',
    label: 'Staging with partial offline readiness',
    phase: 'staging',
    expectation: {
      leadTargets: {
        fleet: 'mission_planning_readiness',
        dashboard: 'offline_capable_operation',
        brief: 'mission_planning_readiness',
      },
      suppressedTargets: {
        navigate: ['planning_recommendation'],
      },
      notes: [
        'Offline readiness should not be mislabeled as full failure.',
        'Planning actions should surface without Alert dominance.',
      ],
    },
  },
  {
    id: 'transit-healthy-guidance',
    label: 'Transit with active guidance and healthy connectivity',
    phase: 'transit',
    expectation: {
      leadTargets: {
        navigate: 'route_risk_elevation',
        dashboard: 'route_risk_elevation',
      },
      suppressedTargets: {
        explore: ['planning_recommendation'],
      },
      notes: [
        'Alert should stay quiet unless severity rises.',
      ],
    },
  },
  {
    id: 'active-expedition-tightening-fuel',
    label: 'Active expedition with rising remoteness and tightening fuel margin',
    phase: 'active_expedition',
    expectation: {
      leadTargets: {
        navigate: 'resource_margin_decline',
        alert: 'resource_margin_decline',
        dashboard: 'resource_margin_decline',
      },
      suppressedTargets: {
        fleet: ['resource_margin_decline'],
      },
      notes: [
        'Route viability and resource posture should not split into separate loud warnings.',
      ],
    },
  },
  {
    id: 'active-expedition-stale-weather-ble',
    label: 'Active expedition with stale weather and degraded BLE',
    phase: 'active_expedition',
    expectation: {
      leadTargets: {
        navigate: 'weather_route_exposure',
        dashboard: 'telemetry_disconnect',
      },
      suppressedTargets: {
        explore: ['stale_weather_support'],
      },
      notes: [
        'Telemetry degradation should stay calmer than route-critical weather exposure.',
      ],
    },
  },
  {
    id: 'camp-overnight-weather-risk',
    label: 'Camp/stationary with overnight weather risk',
    phase: 'camp_stationary',
    expectation: {
      leadTargets: {
        dashboard: 'weather_route_exposure',
        brief: 'mission_planning_readiness',
      },
      suppressedTargets: {
        navigate: ['mission_planning_readiness'],
      },
      notes: [
        'Planning and next-day readiness may return, but not as route-turn clutter.',
      ],
    },
  },
  {
    id: 'recovery-exit-weak-gps',
    label: 'Recovery/exit with weak GPS and partial cached support',
    phase: 'recovery_exit',
    expectation: {
      leadTargets: {
        navigate: 'gps_guidance_degradation',
        alert: 'gps_guidance_degradation',
      },
      suppressedTargets: {
        explore: ['planning_recommendation'],
      },
      notes: [
        'Exit posture should keep Navigate and Alert aligned.',
      ],
    },
  },
  {
    id: 'explore-incomplete-vehicle-baseline',
    label: 'Explore planning with incomplete vehicle baseline',
    phase: 'staging',
    expectation: {
      leadTargets: {
        fleet: 'vehicle_readiness_gap',
        explore: 'planning_recommendation',
      },
      suppressedTargets: {
        navigate: ['vehicle_readiness_gap'],
      },
      notes: [
        'Planning guidance can inform Explore, but Fleet should own the readiness gap.',
      ],
    },
  },
  {
    id: 'syncing-during-active-navigation',
    label: 'Top-banner/profile sync in progress during active navigation',
    phase: 'transit',
    expectation: {
      leadTargets: {
        navigate: 'route_risk_elevation',
        dashboard: 'route_risk_elevation',
      },
      suppressedTargets: {
        alert: ['degraded_operations'],
      },
      notes: [
        'Sync should stay compact in status surfaces and not outrank route command state.',
      ],
    },
  },
];

export function summarizeCommandStateScenarioCoverage() {
  return {
    scenarioCount: ECS_COMMAND_STATE_RELEASE_SCENARIOS.length,
    phases: Array.from(new Set(ECS_COMMAND_STATE_RELEASE_SCENARIOS.map((scenario) => scenario.phase))),
    targetCount: Array.from(
      new Set(
        ECS_COMMAND_STATE_RELEASE_SCENARIOS.flatMap((scenario) => Object.keys(scenario.expectation.leadTargets)),
      ),
    ).length,
  };
}
