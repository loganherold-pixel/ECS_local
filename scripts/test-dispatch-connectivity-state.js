const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const { resolveCanonicalConnectivityState } = loadTypeScriptModule('lib/connectivityState.ts');
const { getTeamSyncState } = loadTypeScriptModule('lib/teamStore.ts');
const { buildLiveDispatchEvents } = loadTypeScriptModule('lib/dispatchLiveAggregator.ts');

function captureLogs(fn) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((arg) => (
      arg && typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    )).join(' '));
  };
  try {
    return { value: fn(), logs };
  } finally {
    console.log = originalLog;
  }
}

const noTeam = { activeTeam: null, members: [], updatedAt: null };
const activeTeam = {
  activeTeam: { id: 'team-1', name: 'Ridge Team', ownerId: 'user-1' },
  members: [{ id: 'member-1', teamId: 'team-1', userId: 'user-1', role: 'owner' }],
  updatedAt: '2026-04-26T12:00:00.000Z',
};

const online = resolveCanonicalConnectivityState({
  isOnline: true,
  offlineMode: false,
  syncStatus: 'synced',
  connectivityStatus: 'online',
});
assert.strictEqual(online.networkOnline, true, 'networkOnline should reflect the live online state');
assert.strictEqual(online.userForcedOfflineMode, false, 'persistedOfflineMode=false should not become forced offline');
assert.strictEqual(online.effectiveOfflineMode, false, 'online + not forced offline should not be effective offline');
assert.strictEqual(online.syncAvailable, true, 'online synced state should be dispatch-sync available');
assert.strictEqual(online.reason, 'online_ready');

const onlineNoTeam = getTeamSyncState({
  isOnline: true,
  offlineMode: false,
  syncStatus: 'synced',
  snapshot: noTeam,
});
assert.strictEqual(onlineNoTeam.label, 'No active team', 'online/no-team must not be reported as sync unavailable');
assert.strictEqual(onlineNoTeam.reason, 'no_team');
assert.strictEqual(onlineNoTeam.syncAvailable, true);

const forcedOffline = getTeamSyncState({
  isOnline: true,
  offlineMode: true,
  syncStatus: 'synced',
  snapshot: activeTeam,
});
assert.strictEqual(forcedOffline.label, 'Offline mode active');
assert.strictEqual(forcedOffline.reason, 'forced_offline');
assert.strictEqual(forcedOffline.syncAvailable, false);

const networkOffline = getTeamSyncState({
  isOnline: false,
  offlineMode: false,
  syncStatus: 'offline',
  snapshot: activeTeam,
});
assert.strictEqual(networkOffline.label, 'Team sync unavailable');
assert.strictEqual(networkOffline.reason, 'network_offline');
assert.strictEqual(networkOffline.syncAvailable, false);

const onlineNoTeamEvents = captureLogs(() => buildLiveDispatchEvents({
  syncState: {
    isOnline: true,
    offlineMode: false,
    syncStatus: 'synced',
    queuedCount: 0,
    dirtyCount: 0,
    connectivity: {
      status: 'online',
      level: 'normal',
      isOnline: true,
      isInternetReachable: true,
      lastOfflineAt: null,
      initialized: true,
    },
  },
  teamState: noTeam,
}));
assert.strictEqual(
  onlineNoTeamEvents.value.some((event) => event.id === 'live-sync-offline'),
  false,
  'No active team should not emit live-sync-offline.',
);
assert.strictEqual(
  onlineNoTeamEvents.logs.some((line) => line.includes('sync_state') || line.includes('[DISPATCH_WIRE]')),
  false,
  'No active team with no events should not log no-op Dispatch wire state by default.',
);

const repeatedOnlineNoTeamEvents = captureLogs(() => buildLiveDispatchEvents({
  syncState: {
    isOnline: true,
    offlineMode: false,
    syncStatus: 'synced',
    queuedCount: 0,
    dirtyCount: 0,
    connectivity: {
      status: 'online',
      level: 'normal',
      isOnline: true,
      isInternetReachable: true,
      lastOfflineAt: null,
      initialized: true,
    },
  },
  teamState: noTeam,
}));
assert.strictEqual(
  repeatedOnlineNoTeamEvents.value,
  onlineNoTeamEvents.value,
  'Repeated no-team Dispatch input should reuse the previous event array.',
);
assert.strictEqual(
  repeatedOnlineNoTeamEvents.logs.some((line) => line.includes('sync_state reason= no_team')),
  false,
  'Repeated no-team Dispatch input should not log another sync_state cycle.',
);

const offlineTeamEvents = buildLiveDispatchEvents({
  syncState: {
    isOnline: false,
    offlineMode: false,
    syncStatus: 'offline',
    queuedCount: 0,
    dirtyCount: 0,
    connectivity: {
      status: 'offline',
      level: 'no_service',
      isOnline: false,
      isInternetReachable: false,
      lastOfflineAt: '2026-04-26T12:00:00.000Z',
      initialized: true,
    },
  },
  teamState: activeTeam,
});
assert(
  offlineTeamEvents.some((event) => event.id === 'live-sync-offline'),
  'Network-offline active team should emit live-sync-offline.',
);

console.log('Dispatch connectivity state checks passed.');
