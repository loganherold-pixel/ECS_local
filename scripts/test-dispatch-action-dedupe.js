const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScript(mod, filename) {
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
}

require.extensions['.ts'] = compileTypeScript;

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

const { dispatchEventStore } = loadTypeScriptModule('lib/dispatchEventStore.ts');
const {
  createDispatchEventDedupeKey,
  isDuplicateDispatchEvent,
} = loadTypeScriptModule('lib/dispatchEventDedupe.ts');

const originalLog = console.log;
const originalWarn = console.warn;
const logMessages = [];
console.log = (...args) => {
  logMessages.push(args.map((arg) => (
    arg && typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  )).join(' '));
};
console.warn = () => {};

function baseEvent(overrides = {}) {
  return {
    id: `event-${Math.random()}`,
    timestamp: '2026-04-25T20:00:00Z',
    type: 'team_ping',
    severity: 'watch',
    title: 'Check-In Ping',
    message: 'Hold position at waypoint alpha.',
    source: 'team_member',
    createdBy: {
      userId: 'operator-1',
      displayName: 'Operator One',
    },
    ...overrides,
  };
}

try {
  dispatchEventStore.clear();

  const firstPing = dispatchEventStore.appendEvent(baseEvent({
    id: 'ping-1',
    dedupeKey: 'ping:waypoint-alpha:operator-1',
  }));
  const secondPing = dispatchEventStore.appendEvent(baseEvent({
    id: 'ping-2',
    dedupeKey: 'ping:waypoint-alpha:operator-1',
  }));

  assert.ok(firstPing, 'First ping should be accepted.');
  assert.strictEqual(secondPing, null, 'Double-click ping should be suppressed.');
  assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'CAD feed should contain one ping line.');

  dispatchEventStore.clear();
  const requestPayload = {
    type: 'assistance',
    severity: 'warning',
    title: 'Assist Request: washout',
    message: 'Assist requested from threat drilldown.',
    dedupeKey: 'request-assist:event-washout:operator-1',
    targetEventId: 'event-washout',
  };
  dispatchEventStore.appendEvent(baseEvent({ id: 'request-1', ...requestPayload }));
  dispatchEventStore.appendEvent(baseEvent({ id: 'request-2', ...requestPayload }));
  dispatchEventStore.appendEvent(baseEvent({ id: 'request-3', ...requestPayload }));
  assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'Triple-click request should create one CAD line.');

  dispatchEventStore.appendEvent(baseEvent({
    id: 'mark-1',
    type: 'terrain',
    severity: 'warning',
    title: 'Hazard Marked: washout',
    message: 'Marked hazard on washout.',
    dedupeKey: 'mark-hazard:event-washout:operator-1',
    targetEventId: 'event-washout',
  }));
  assert.strictEqual(dispatchEventStore.getSnapshot().length, 2, 'Different action types on the same item should remain separate.');

  const fallbackA = baseEvent({
    id: 'fallback-a',
    dedupeKey: undefined,
    location: { latitude: 39.123456, longitude: -120.654321 },
  });
  const fallbackB = baseEvent({
    id: 'fallback-b',
    dedupeKey: undefined,
    createdAt: '2026-04-25T20:00:05.000Z',
    location: { latitude: 39.123456, longitude: -120.654321 },
  });
  assert.strictEqual(
    isDuplicateDispatchEvent(
      dispatchEventStore.appendEvent(fallbackA),
      fallbackB,
    ),
    true,
    'Fallback fingerprint should catch same action and coordinate inside the accidental tap window.',
  );
  assert.ok(createDispatchEventDedupeKey(fallbackB).includes('39.12346,-120.65432'));

  dispatchEventStore.clear();
  logMessages.length = 0;
  const offlineSyncEvent = {
    id: 'live-sync-offline',
    timestamp: '2026-04-25T20:00:00.000Z',
    type: 'sync',
    severity: 'warning',
    title: 'Dispatch Sync Offline',
    message: 'Live sync unavailable. ECS is using local state.',
    source: 'sync_state',
    requiresMapDrilldown: false,
  };
  dispatchEventStore.replaceLiveDispatchEvents([offlineSyncEvent]);
  assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'Active sync offline event should appear once.');
  assert.strictEqual(
    logMessages.filter(line => line.includes('event_validated') && line.includes('live-sync-offline')).length,
    1,
    'Initial fixed-id sync event should validate once.',
  );
  const firstCreatedAt = dispatchEventStore.getSnapshot()[0].createdAt;

  const sameLiveArrayRef = [offlineSyncEvent];
  dispatchEventStore.replaceLiveDispatchEvents(sameLiveArrayRef);
  const validationCountBeforeSameRef = logMessages.filter(line => line.includes('event_validated') && line.includes('live-sync-offline')).length;
  dispatchEventStore.replaceLiveDispatchEvents(sameLiveArrayRef);
  assert.strictEqual(
    logMessages.filter(line => line.includes('event_validated') && line.includes('live-sync-offline')).length,
    validationCountBeforeSameRef,
    'Repeated identical live event array references should skip validation/dedupe work.',
  );

  dispatchEventStore.replaceLiveDispatchEvents([{
    ...offlineSyncEvent,
    timestamp: '2026-04-25T20:00:30.000Z',
  }]);
  assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'Repeated fixed-id sync event should not duplicate.');
  assert.strictEqual(
    dispatchEventStore.getSnapshot()[0].createdAt,
    firstCreatedAt,
    'Timestamp-only churn should preserve the existing fixed-id sync event.',
  );
  assert.strictEqual(
    logMessages.filter(line => line.includes('event_validated') && line.includes('live-sync-offline')).length,
    1,
    'Unchanged fixed-id sync event should not be revalidated on every render.',
  );

  dispatchEventStore.replaceLiveDispatchEvents([{
    ...offlineSyncEvent,
    timestamp: '2026-04-25T20:01:00.000Z',
    message: '3 dispatch or app changes queued until service returns.',
  }]);
  assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'Changed fixed-id sync event should upsert by id.');
  assert.strictEqual(
    dispatchEventStore.getSnapshot()[0].message,
    '3 dispatch or app changes queued until service returns.',
    'Fixed-id sync event should update when its body changes.',
  );
  assert.strictEqual(
    logMessages.filter(line => line.includes('event_validated') && line.includes('live-sync-offline')).length,
    2,
    'Changed fixed-id sync event should validate once for the meaningful update.',
  );

  dispatchEventStore.replaceLiveDispatchEvents([]);
  assert.strictEqual(dispatchEventStore.getSnapshot().length, 0, 'Resolved sync state should remove live-sync-offline.');

  const commandCenterSource = fs.readFileSync(path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'), 'utf8');
  assert.ok(commandCenterSource.includes('setActiveCommand(null);'), 'Successful command submit should close the action view.');
  assert.ok(commandCenterSource.includes('setMoreVisible(false);'), 'Successful More action submit should close the More panel.');
  assert.ok(commandCenterSource.includes('setDrilldownEventId(null);'), 'Successful threat action submit should return to the dispatch center.');
  assert.ok(commandCenterSource.includes('Already submitted.'), 'Duplicate action attempts should show the existing subtle confirmation pattern.');
  assert.ok(commandCenterSource.includes('recoveryAssistSubmittingRef'), 'Recovery Assist should be locked against double taps before state settles.');
  assert.ok(commandCenterSource.includes('isActiveLiveDispatchEvent(event)'), 'Active live Dispatch events should remain visible even if stale dismissed UI metadata exists.');

  console.log = originalLog;
  console.warn = originalWarn;
  console.log('Dispatch action dedupe checks passed.');
} finally {
  console.log = originalLog;
  console.warn = originalWarn;
}
