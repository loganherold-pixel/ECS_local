const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dispatchPath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const liveEventsPath = path.join(process.cwd(), 'lib/dispatchLiveEvents.ts');
const storePath = path.join(process.cwd(), 'lib/dispatchEventStore.ts');
const realtimePath = path.join(process.cwd(), 'lib/dispatchRealtimeAdapter.ts');

const dispatchSource = fs.readFileSync(dispatchPath, 'utf8');
const liveEventsSource = fs.readFileSync(liveEventsPath, 'utf8');
const storeSource = fs.readFileSync(storePath, 'utf8');
const realtimeSource = fs.readFileSync(realtimePath, 'utf8');

assert.match(
  liveEventsSource,
  /export type DispatchEventSyncState =[\s\S]*'queued'[\s\S]*'sending'[\s\S]*'sent'[\s\S]*'failed'[\s\S]*'received'/,
  'Dispatch events should expose explicit sync states for recovery CAD visibility.',
);
assert.match(
  liveEventsSource,
  /syncState\?: DispatchEventSyncState/,
  'DispatchEvent payloads should include optional syncState metadata.',
);

assert.match(
  realtimeSource,
  /\| 'cad_event_upsert'/,
  'Dispatch realtime envelopes should support generic CAD event upserts.',
);
assert.match(
  realtimeSource,
  /\| \{ type: 'cad_event_upsert'; cadEvent: DispatchEvent \}/,
  'CAD realtime envelopes should carry the full DispatchEvent payload.',
);
assert.match(
  realtimeSource,
  /case 'cad_event_upsert':[\s\S]*event\.cadEvent\.dedupeKey \?\? event\.cadEvent\.id/,
  'CAD realtime envelope IDs should be stable across retry attempts.',
);

assert.match(
  storeSource,
  /upsertEvent\(rawEvent: unknown\): DispatchEvent \| null/,
  'Dispatch event store should upsert sync-state changes without duplicating events.',
);
assert.match(
  storeSource,
  /if \(existingIndex >= 0\)[\s\S]*currentEvent\.id === event\.id \? event : currentEvent/,
  'Dispatch event store should replace same-ID events during sync-state updates.',
);

assert.match(
  dispatchSource,
  /function isRecoveryCadEventInAuthorizedContext/,
  'Dispatch should gate recovery CAD sharing through an authorization helper.',
);
assert.match(
  dispatchSource,
  /event\.teamId === team\.id/,
  'Recovery CAD visibility should support matching active team context.',
);
assert.match(
  dispatchSource,
  /event\.teamId !== convoyContext\.convoyId/,
  'Recovery CAD visibility should support matching active convoy context.',
);
assert.match(
  dispatchSource,
  /sessionIds\.includes\(event\.sessionId\)/,
  'Recovery CAD visibility should require matching expedition session context.',
);
assert.match(
  dispatchSource,
  /isAuthorizedRecoveryCadMember\(teamSnapshot, identity, convoyContext\)/,
  'Recovery CAD visibility should require an authorized team or convoy member identity.',
);
assert.match(
  dispatchSource,
  /memberUserIds\.includes\(identity\.userId\)/,
  'Recovery CAD convoy visibility should require roster membership.',
);
assert.match(
  dispatchSource,
  /recoveryCadSharingEnabled = externalDispatchIntegrationEnabled \|\| Boolean\(activeConvoyControl\?\.convoyId\)/,
  'Recovery CAD sharing should stay enabled for active convoys even without external dispatch integration.',
);
assert.match(
  dispatchSource,
  /!isValidCoordinate\(event\.location\)/,
  'Recovery CAD events without valid coordinates should not be shared as location-bearing events.',
);

assert.match(
  dispatchSource,
  /createDispatchRealtimeSession\({[\s\S]*onEvent: \(envelope\) =>/,
  'Dispatch should subscribe to recovery CAD realtime events.',
);
assert.match(
  dispatchSource,
  /if \(envelope\.type !== 'cad_event_upsert'\)/,
  'Dispatch should only import CAD upserts through the CAD visibility path.',
);
assert.match(
  dispatchSource,
  /syncState: 'received'/,
  'Received recovery CAD events should be marked as team events.',
);
assert.match(
  dispatchSource,
  /dispatchEventStore\.upsertEvent\(incomingEvent\)/,
  'Authorized incoming recovery CAD events should be inserted through idempotent upsert.',
);

assert.match(
  dispatchSource,
  /const publishRecoveryCadEvent = useCallback/,
  'Dispatch should publish locally-created recovery CAD events when realtime is available.',
);
assert.match(
  dispatchSource,
  /type: 'cad_event_upsert'[\s\S]*cadEvent: \{[\s\S]*syncState: 'received'/,
  'Published recovery CAD events should arrive as received team events on other clients.',
);
assert.match(
  dispatchSource,
  /syncState: sent \? 'sent' : 'failed'/,
  'Publish results should mark recovery CAD events sent or failed without pretending team delivery.',
);
assert.match(
  dispatchSource,
  /RECOVERY_CAD_RETRY_COOLDOWN_MS/,
  'Failed recovery CAD sync retry should be guarded against tight retry loops.',
);
assert.match(
  dispatchSource,
  /event\.syncState === 'queued' \|\| event\.syncState === 'failed'/,
  'Queued or failed recovery CAD events should be eligible for app-process retry.',
);

assert.match(
  dispatchSource,
  /function getRecoveryCadSyncLabel/,
  'Recovery CAD feed/detail should expose visible sync-state labels.',
);
assert.match(
  dispatchSource,
  /label="Team Sync"/,
  'Recovery CAD detail should show team sync state.',
);
assert.match(
  dispatchSource,
  /styles\.recoverySyncLabel/,
  'Recovery CAD feed rows should show compact sync state.',
);

console.log('Dispatch recovery CAD team visibility checks passed.');
