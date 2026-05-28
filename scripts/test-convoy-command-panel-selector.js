const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;

const {
  NO_ACTIVE_CONVOY_COMMAND_PANEL_VIEW_MODEL,
  formatConvoyDistanceMiles,
  selectConvoyCommandPanelViewModel,
} = require(path.join(repoRoot, 'lib/convoy/convoyCommandSelectors.ts'));

const nowMs = Date.parse('2026-05-17T12:00:00.000Z');
const fresh = new Date(nowMs - 2 * 60 * 1000);
const stale = new Date(nowMs - 60 * 60 * 1000);

const noActive = selectConvoyCommandPanelViewModel({ nowMs });
assert.deepStrictEqual(noActive, NO_ACTIVE_CONVOY_COMMAND_PANEL_VIEW_MODEL);
assert.strictEqual(noActive.visualState, 'offline');
assert.strictEqual(noActive.statusLabel, 'OFFLINE');
assert.strictEqual(noActive.isUsingLiveData, false);
assert.strictEqual(noActive.lostUnitIndex, -1);
assert.strictEqual(noActive.alertText, null);

const liveCommandData = {
  mode: 'live',
  dataState: 'live',
  convoyName: 'Field Team',
  convoySize: 2,
  activeRouteId: null,
  rallyPoint: null,
  regroupDistance: null,
  channelLabel: 'Comms check-in current',
  members: [
    {
      id: 'lead',
      displayName: 'Lead',
      role: 'lead',
      vehicleName: 'Vehicle not assigned',
      status: 'online',
      lastPingAt: fresh,
      lastCheckInAt: null,
      spacingFromPrevious: 0,
      distanceFromRoute: null,
      isCurrentUser: false,
    },
    {
      id: 'tail',
      displayName: 'Tail',
      role: 'sweep',
      vehicleName: 'Vehicle not assigned',
      status: 'checkedIn',
      lastPingAt: fresh,
      lastCheckInAt: null,
      spacingFromPrevious: 1.4,
      distanceFromRoute: null,
      isCurrentUser: false,
    },
  ],
  averageSpacing: null,
  delayedCount: 0,
  offlineCount: 0,
  emergencyCount: 0,
  recommendationLabel: 'CONVOY STABLE',
  recommendationReason: 'Live convoy sharing is active.',
  missingInputs: [],
  lastUpdatedAt: fresh,
  confidenceLabel: 'Live sharing confidence',
  sourceLabel: 'Live convoy sharing',
  isOffline: false,
  usesLiveTracking: true,
};

const live = selectConvoyCommandPanelViewModel({
  nowMs,
  commandData: liveCommandData,
});
assert.strictEqual(live.visualState, 'live');
assert.strictEqual(live.statusLabel, 'LIVE');
assert.strictEqual(live.vehicleCount, 2);
assert.strictEqual(live.reportingCount, 2);
assert.strictEqual(live.widestGapMiles, 1.4);
assert.strictEqual(live.cautionLevel, 0);
assert.strictEqual(live.isUsingLiveData, true);

const alert = selectConvoyCommandPanelViewModel({
  nowMs,
  commandData: {
    ...liveCommandData,
    dataState: 'live',
    convoyName: 'Field Team',
    members: [
      {
        id: 'lead',
        displayName: 'Lead',
        role: 'lead',
        vehicleName: 'Vehicle not assigned',
        status: 'online',
        lastPingAt: fresh,
        lastCheckInAt: null,
        spacingFromPrevious: 0,
        distanceFromRoute: null,
        isCurrentUser: false,
      },
      {
        id: 'tail',
        displayName: 'Tail',
        role: 'sweep',
        vehicleName: 'Vehicle not assigned',
        status: 'offline',
        lastPingAt: stale,
        lastCheckInAt: null,
        spacingFromPrevious: 6.2,
        distanceFromRoute: null,
        isCurrentUser: false,
      },
    ],
    offlineCount: 1,
    recommendationLabel: 'CHECK COMMS CHANNEL',
    lastUpdatedAt: fresh,
    isOffline: false,
    usesLiveTracking: true,
  },
});
assert.strictEqual(alert.visualState, 'alert');
assert.strictEqual(alert.statusLabel, 'ALERT');
assert.strictEqual(alert.lostUnitIndex, 1);
assert.strictEqual(alert.cautionLevel, 1);
assert.strictEqual(alert.regroupSuggested, true);
assert.strictEqual(alert.alertText, 'Signal lost: Tail last seen 60 min ago');
assert.strictEqual(alert.members[1].isLostSignal, true);
assert.strictEqual(alert.members[1].role, 'tail');

const estimated = selectConvoyCommandPanelViewModel({
  nowMs,
  commandData: {
    ...liveCommandData,
    mode: 'planned',
    dataState: 'planned',
    usesLiveTracking: false,
    sourceLabel: 'Manual convoy plan',
  },
});
assert.strictEqual(estimated.visualState, 'estimated');
assert.strictEqual(estimated.statusLabel, 'ESTIMATED');
assert.strictEqual(estimated.isUsingLiveData, false);

assert.strictEqual(formatConvoyDistanceMiles(null), null);
assert.strictEqual(formatConvoyDistanceMiles(Number.NaN), null);
assert.strictEqual(formatConvoyDistanceMiles(-1), null);
assert.strictEqual(formatConvoyDistanceMiles(0), '0 ft');
assert.strictEqual(formatConvoyDistanceMiles(0.02), '106 ft');
assert.strictEqual(formatConvoyDistanceMiles(0.24), '1267 ft');
assert.strictEqual(formatConvoyDistanceMiles(0.26), '0.25 mi');
assert.strictEqual(formatConvoyDistanceMiles(0.62), '0.5 mi');
assert.strictEqual(formatConvoyDistanceMiles(0.88), '1 mi');
assert.strictEqual(formatConvoyDistanceMiles(1.24), '1.2 mi');
assert.strictEqual(formatConvoyDistanceMiles(12.6), '13 mi');
assert.strictEqual(formatConvoyDistanceMiles(128.4), '128 mi');

const selectorSource = fs.readFileSync(path.join(repoRoot, 'lib/convoy/convoyCommandSelectors.ts'), 'utf8');
assert(!selectorSource.includes('mock'), 'Convoy command selector must not wire mock data into production output.');
assert(!selectorSource.includes('fixture'), 'Convoy command selector must not wire fixture data into production output.');

console.log('[convoy-command-panel-selector] safe default, live, alert, estimated, and distance checks passed');
