import type { ConfiguredVehiclePresence } from '../vehiclePresence';

export const CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT = {
  scope: 'dev_test_read_only_setup_preflight',
  protectedRoute: '/convoy-command',
  requiredBaseline: [
    'authenticated_user',
    'setup_completion_flag',
    'configured_vehicle',
    'clean_convoy_baseline',
  ],
  forbiddenActions: [
    'create_convoy',
    'join_convoy',
    'publish_location',
    'mutate_fleet',
    'mutate_active_trip',
    'mutate_packet',
    'touch_telemetry',
    'unlock_badge',
  ],
} as const;

export type ConvoyQaSetupEligibilityStatus = 'ready' | 'blocked' | 'incomplete';

export type ConvoyQaSetupEligibilityCode =
  | 'convoy_command_reachable'
  | 'auth_required'
  | 'setup_incomplete'
  | 'configured_vehicle_missing'
  | 'protected_route_not_reachable'
  | 'convoy_baseline_not_clean';

export type ConvoyQaSetupEligibilityInput = {
  authenticated: boolean;
  setupCompletionFlag: boolean;
  setupComplete: boolean;
  vehiclePresence: ConfiguredVehiclePresence;
  activeConvoyId?: string | null;
  liveSharingActive?: boolean | null;
  pendingInviteOrJoinState?: boolean | null;
};

export type ConvoyQaSetupEligibilityDiagnostic = {
  status: ConvoyQaSetupEligibilityStatus;
  code: ConvoyQaSetupEligibilityCode;
  convoyCommandReachable: boolean;
  setupComplete: 'yes' | 'no';
  setupCompletionFlag: 'yes' | 'no';
  hasConfiguredVehicle: 'yes' | 'no';
  activeVehiclePresent: 'yes' | 'no';
  setupVehiclePresent: 'yes' | 'no';
  fleetProfileCount: string;
  cleanConvoyBaseline: 'yes' | 'no';
  missingRequirement: string;
  requiredActions: string[];
  notes: string[];
};

function yesNo(value: boolean): 'yes' | 'no' {
  return value ? 'yes' : 'no';
}

function buildBaseDiagnostic(
  input: ConvoyQaSetupEligibilityInput,
): Omit<ConvoyQaSetupEligibilityDiagnostic, 'status' | 'code' | 'convoyCommandReachable' | 'missingRequirement' | 'requiredActions'> {
  const cleanConvoyBaseline =
    !input.activeConvoyId && !input.liveSharingActive && !input.pendingInviteOrJoinState;
  const notes: string[] = [];

  if (input.vehiclePresence.hasConfiguredVehicle && !input.vehiclePresence.activeVehicleExists) {
    notes.push('Active vehicle selection is recommended before the live Convoy QA run.');
  }

  return {
    setupComplete: yesNo(input.setupComplete),
    setupCompletionFlag: yesNo(input.setupCompletionFlag),
    hasConfiguredVehicle: yesNo(input.vehiclePresence.hasConfiguredVehicle),
    activeVehiclePresent: yesNo(input.vehiclePresence.activeVehicleExists),
    setupVehiclePresent: yesNo(input.vehiclePresence.setupVehicleExists),
    fleetProfileCount: String(input.vehiclePresence.localVehicleCount),
    cleanConvoyBaseline: yesNo(cleanConvoyBaseline),
    notes,
  };
}

export function evaluateConvoyQaSetupEligibility(
  input: ConvoyQaSetupEligibilityInput,
): ConvoyQaSetupEligibilityDiagnostic {
  const base = buildBaseDiagnostic(input);
  const cleanConvoyBaseline = base.cleanConvoyBaseline === 'yes';

  if (!input.authenticated) {
    return {
      ...base,
      status: 'incomplete',
      code: 'auth_required',
      convoyCommandReachable: false,
      missingRequirement: 'Sign in as the Device B QA Member account before checking Convoy Command.',
      requiredActions: ['Sign in to the QA Member account using the existing app auth flow.'],
    };
  }

  if (!input.setupCompletionFlag) {
    return {
      ...base,
      status: 'blocked',
      code: 'setup_incomplete',
      convoyCommandReachable: false,
      missingRequirement: 'Complete Fleet/Profile setup before opening Convoy Command.',
      requiredActions: [
        'Complete the Fleet Profile setup flow on Device B.',
        'Confirm at least one local Fleet profile is saved.',
      ],
    };
  }

  if (!input.vehiclePresence.hasConfiguredVehicle) {
    return {
      ...base,
      status: 'blocked',
      code: 'configured_vehicle_missing',
      convoyCommandReachable: false,
      missingRequirement: 'A configured Fleet profile is required before Convoy Command is reachable.',
      requiredActions: [
        'Create or complete one Device B Fleet profile through the normal setup flow.',
        'Do not bypass setup or create Convoy membership for this preflight.',
      ],
    };
  }

  if (!input.setupComplete) {
    return {
      ...base,
      status: 'blocked',
      code: 'protected_route_not_reachable',
      convoyCommandReachable: false,
      missingRequirement: 'Protected shell setup eligibility is not complete yet.',
      requiredActions: ['Reopen Fleet/Profile setup and finish any required setup step.'],
    };
  }

  if (!cleanConvoyBaseline) {
    return {
      ...base,
      status: 'blocked',
      code: 'convoy_baseline_not_clean',
      convoyCommandReachable: false,
      missingRequirement: 'Clear active Convoy, live sharing, or pending invite/join state before true QA.',
      requiredActions: [
        'Stop sharing if it is active.',
        'Leave or clear any active QA convoy state.',
        'Confirm no pending invite or join state remains.',
      ],
    };
  }

  return {
    ...base,
    status: 'ready',
    code: 'convoy_command_reachable',
    convoyCommandReachable: true,
    missingRequirement: 'none',
    requiredActions: ['Open Convoy Command and confirm the no-active-convoy baseline before creating any QA convoy.'],
  };
}

function hasLegacySetupCompletionCandidate(): boolean {
  const { vehicleSpecStore } = require('../vehicleSpecStore') as typeof import('../vehicleSpecStore');
  const { vehicleStore } = require('../vehicleStore') as typeof import('../vehicleStore');
  const firstSpec = vehicleSpecStore.getFirst();
  if (!firstSpec) return false;
  return Boolean(
    firstSpec.spec.gvwr_lb > 0 &&
      firstSpec.spec.base_weight_lb > 0 &&
      vehicleStore.getById(firstSpec.vehicleId),
  );
}

export async function buildLocalConvoyQaSetupEligibility(params: {
  authenticated: boolean;
  activeConvoyId?: string | null;
  liveSharingActive?: boolean | null;
  pendingInviteOrJoinState?: boolean | null;
}): Promise<ConvoyQaSetupEligibilityDiagnostic> {
  const { setupStore } = require('../setupStore') as typeof import('../setupStore');
  const { vehicleSetupStore } = require('../vehicleSetupStore') as typeof import('../vehicleSetupStore');
  const { resolveConfiguredVehiclePresence } = require('../vehiclePresence') as typeof import('../vehiclePresence');
  const { vehicleSpecStore } = require('../vehicleSpecStore') as typeof import('../vehicleSpecStore');
  const { vehicleStore } = require('../vehicleStore') as typeof import('../vehicleStore');

  await Promise.all([
    setupStore.waitForHydration(),
    vehicleSetupStore.waitForHydration(),
    vehicleStore.waitForHydration(),
    vehicleSpecStore.waitForHydration(),
  ]);

  const vehiclePresence = resolveConfiguredVehiclePresence();
  const setupCompletionFlag = setupStore.getCompletionFlag() || hasLegacySetupCompletionCandidate();
  const setupNeedsVehicleRecovery = setupCompletionFlag && !vehiclePresence.hasConfiguredVehicle;
  const setupComplete = setupCompletionFlag && !setupNeedsVehicleRecovery;

  return evaluateConvoyQaSetupEligibility({
    authenticated: params.authenticated,
    setupCompletionFlag,
    setupComplete,
    vehiclePresence,
    activeConvoyId: params.activeConvoyId ?? null,
    liveSharingActive: params.liveSharingActive ?? false,
    pendingInviteOrJoinState: params.pendingInviteOrJoinState ?? false,
  });
}
