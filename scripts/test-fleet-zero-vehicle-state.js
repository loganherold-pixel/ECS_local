const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const fleet = read('app', '(tabs)', 'fleet.tsx');
const vehicleSetupStore = read('lib', 'vehicleSetupStore.ts');

includes(
  fleet,
  'type FleetVehicleSelectionState = {',
  'Fleet should define an explicit selection state for active and visible vehicles.',
);
includes(
  fleet,
  'function resolveFleetVehicleSelection(',
  'Fleet should resolve active/visible vehicle state through a guarded helper.',
);
includes(
  fleet,
  'if (vehicles.length === 0) {',
  'Fleet selection helper should handle zero vehicles explicitly.',
);
includes(
  fleet,
  'activeVehicleId: null',
  'Zero-vehicle selection state should null activeVehicleId.',
);
includes(
  fleet,
  'visibleVehicleIndex: 0',
  'Zero-vehicle selection state should safely clamp visible index to 0.',
);
includes(
  fleet,
  'vehicleSetupStore.reconcileActiveVehicle(',
  'Fleet fetch reconciliation should detect and clear stale active vehicle IDs.',
);
includes(
  fleet,
  'reason: storedActiveVehicleId ? \'fleet_reconciliation\' : \'single_vehicle_restore\'',
  'Fleet should clear stale active vehicle context.',
);
includes(
  fleet,
  'autoSelectSingle: true',
  'Fleet should promote the first created vehicle to active.',
);
includes(
  fleet,
  'reconciledActiveVehicleId',
  'Fleet should set the first created vehicle as active.',
);
includes(
  fleet,
  'if (loading || authLoading || vehicles.length > 0) return;',
  'Fleet should have a zero-vehicle recovery effect after hydration.',
);
includes(
  fleet,
  'setVisibleFleetVehicleId((currentId) => (currentId == null ? currentId : null));',
  'Zero-vehicle recovery should clear stale visible vehicle id.',
);
includes(
  fleet,
  'setBuildLoadoutModalVisible(false);',
  'Zero-vehicle recovery should close stale Build & Loadout state.',
);
includes(
  fleet,
  'setWeightSummaryModalVisible(false);',
  'Zero-vehicle recovery should close stale Weight Summary state.',
);
includes(
  fleet,
  'setLoadoutModalVisible(false);',
  'Zero-vehicle recovery should close stale loadout state.',
);
includes(
  fleet,
  'fleetCardModels.length === 0 ?',
  'Fleet should render a current empty state instead of a missing vehicle card.',
);
includes(
  fleet,
  'ECS_STATE_COPY.fleet.noVehiclesConfigured.title',
  'Fleet zero-vehicle state should use the current empty-state copy.',
);
includes(
  fleet,
  'firstRunVccSetupOpenedRef',
  'Fleet zero-vehicle assist should still track whether the current VCC setup path has opened.',
);
includes(
  fleet,
  'const ZERO_VEHICLE_VCC_SETUP_AUTO_OPEN_DELAY_MS =',
  'Fleet zero-vehicle setup assist should use a named dwell delay instead of opening over cold-start QA immediately.',
);
includes(
  fleet,
  'const zeroVehicleVccSetupAutoOpenArmedRef = useRef(false);',
  'Fleet should arm zero-vehicle setup assist on first cold-start visit without opening the modal immediately.',
);
includes(
  fleet,
  'const zeroVehicleVccSetupAutoOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);',
  'Fleet should keep a cancellable timer for delayed zero-vehicle setup assist.',
);
includes(
  fleet,
  'if (!zeroVehicleVccSetupAutoOpenArmedRef.current) {',
  'First zero-vehicle Fleet focus should arm the assist instead of covering the launch screen.',
);
includes(
  fleet,
  'zeroVehicleVccSetupAutoOpenTimerRef.current = setTimeout(() => {',
  'Follow-up zero-vehicle Fleet focus should schedule setup assist after a short dwell.',
);
includes(
  fleet,
  'clearZeroVehicleVccSetupAutoOpenTimer();',
  'Delayed zero-vehicle setup assist should be cancelled when Fleet loses focus or state changes.',
);
includes(
  fleet,
  'let zeroVehicleVccSetupAutoOpenedThisSession = false;',
  'Fleet zero-vehicle setup auto-open should be tracked across shell remounts for the app session.',
);
includes(
  fleet,
  'let zeroVehicleVccSetupDismissedThisSession = false;',
  'Fleet should remember when the user dismisses zero-vehicle setup during the app session.',
);
includes(
  fleet,
  'if (vehicles.length === 0 && !profileModalVehicle) {',
  'Closing the zero-vehicle profile modal should be recognized as a setup dismissal.',
);
includes(
  fleet,
  'zeroVehicleVccSetupDismissedThisSession = true;',
  'Zero-vehicle setup dismissal should suppress automatic reopen on bottom-tab navigation.',
);
includes(
  fleet,
  'if (zeroVehicleVccSetupAutoOpenedThisSession || zeroVehicleVccSetupDismissedThisSession) return;',
  'Fleet should not auto-reopen zero-vehicle setup after it already opened or was dismissed in this app session.',
);
includes(
  fleet,
  'zeroVehicleVccSetupDismissedThisSession = false;',
  'Explicit Add Vehicle actions should be able to reopen the setup modal after dismissal.',
);
includes(
  fleet,
  'const isFleetFocused = useIsFocused() && isFleetRouteActive;',
  'Fleet should combine navigation focus with route-path focus before opening or rendering native modal layers.',
);
includes(
  fleet,
  'const pathname = usePathname();',
  'Fleet should read the active Expo Router path because the custom shell can keep Fleet focused while another tab is visible.',
);
includes(
  fleet,
  "const isFleetRouteActive = pathname === '/fleet' || pathname === '/(tabs)/fleet' || pathname.endsWith('/fleet');",
  'Fleet modal visibility should be gated by the actual active Fleet route path.',
);
includes(
  fleet,
  'if (!isFleetFocused || loading || authLoading || vehicles.length > 0 || profileModalVisible) {',
  'Fleet zero-vehicle auto-open should be gated to the active Fleet route.',
);
includes(
  fleet,
  'visible={isFleetFocused && profileModalVisible}',
  'Fleet profile modal should not stay visible over Explore or Navigate after tab changes.',
);
includes(
  fleet,
  'visible={isFleetFocused && loadoutModalVisible}',
  'Fleet loadout modal should be hidden when Fleet is not the active tab.',
);
includes(
  fleet,
  'visible={isFleetFocused && weightSummaryModalVisible}',
  'Fleet weight summary modal should be hidden when Fleet is not the active tab.',
);
assert.ok(
  /useFocusEffect\(useCallback\(\(\) => \{\s*return \(\) => \{\s*closeFleetDetailFlows\(\);\s*\};\s*\}, \[closeFleetDetailFlows\]\)\);/.test(fleet),
  'Fleet should close zero-vehicle/profile modal state when leaving Fleet so other mobile tabs remain reachable.',
);
const visibleEmptyStateStart = fleet.indexOf('fleetCardModels.length === 0 ? (');
assert.ok(visibleEmptyStateStart >= 0, 'Fleet should render the current zero-vehicle branch.');
const visibleEmptyStateEnd = fleet.indexOf(') : (', visibleEmptyStateStart);
assert.ok(visibleEmptyStateEnd > visibleEmptyStateStart, 'Fleet zero-vehicle branch should have a current card fallback.');
const visibleEmptyState = fleet.slice(visibleEmptyStateStart, visibleEmptyStateEnd);
notIncludes(
  visibleEmptyState,
  'actionLabel={ECS_STATE_COPY.fleet.noVehiclesConfigured.ctaLabel}',
  'Visible zero-vehicle card area should not duplicate the VCC Add Vehicle action.',
);
notIncludes(
  fleet,
  "pathname: '/setup'",
  'Fleet zero-vehicle state must not route into the retired /setup framework.',
);
notIncludes(
  fleet,
  "pathname: '/(tabs)/vehicle-config'",
  'Fleet zero-vehicle state must not route into the retired vehicle-config framework.',
);
includes(
  vehicleSetupStore,
  'if (previousVehicleId === normalizedNext) return false;',
  'Active vehicle writes should be idempotent.',
);
includes(
  vehicleSetupStore,
  'return transitionActiveVehicle(null, reason);',
  'Active vehicle clears should be idempotent.',
);

console.log('Fleet zero-vehicle state checks passed.');
