const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const androidAuto = read('lib', 'androidAutoBridge.ts');
const sharedGps = read('lib', 'sharedGPSLocation.ts');
const gpsUi = read('lib', 'gpsUIState.ts');
const connectivity = read('lib', 'connectivity.ts');
const connectivityIntel = read('lib', 'connectivityIntelService.ts');
const timeline = read('lib', 'timelineIntelligenceEngine.ts');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const dispatch = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const pkg = JSON.parse(read('package.json'));

assert.ok(
  androidAuto.includes('if (_isConnected) {') &&
    androidAuto.includes('DISCONNECTED_PROBE_INTERVAL_MS') &&
    androidAuto.includes('BACKGROUND_DISCONNECTED_PROBE_INTERVAL_MS'),
  'Android Auto must reserve data and action timers for a confirmed connection.',
);
assert.ok(
  androidAuto.includes('if (!_isRunning || !_isConnected) return;') &&
    androidAuto.includes('_reconcileRuntimeTimers();'),
  'Android Auto pushes must be connection-gated and reconcile timers on lifecycle changes.',
);
assert.strictEqual(
  androidAuto.includes('const DATA_PUSH_INTERVAL_MS = 2_000'),
  false,
  'Android Auto must not retain the old two-second full-state heartbeat.',
);

assert.ok(
  sharedGps.includes("import { AppState, Platform, type AppStateStatus } from 'react-native';") &&
    sharedGps.includes('if (!this.isAppForeground()) return null;'),
  'The shared native GPS watcher must stop while the app is inactive or backgrounded.',
);
assert.ok(
  sharedGps.includes('BALANCED_DISTANCE_INTERVAL_M = 20') &&
    sharedGps.includes('BALANCED_TIME_INTERVAL_MS = 10_000') &&
    sharedGps.includes('HIGH_ACCURACY_TIME_INTERVAL_MS = 1_500'),
  'Shared GPS should use separate navigation and balanced sampling budgets.',
);

assert.strictEqual(
  gpsUi.includes('setInterval('),
  false,
  'GPS UI throttling must be demand-driven instead of waking every second while idle.',
);
assert.ok(
  gpsUi.includes('private scheduleFlush(): void') && gpsUi.includes('setTimeout(() =>'),
  'GPS UI throttling should schedule only pending raw updates.',
);

assert.ok(
  connectivity.includes('private _handleAppStateChange') &&
    connectivity.includes('this._stopPolling();') &&
    connectivity.includes('this._stopOnlineCheck();') &&
    connectivity.includes('if (!this._isAppForeground()) {'),
  'Reachability pings must suspend outside the foreground and refresh on resume.',
);
assert.strictEqual(
  connectivityIntel.includes('BACKGROUND_POLL_INTERVAL_MS'),
  false,
  'Connectivity intelligence must not keep a background network polling timer.',
);
assert.ok(
  connectivityIntel.includes('_stopNormalPolling();') &&
    connectivityIntel.includes('_stopStaleChecking();'),
  'Connectivity intelligence must suspend both update and stale-check clocks in background.',
);

assert.ok(
  navigate.includes('highAccuracy: false,') &&
    navigate.includes('if (!isFocused || !activeNavigationRunning) return undefined;') &&
    navigate.includes('return sharedGPSLocationStore.acquire({') &&
    navigate.includes('highAccuracy: true,'),
  'Navigate should use balanced idle GPS and promote to navigation accuracy only during guidance.',
);
assert.ok(
  navigate.includes('const operationalWeather = useOperationalWeather({\n  enabled: isFocused,') &&
    navigate.includes('useRemoteWeatherRouteWatcher({ enabled: isFocused });'),
  'Navigate weather refresh work must be scoped to the visible tab.',
);
assert.ok(
  dispatch.includes('if (!isDispatchFocused || !recoveryCadSharingEnabled'),
  'Dispatch backend polling must stop when the Dispatch tab is hidden.',
);
assert.ok(
  timeline.includes("AppState.addEventListener('change', handleAppStateChange)") &&
    timeline.includes('stopMonitorTimer();'),
  'Expedition timeline monitoring must pause its clock while the app is backgrounded.',
);
assert.ok(
  pkg.scripts['test:mobile-battery-lifecycle'],
  'package.json should expose the mobile battery lifecycle regression test.',
);

console.log('Mobile battery lifecycle checks passed.');
