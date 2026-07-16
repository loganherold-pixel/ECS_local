const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs
  .readFileSync(path.join(root, ...parts), 'utf8')
  .replace(/\r\n/g, '\n');

const fleet = read('app', '(tabs)', 'fleet.tsx');
const widgetChrome = read('components', 'dashboard', 'WidgetChrome.tsx');
const surfaceTokens = read('lib', 'ecsSurfaceTokens.ts');

const failedFleetStateIndex = fleet.indexOf('title="Fleet data unavailable"');
const validEmptyFleetStateIndex = fleet.indexOf('ECS_STATE_COPY.fleet.noVehiclesConfigured.title');

assert.ok(
  fleet.includes("safeCode: 'FLEET_DATA_LOAD_FAILED'") &&
    fleet.includes('setFleetLoadFailure({ safeCode: \'FLEET_DATA_LOAD_FAILED\' })') &&
    fleet.includes('actionLabel="Retry Fleet"') &&
    fleet.includes('onAction={() => { void fetchVehicles(); }}'),
  'Fleet load failures should expose a safe terminal state with a real, deduplicated retry path.',
);
assert.ok(
  failedFleetStateIndex >= 0 &&
    validEmptyFleetStateIndex >= 0 &&
    failedFleetStateIndex < validEmptyFleetStateIndex,
  'Fleet load failure must be decided before the valid no-vehicles empty state.',
);
assert.ok(
  fleet.includes('if (loading || authLoading || fleetLoadFailure) return;') &&
    fleet.includes('if (!isFleetFocused || loading || authLoading || fleetLoadFailure || vehicles.length > 0 || profileModalVisible)') &&
    fleet.includes('if (loading || fleetLoadFailure) return;'),
  'Failed Fleet hydration must not clear authoritative selection, arm first-run setup, or close restored detail flows.',
);
assert.ok(
  fleet.includes('label="Refreshing Fleet Data..."') &&
    fleet.includes('Last saved vehicle data remains visible while ECS checks for updates.'),
  'Fleet refresh should retain and explicitly label last-good vehicle data.',
);

assert.ok(
  fleet.includes('itemCount: null') &&
    fleet.includes('totalWeight: null') &&
    fleet.includes("syncStatus: 'LOADING'") &&
    fleet.includes("? { ...current, syncStatus: 'STALE' }") &&
    fleet.includes("{ itemCount: null, totalWeight: null, syncStatus: 'UNAVAILABLE' }") &&
    fleet.includes("summary.itemCount ?? '--'") &&
    fleet.includes("summary.totalWeight == null ? '--'"),
  'Loadout summary failures should preserve last-good values or show unknown, never fabricate authoritative zeros.',
);
assert.ok(
  !fleet.includes("setSummary({ itemCount: 0, totalWeight: 0, syncStatus: 'NOT STAGED' });\n        setTrackedLoadoutId(null);\n      }\n    } catch"),
  'The legacy loadout failure-to-empty transition should be removed.',
);

for (const token of [
  "secondary: 'rgba(11,14,18,0.90)'",
  "compact: 'rgba(11,14,18,0.86)'",
  "quiet: 'rgba(11,14,18,0.80)'",
  "selected: 'rgba(35,29,12,0.92)'",
  "warning: 'rgba(35,12,11,0.88)'",
]) {
  assert.ok(surfaceTokens.includes(token), `Shared ECS surfaces should use a readable tactical scrim: ${token}.`);
}
assert.ok(
  widgetChrome.includes('<View pointerEvents="none" style={styles.instrumentContrastLayer} />') &&
    widgetChrome.includes("backgroundColor: 'rgba(8,12,15,0.90)'") &&
    widgetChrome.includes('accessibilityRole="progressbar"') &&
    widgetChrome.includes('accessibilityState={{ busy: true }}') &&
    widgetChrome.includes('accessibilityLiveRegion="polite"') &&
    widgetChrome.includes('<ActivityIndicator size="small" color={TACTICAL.amber} />'),
  'Dashboard widget states should remain readable and announce an explicit named loading state.',
);

console.log('[fleet-dashboard-ui-state-truth] Fleet and Dashboard state presentation contract passed');
